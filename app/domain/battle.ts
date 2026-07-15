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
import type { CompiledLevel, DefenderStats, EnemyStats, Ring } from './types';

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
}

interface ScheduledSpawn {
  type: string;
  at: number;
  wave: number;
}

const PROJECTILE_TTL = 0.22;
const REMOVE_REFUND = 0.7;

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

  private schedule: ScheduledSpawn[] = [];
  private nextSpawn = 0;
  private battleClock = 0;
  private currentWave = 0;
  leaked = 0;
  private projectileSeq = 1;

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
   * Plant the currently-selected (or explicit) defender on a fairy ring.
   * Honours Mana cost, ring occupancy, and placement compatibility.
   */
  placeDefender(
    ringId: string,
    typeId: string = this.selectedDefenderType,
  ): { ok: true; defender: PlacedDefender } | { ok: false; reason: string } {
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
    if (stats.placement !== ring.placement) {
      return { ok: false, reason: 'placement-mismatch' };
    }
    if (this.mana < stats.cost) return { ok: false, reason: 'insufficient-mana' };

    this.mana -= stats.cost;
    const defender = makeDefender(ring, stats);
    this.defenders.push(defender);
    return { ok: true, defender };
  }

  /** Uproot a defender, returning 70% of its cost (rounded to whole Mana). */
  removeDefender(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } {
    const idx = this.defenders.findIndex((d) => d.ringId === ringId && !d.dead);
    if (idx === -1) return { ok: false, reason: 'no-defender' };
    const stats = getDefender(this.defenders[idx].typeId);
    const refund = stats ? Math.round(stats.cost * REMOVE_REFUND) : 0;
    this.defenders.splice(idx, 1);
    this.mana += refund;
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
    };
  }

  // --- Internals --------------------------------------------------------

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
          this.mana += enemy.bounty;
          continue;
        }
      }

      const blocker = this.findBlocker(enemy);
      if (blocker) {
        enemy.blockedBy = blocker.ringId;
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          blocker.hp -= 8; // loggers chip brambles; brambles are HP sinks, not targets
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
        this.mana += target.bounty;
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
      const close = Math.abs(near.s - enemy.s) < 48;
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
  const stats: EnemyStats | null = getEnemy(typeId);
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
