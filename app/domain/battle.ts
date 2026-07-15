// The engine-independent battle-state boundary.
//
// A BattleState owns the full deterministic simulation for one level: wave
// scheduling, enemy movement along the compiled trail, defender placement and
// Mana cost, ranged combat, path-blocking brambles, Heartwood leakage, and the
// win/loss outcome. It has no knowledge of Phaser, the DOM, or any renderer —
// the UI subscribes to the observable snapshot and draws from it.
//
// Determinism: a fixed 1/60 s timestep and a fully derived spawn schedule mean
// the same CompiledLevel + the same defender placements always produce the same
// outcome, frame for frame.

import { PathCurve } from './path';
import { getDefender, getEnemy } from './content';
import { scoreStars as scoreStarsRule, type BattleScoreInput } from './scoring';
import type { CompiledLevel, DefenderStats, Ring } from './types';

export const STEP = 1 / 60;

export type Phase = 'planning' | 'running' | 'won' | 'lost';
export type Outcome = 'victory' | 'defeat' | null;

export interface BattleConfig {
  level: CompiledLevel;
  /** Override starting Mana (tests / cheats). Defaults to the level's value. */
  startingMana?: number;
  /** Passive Mana regeneration per simulated second. Defaults to 0. */
  manaRegenPerSec?: number;
}

export interface PlacedDefender {
  ringId: string;
  typeId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  range: number;
  damage: number;
  cooldown: number;
  cooldownMax: number;
  blocksPath: boolean;
  poisonDps: number;
  poisonDuration: number;
  armorPierce: number;
  dead: boolean;
}

export interface ActiveEnemy {
  typeId: string;
  s: number;
  pathProgress: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  bounty: number;
  armor: number;
  attackInterval: number;
  attackTimer: number;
  poisonTime: number;
  poisonDps: number;
  dead: boolean;
  reached: boolean;
  /** Ring id of a blocking bramble this enemy is currently chewing through. */
  blockedBy: string | null;
}

export interface ProjectileView {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  born: number;
  ttl: number;
}

export interface BattleSnapshot {
  phase: Phase;
  outcome: Outcome;
  mana: number;
  hearts: number;
  maxHearts: number;
  /** 1-based number of the wave currently spawning/running; 0 before the first. */
  waveNumber: number;
  totalWaves: number;
  waveActive: boolean;
  selectedDefenderType: string;
  paused: boolean;
  defenderCount: number;
  enemyCount: number;
  /** Enemies leaked past the Heartwood so far. */
  leaked: number;
  /** Whether the most recent placement is still within its 4-second undo window. */
  canUndo: boolean;
  /** Combined 1–3 star result (0 until a victory is recorded). */
  stars: number;
}

interface ScheduledSpawn {
  type: string;
  at: number;
  wave: number;
}

const PROJECTILE_TTL = 0.22;
const REMOVE_REFUND = 0.7;
// On-path brambles block movement; enemies chip them until they fall.
const BRAMBLE_CHIP_DAMAGE = 8;
const BLOCKER_PROXIMITY = 48;
// A freshly planted Defender stays fully refundable for this many seconds of
// battle time. Measured on the battle clock, so Pause / planning freeze it —
// the Guardian's thinking time can never burn the undo window (issue #22 AC6).
const UNDO_WINDOW = 4;

export class BattleState {
  readonly level: CompiledLevel;
  readonly path: PathCurve;
  readonly rings: ReadonlyArray<Ring>;

  phase: Phase = 'planning';
  outcome: Outcome = null;
  paused = false;

  mana: number;
  hearts: number;
  readonly maxHearts: number;
  private readonly manaRegenPerSec: number;

  selectedDefenderType: string = 'sprig-sentinel';

  defenders: PlacedDefender[] = [];
  enemies: ActiveEnemy[] = [];
  projectiles: ProjectileView[] = [];

  // Economy totals that feed the combined star result (issue #29 AC2). manaSpent
  // is NET: a full undo reverses it, while a 70% uproot keeps the 30% loss.
  manaSpent = 0;
  resourcesCollected = 0;

  private schedule: ScheduledSpawn[] = [];
  private nextSpawn = 0;
  private battleClock = 0;
  private currentWave = 0;
  leaked = 0;
  private projectileSeq = 1;
  // The most recent placement, tracked so a tap can be fully undone within the
  // UNDO_WINDOW. A later placement replaces it; a manual uproot clears it.
  private lastPlacement: { ringId: string; typeId: string; cost: number; placedAt: number } | null =
    null;

  constructor(config: BattleConfig) {
    this.level = config.level;
    const compiledPath = config.level.paths[0];
    if (!compiledPath) throw new Error(`Level ${config.level.id} has no path`);
    this.path = new PathCurve(compiledPath);
    this.rings = config.level.rings ?? [];
    this.maxHearts = config.level.maxHearts ?? 5;
    this.hearts = this.maxHearts;
    this.mana = config.startingMana ?? config.level.startingMana ?? 150;
    this.manaRegenPerSec = config.manaRegenPerSec ?? 0;
    this.schedule = buildSchedule(config.level);
  }

  // --- Commands ---------------------------------------------------------

  /** Begin wave dispatch. No-op unless still in planning. */
  start(): void {
    if (this.phase === 'planning') this.phase = 'running';
  }

  setPaused(paused: boolean): void {
    if (this.phase === 'running') this.paused = paused;
  }

  selectDefender(typeId: string): void {
    if (getDefender(typeId)) this.selectedDefenderType = typeId;
  }

  /**
   * Plant the snapshotted (or currently-selected) defender on a fairy ring.
   * The explicit typeId lets the caller commit the exact tool captured at
   * touch-down, so a second thumb changing the selection mid-gesture can never
   * buy the wrong defender (issue #22 AC5). Honours Mana cost, ring occupancy,
   * and placement compatibility; a failed attempt spends nothing.
   */
  placeDefender(
    ringId: string,
    typeId: string = this.selectedDefenderType,
  ): { ok: true; defender: PlacedDefender } | { ok: false; reason: string } {
    const check = this.validatePlacement(ringId, typeId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const { ring, stats } = check;

    this.mana -= stats.cost;
    this.manaSpent += stats.cost;
    const defender = makeDefender(ring, stats);
    this.defenders.push(defender);
    this.lastPlacement = { ringId, typeId: stats.id, cost: stats.cost, placedAt: this.battleClock };
    return { ok: true, defender };
  }

  /**
   * Preview whether placeDefender would succeed, without spending or planting.
   * Drives the selection affordance (compatible rings) and the placement ghost,
   * and lets the UI explain a problem without an unintended purchase.
   */
  canPlaceDefender(
    ringId: string,
    typeId: string = this.selectedDefenderType,
  ): { ok: true } | { ok: false; reason: string } {
    const check = this.validatePlacement(ringId, typeId);
    return check.ok ? { ok: true } : { ok: false, reason: check.reason };
  }

  /**
   * Fully refund and remove the most recent placement, but only within the
   * UNDO_WINDOW of battle time. Works with touch, mouse, pen, and keyboard
   * because it is a plain state command the UI binds to any input (issue #22 AC6).
   */
  undoLastPlacement(): { ok: true; refund: number } | { ok: false; reason: string } {
    const last = this.lastPlacement;
    if (!last) return { ok: false, reason: 'nothing-to-undo' };
    if (this.battleClock - last.placedAt > UNDO_WINDOW) return { ok: false, reason: 'undo-expired' };
    const idx = this.defenders.findIndex((d) => d.ringId === last.ringId && !d.dead);
    if (idx === -1) {
      // The placed defender is already gone (e.g. destroyed in combat); nothing
      // remains to undo.
      this.lastPlacement = null;
      return { ok: false, reason: 'nothing-to-undo' };
    }
    this.defenders.splice(idx, 1);
    this.mana += last.cost; // full refund, not the 70% uproot rate
    this.manaSpent = Math.max(0, this.manaSpent - last.cost); // a full undo reverses the spend
    this.lastPlacement = null;
    return { ok: true, refund: last.cost };
  }

  /** Uproot a defender, returning 70% of its cost (rounded to whole Mana). */
  removeDefender(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } {
    const idx = this.defenders.findIndex((d) => d.ringId === ringId && !d.dead);
    if (idx === -1) return { ok: false, reason: 'no-defender' };
    const stats = getDefender(this.defenders[idx].typeId);
    const refund = stats ? Math.round(stats.cost * REMOVE_REFUND) : 0;
    this.defenders.splice(idx, 1);
    this.mana += refund;
    // The 70% refund is returned to the pool; the 30% loss stays as Mana spent.
    this.manaSpent = Math.max(0, this.manaSpent - refund);
    if (this.lastPlacement?.ringId === ringId) this.lastPlacement = null;
    return { ok: true, refund };
  }

  // --- Simulation -------------------------------------------------------

  /** Elapsed simulated battle time in seconds (frozen while not running/paused). */
  get clock(): number {
    return this.battleClock;
  }

  /** Advance the simulation by one fixed timestep. Safe to call when paused. */
  tick(dt: number = STEP): void {
    if (this.phase !== 'running' || this.paused) return;

    this.battleClock += dt;
    if (this.manaRegenPerSec > 0) this.mana += this.manaRegenPerSec * dt;

    this.spawnDue();
    this.moveEnemies(dt);
    this.resolveCombat(dt);
    this.ageProjectiles(dt);

    this.resolveOutcome();
  }

  /** Run tick() repeatedly until the battle ends or the sim-time budget is hit. */
  runToCompletion(maxSimSeconds = 600): void {
    const maxTicks = Math.ceil(maxSimSeconds / STEP);
    for (let i = 0; i < maxTicks; i++) {
      if (this.phase === 'won' || this.phase === 'lost') return;
      this.tick();
    }
  }

  // --- Observable projection -------------------------------------------

  snapshot(): BattleSnapshot {
    return {
      phase: this.phase,
      outcome: this.outcome,
      mana: Math.floor(this.mana),
      hearts: this.hearts,
      maxHearts: this.maxHearts,
      waveNumber: this.currentWave,
      totalWaves: this.level.waves?.length ?? 0,
      waveActive: this.phase === 'running' && this.enemies.length > 0,
      selectedDefenderType: this.selectedDefenderType,
      paused: this.paused,
      defenderCount: this.defenders.filter((d) => !d.dead).length,
      enemyCount: this.enemies.filter((e) => !e.dead && !e.reached).length,
      leaked: this.leaked,
      canUndo: this.isUndoable(),
      stars: this.scoreStars(),
    };
  }

  /**
   * The combined star result for this battle (0 on defeat or while unfinished).
   * Composes the engine-independent scoring rule with the tracked economy totals.
   */
  scoreStars(): number {
    return scoreStarsRule(this.resultInput());
  }

  /** Gather the inputs the engine-independent scoring rule needs. */
  resultInput(): BattleScoreInput {
    return {
      outcome: this.outcome,
      hearts: this.hearts,
      maxHearts: this.maxHearts,
      manaSpent: this.manaSpent,
      resourcesCollected: this.resourcesCollected,
      totalBounty: totalBounty(this.level),
      startingMana: this.level.startingMana ?? 0,
    };
  }

  // --- Internals --------------------------------------------------------

  /** Shared placement validation used by both the preview and the commit. */
  private validatePlacement(
    ringId: string,
    typeId: string,
  ): { ok: true; ring: Ring; stats: DefenderStats } | { ok: false; reason: string } {
    if (this.phase !== 'planning' && this.phase !== 'running') {
      return { ok: false, reason: 'battle-over' };
    }
    const ring = this.rings.find((r) => r.id === ringId);
    if (!ring) return { ok: false, reason: 'unknown-ring' };
    if (this.defenders.some((d) => d.ringId === ringId && !d.dead)) {
      return { ok: false, reason: 'ring-occupied' };
    }
    const stats = getDefender(typeId);
    if (!stats) return { ok: false, reason: 'unknown-defender' };
    if (stats.placement !== ring.placement) return { ok: false, reason: 'placement-mismatch' };
    if (this.mana < stats.cost) return { ok: false, reason: 'insufficient-mana' };
    return { ok: true, ring, stats };
  }

  /** Whether the most recent placement is still inside its undo window. */
  private isUndoable(): boolean {
    return !!this.lastPlacement && this.battleClock - this.lastPlacement.placedAt <= UNDO_WINDOW;
  }

  /** Award a felled enemy's Mana bounty to both the spendable pool and the collected total. */
  private collectBounty(enemy: ActiveEnemy): void {
    this.mana += enemy.bounty;
    this.resourcesCollected += enemy.bounty;
  }

  private spawnDue(): void {
    while (this.nextSpawn < this.schedule.length && this.schedule[this.nextSpawn].at <= this.battleClock) {
      const spawn = this.schedule[this.nextSpawn];
      this.currentWave = spawn.wave;
      this.enemies.push(spawnEnemy(spawn.type, this.path));
      this.nextSpawn++;
    }
  }

  private moveEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.reached) continue;

      if (enemy.poisonTime > 0) {
        enemy.poisonTime -= dt;
        enemy.hp -= enemy.poisonDps * dt;
        if (enemy.hp <= 0) {
          enemy.dead = true;
          this.collectBounty(enemy);
          continue;
        }
      }

      const blocker = this.findBlocker(enemy);
      if (blocker) {
        enemy.blockedBy = blocker.ringId;
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          blocker.hp -= BRAMBLE_CHIP_DAMAGE; // brambles are HP sinks, not ranged targets
          enemy.attackTimer = enemy.attackInterval;
          if (blocker.hp <= 0) {
            blocker.dead = true;
            this.defenders = this.defenders.filter((d) => d !== blocker);
            enemy.blockedBy = null;
          }
        }
        continue;
      }
      enemy.blockedBy = null;

      enemy.s += enemy.speed * dt;
      if (enemy.s >= this.path.length) {
        enemy.reached = true;
        enemy.dead = true;
        this.hearts -= 1;
        this.leaked += 1;
        continue;
      }
      const pos = this.path.positionAt(enemy.s);
      enemy.x = pos.x;
      enemy.y = pos.y;
      enemy.pathProgress = this.path.length > 0 ? enemy.s / this.path.length : 0;
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private resolveCombat(dt: number): void {
    for (const defender of this.defenders) {
      if (defender.dead) continue;
      if (defender.blocksPath || defender.range <= 0) continue;
      defender.cooldown -= dt;
      if (defender.cooldown > 0) continue;

      const target = this.acquireTarget(defender);
      if (!target) continue;

      const dmg = applyArmor(defender.damage, target.armor, defender.armorPierce);
      target.hp -= dmg;
      if (defender.poisonDps > 0 && defender.poisonDuration > 0) {
        target.poisonTime = defender.poisonDuration;
        target.poisonDps = defender.poisonDps;
      }
      this.projectiles.push({
        id: this.projectileSeq++,
        fromX: defender.x,
        fromY: defender.y,
        toX: target.x,
        toY: target.y,
        born: this.battleClock,
        ttl: PROJECTILE_TTL,
      });
      defender.cooldown = defender.cooldownMax;

      if (target.hp <= 0) {
        target.dead = true;
        this.collectBounty(target);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private acquireTarget(defender: PlacedDefender): ActiveEnemy | null {
    let best: ActiveEnemy | null = null;
    let bestProgress = -1;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.reached) continue;
      const d = Math.hypot(enemy.x - defender.x, enemy.y - defender.y);
      if (d > defender.range) continue;
      if (enemy.pathProgress > bestProgress) {
        bestProgress = enemy.pathProgress;
        best = enemy;
      }
    }
    return best;
  }

  private findBlocker(enemy: ActiveEnemy): PlacedDefender | null {
    for (const d of this.defenders) {
      if (d.dead || !d.blocksPath) continue;
      const near = this.path.distanceAlong(d.x, d.y);
      const onPath = near.distance < this.path.width * 0.5;
      const close = Math.abs(near.s - enemy.s) < BLOCKER_PROXIMITY;
      if (onPath && close) return d;
    }
    return null;
  }

  private ageProjectiles(dt: number): void {
    if (this.projectiles.length === 0) return;
    this.projectiles = this.projectiles.filter(
      (p) => this.battleClock - p.born < p.ttl + dt,
    );
  }

  private resolveOutcome(): void {
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.phase = 'lost';
      this.outcome = 'defeat';
      return;
    }
    const allSpawned = this.nextSpawn >= this.schedule.length;
    const fieldClear = this.enemies.length === 0;
    if (allSpawned && fieldClear && this.battleClock > 0) {
      this.phase = 'won';
      this.outcome = 'victory';
    }
  }
}

// --- Helpers --------------------------------------------------------------

/** Total Mana bounty every spawned enemy in the level could yield. */
function totalBounty(level: CompiledLevel): number {
  let sum = 0;
  for (const wave of level.waves ?? []) {
    for (const group of wave.enemies) {
      const bounty = getEnemy(group.type)?.manaBounty ?? 0;
      sum += bounty * group.count;
    }
  }
  return sum;
}

function buildSchedule(level: CompiledLevel): ScheduledSpawn[] {
  const schedule: ScheduledSpawn[] = [];
  let cursor = 0;
  level.waves?.forEach((wave, waveIndex) => {
    cursor += wave.delayBefore;
    const count = wave.enemies.reduce((sum, group) => sum + group.count, 0);
    let i = 0;
    for (const group of wave.enemies) {
      for (let k = 0; k < group.count; k++) {
        schedule.push({
          type: group.type,
          at: cursor + i * wave.spawnInterval,
          wave: waveIndex + 1,
        });
        i++;
      }
    }
    const lastSpawnAt = cursor + Math.max(0, count - 1) * wave.spawnInterval;
    cursor = lastSpawnAt + wave.delayAfter;
  });
  return schedule;
}

function spawnEnemy(typeId: string, path: PathCurve): ActiveEnemy {
  const stats = getEnemy(typeId);
  if (!stats) throw new Error(`Unknown enemy type: ${typeId}`);
  const start = path.positionAt(0);
  return {
    typeId,
    s: 0,
    pathProgress: 0,
    x: start.x,
    y: start.y,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    bounty: stats.manaBounty,
    armor: stats.armor ?? 0,
    attackInterval: stats.attackInterval,
    attackTimer: stats.attackInterval,
    poisonTime: 0,
    poisonDps: 0,
    dead: false,
    reached: false,
    blockedBy: null,
  };
}

function makeDefender(ring: Ring, stats: DefenderStats): PlacedDefender {
  return {
    ringId: ring.id,
    typeId: stats.id,
    x: ring.x,
    y: ring.y,
    hp: stats.hp,
    maxHp: stats.hp,
    range: stats.range,
    damage: stats.damage,
    cooldown: 0,
    cooldownMax: stats.cooldown,
    blocksPath: stats.blocksPath ?? false,
    poisonDps: stats.poisonDps ?? 0,
    poisonDuration: stats.poisonDuration ?? 0,
    armorPierce: stats.armorPierce ?? 0,
    dead: false,
  };
}

function applyArmor(base: number, armor: number, pierce: number): number {
  return Math.max(1, base - Math.max(0, armor - pierce));
}
