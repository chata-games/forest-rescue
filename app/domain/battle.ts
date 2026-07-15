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
import {
  effectiveStats,
  getDefender,
  getEnemy,
  getSpell,
  maxTier,
  upgradeCost,
  type EffectiveStats,
  type SpellStats,
} from './content';
import { scoreStars as scoreStarsRule, type BattleScoreInput } from './scoring';
import {
  hasDarkness,
  glowSources as buildGlowSources,
  inGlow,
  fireflyBuff,
  type GlowSource,
  type BeaconGlow,
} from './light';
import type { CompiledLevel, DefenderStats, Ring, Wave } from './types';

export const STEP = 1 / 60;

/** Minimum world-unit spacing a Mana flower keeps from rings and other flowers,
 * so each renders as a >=48 CSS-pixel hit region under FIT scaling and never
 * steals a tap from an actionable target (issue #31 AC5). */
export const MANA_FLOWER_HIT = 48;
const FLOWER_MANA = 15;
// A Poacher snatches a Mana flower when it comes within this many world units,
// draining its Mana and resetting a short theft cooldown (issue #36 AC2).
const POACHER_STEAL_MANA = 20;
const POACHER_STEAL_COOLDOWN = 2.5;
const POACHER_STEAL_RANGE = 80;
/** Logical battlefield dimensions, in world units. Shared with the renderer so
 * the FIT-scaled canvas and the domain's bounds can never drift apart. */
export const FIELD_WIDTH = 1536;
export const FIELD_HEIGHT = 1024;

export type Phase = 'planning' | 'running' | 'won' | 'lost';
export type Outcome = 'victory' | 'defeat' | null;

export interface BattleConfig {
  level: CompiledLevel;
  /** Override starting Mana (tests / cheats). Defaults to the level's value. */
  startingMana?: number;
  /** Passive Mana regeneration per simulated second. Defaults to 0. */
  manaRegenPerSec?: number;
  /** Spell ids the Guardian has unlocked for this battle (cumulative campaign
   * unlocks). Defaults to the level's own spellUnlock. Only these are armable. */
  availableSpells?: string[];
  /** When > 0, a Mana flower spawns at a safe spot every N seconds of battle
   * time. 0 (default) disables spawning. Measured on the battle clock, so
   * Pause/planning freeze it — mirroring the undo window. */
  manaFlowerIntervalSec?: number;
}

/** A collectible Mana flower on the battlefield. Tap to harvest its Mana. */
export interface ManaFlower {
  id: string;
  x: number;
  y: number;
  mana: number;
}

/** Per-spell availability the HUD projects so the Guardian can see, in text, why
 * a spell cannot be selected (cooldown / affordability) — issue #31 AC4. */
export interface SpellAvailability {
  id: string;
  name: string;
  cost: number;
  /** Seconds of cooldown remaining on the battle clock. */
  cooldownRemaining: number;
  cooldownMax: number;
  affordable: boolean;
  /** True when the cooldown has fully elapsed. */
  ready: boolean;
  /** True when ready AND affordable (the spell is selectable). */
  available: boolean;
  /** Guardian-facing reason the spell is unavailable, or null when available. */
  reason: string | null;
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
  /** Current upgrade tier (0 = base). */
  tier: number;
  /** Total Mana sunk into this Defender (placement cost + every upgrade cost). */
  invested: number;
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
  /** Seconds of root remaining (Root Snare): a rooted enemy cannot advance. */
  rootTime: number;
  /** Ring id of a blocking bramble this enemy is currently chewing through. */
  blockedBy: string | null;
  /** True when the foe is only strikeable/visible in light (the Poacher). */
  cloaked: boolean;
  /** True when the foe walks through on-path blockers instead of chewing them. */
  ignoresBlockers: boolean;
  /** True when the foe drains Mana from a nearby flower on a cooldown. */
  stealsFlowers: boolean;
  /** Seconds of theft cooldown remaining (Poacher). */
  stealCooldown: number;
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
  /** Spell currently armed for select-then-target casting, or null. */
  armedSpell: string | null;
  /** Availability of every unlocked spell, for the spell toolbar. */
  spells: SpellAvailability[];
  /** Current + upcoming wave composition/traits/routes/boss/countdown (issue #32 AC1). */
  wavePreview: WavePreview;
}

/** A before→after delta for one decisive stat, for the upgrade preview (issue #30 AC3). */
export interface StatChange {
  from: number;
  to: number;
}

/** Before→after stat deltas for an upgrade preview (unchanged stats omitted). */
export interface StatChanges {
  damage?: StatChange;
  range?: StatChange;
  hp?: StatChange;
  cooldown?: StatChange;
}

/** What the next upgrade would cost and change, and why it may be unavailable. */
export interface UpgradePreview {
  /** The tier upgrading would reach. */
  nextTier: number;
  cost: number;
  /** True when the Guardian can pay for and commit the upgrade right now. */
  available: boolean;
  /** Why the upgrade is unavailable, when it is not. */
  reason?: 'max-tier' | 'insufficient-mana' | 'battle-over';
  statChanges: StatChanges;
}

/**
 * A modeless read on one planted Defender (issue #30 AC1/AC2): its decisive
 * current stats, the Mana invested and the exact removal refund, and the next
 * upgrade preview. Pure projection off the simulation — the UI renders from it.
 */
export interface DefenderInspection {
  ringId: string;
  typeId: string;
  name: string;
  tier: number;
  maxTier: number;
  range: number;
  damage: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  blocksPath: boolean;
  poisonDps: number;
  /** Total Mana sunk into this Defender (placement + upgrades). */
  invested: number;
  /** Exact 70% refund a removal would return, in whole Mana (issue #30 AC4). */
  removalRefund: number;
  /** The next upgrade preview, or null at the ladder's top tier. */
  upgrade: UpgradePreview | null;
}

/** One enemy group in a wave preview (issue #32 AC1): count, display name, traits. */
export interface WavePreviewGroup {
  type: string;
  count: number;
  /** Display name from the catalogue (falls back to the type id for bosses). */
  name: string;
  /** Enemy trait tags (ground, flying, armored, …) from the catalogue. */
  traits: string[];
}

/** A wave the Guardian can plan against: composition, routes, boss flag, countdown. */
export interface WavePreviewEntry {
  /** 1-based wave number. */
  wave: number;
  /** Total enemies across all groups. */
  total: number;
  groups: WavePreviewGroup[];
  /** Path ids the level exposes (the routes foes arrive on). */
  routeIds: string[];
  /** True when this wave carries a boss (wave.bossId authored). */
  boss: boolean;
  /** Seconds until this wave's first enemy spawns, clamped to >= 0. */
  countdown: number;
}

/**
 * The current and next-upcoming wave, for the Planning Pause wave preview (issue
 * #32 AC1). A pure projection off the level + battle clock: composition, enemy
 * traits, routes, boss warnings, and a countdown to the next wave.
 */
export interface WavePreview {
  /** The wave currently or most-recently spawning (null once all waves are spent). */
  current: WavePreviewEntry | null;
  /** The next wave to spawn (null if the current wave is the last). */
  upcoming: WavePreviewEntry | null;
}

interface ScheduledSpawn {
  type: string;
  at: number;
  wave: number;
}

/**
 * The most recent reversible action, tracked so a tap can undo it within the
 * UNDO_WINDOW (issue #22 placement + issue #30 upgrade/removal). A later
 * reversible action replaces it. Each variant carries exactly what reversing
 * requires: a placement is uprooted for a full refund, an upgrade is rolled back
 * to its prior tier snapshot, and a removal is replayed by giving back the refund.
 */
type UndoableAction =
  | { kind: 'place'; ringId: string; cost: number; placedAt: number }
  | { kind: 'upgrade'; ringId: string; cost: number; placedAt: number; prev: PlacedDefender }
  | { kind: 'remove'; ringId: string; refund: number; placedAt: number; defender: PlacedDefender };

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

  /** True when the level shrouds the battlefield in darkness (Mushroom Hollow). */
  readonly darkness: boolean;

  mana: number;
  hearts: number;
  readonly maxHearts: number;
  private readonly manaRegenPerSec: number;

  selectedDefenderType: string = 'sprig-sentinel';

  defenders: PlacedDefender[] = [];
  enemies: ActiveEnemy[] = [];
  projectiles: ProjectileView[] = [];
  /** Live Mana flowers the Guardian can tap to collect. */
  manaFlowers: ManaFlower[] = [];

  /** Spell armed for select-then-target casting, or null. While set, battlefield
   * taps cast the spell instead of placing a Defender (issue #31 AC6). */
  armedSpell: string | null = null;

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
  // The most recent reversible action (placement, upgrade, or removal), tracked
  // so it can be undone within the UNDO_WINDOW. A later action replaces it.
  private lastAction: UndoableAction | null = null;
  private flowerSeq = 0;
  // The Defender tool active before a spell was armed, restored on cast/cancel so
  // targeting a spell can never lose the Guardian's selection (issue #31 AC3).
  private previousDefenderType: string | null = null;
  // Per-spell cooldowns remaining, in seconds of battle time.
  private spellCooldowns: Record<string, number> = {};
  private readonly availableSpells: string[];
  private readonly manaFlowerInterval: number;
  private nextFlowerAt: number;

  constructor(config: BattleConfig) {
    this.level = config.level;
    const compiledPath = config.level.paths[0];
    if (!compiledPath) throw new Error(`Level ${config.level.id} has no path`);
    this.darkness = hasDarkness(config.level);
    this.path = new PathCurve(compiledPath);
    this.rings = config.level.rings ?? [];
    this.maxHearts = config.level.maxHearts ?? 5;
    this.hearts = this.maxHearts;
    this.mana = config.startingMana ?? config.level.startingMana ?? 150;
    this.manaRegenPerSec = config.manaRegenPerSec ?? 0;
    this.availableSpells =
      config.availableSpells ?? (config.level.spellUnlock ? [config.level.spellUnlock] : []);
    this.manaFlowerInterval = config.manaFlowerIntervalSec ?? 0;
    this.nextFlowerAt = this.manaFlowerInterval;
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
    if (!getDefender(typeId)) return;
    // Picking a Defender tool explicitly leaves spell targeting, so arming a
    // spell can never strand the Guardian without a placement tool.
    if (this.armedSpell !== null) {
      this.armedSpell = null;
      this.previousDefenderType = null;
    }
    this.selectedDefenderType = typeId;
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
    this.lastAction = { kind: 'place', ringId, cost: stats.cost, placedAt: this.battleClock };
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
   * Undo the most recent reversible action — a placement, an upgrade, or a
   * removal (issue #22 AC6 + issue #30 AC5) — but only within the UNDO_WINDOW of
   * battle time. A placement is uprooted for a FULL refund; an upgrade rolls back
   * to its prior tier and refunds the upgrade cost; a removal replays the
   * Defender and gives back the refund it paid out. Works with touch, mouse, pen,
   * and keyboard because it is a plain state command the UI binds to any input.
   */
  undoLastAction():
    | { ok: true; kind: UndoableAction['kind']; refund: number }
    | { ok: false; reason: string } {
    const last = this.lastAction;
    if (!last) return { ok: false, reason: 'nothing-to-undo' };
    if (this.battleClock - last.placedAt > UNDO_WINDOW) return { ok: false, reason: 'undo-expired' };

    if (last.kind === 'remove') {
      // Replay the uprooted Defender and claw back the refund it paid out.
      this.defenders.push(last.defender);
      this.mana -= last.refund;
      this.manaSpent += last.refund;
      this.lastAction = null;
      return { ok: true, kind: 'remove', refund: last.refund };
    }

    // place / upgrade both target a living Defender on a ring.
    const idx = this.defenders.findIndex((d) => d.ringId === last.ringId && !d.dead);
    if (idx === -1) {
      // The Defender is already gone (e.g. destroyed in combat); nothing remains.
      this.lastAction = null;
      return { ok: false, reason: 'nothing-to-undo' };
    }
    if (last.kind === 'place') {
      this.defenders.splice(idx, 1);
      this.mana += last.cost; // full refund, not the 70% uproot rate
      this.manaSpent = Math.max(0, this.manaSpent - last.cost);
    } else {
      // upgrade: restore the prior tier snapshot and refund the upgrade cost.
      this.defenders[idx] = last.prev;
      this.mana += last.cost;
      this.manaSpent = Math.max(0, this.manaSpent - last.cost);
    }
    this.lastAction = null;
    return { ok: true, kind: last.kind, refund: last.cost };
  }

  /**
   * Upgrade the Defender on a fairy ring by one tier (issue #30 AC3). Previews
   * the exact cost via {@link inspect}; this commit re-validates and spends
   * nothing on a failed attempt. Upgrading restores the Defender to its new
   * full health and tracks the cost in `invested` so a later removal refunds it.
   */
  upgradeDefender(
    ringId: string,
  ): { ok: true; cost: number; tier: number } | { ok: false; reason: string } {
    if (this.isBattleOver()) return { ok: false, reason: 'battle-over' };
    const idx = this.defenders.findIndex((d) => d.ringId === ringId && !d.dead);
    if (idx === -1) return { ok: false, reason: 'no-defender' };
    const defender = this.defenders[idx];
    const stats = getDefender(defender.typeId);
    if (!stats) return { ok: false, reason: 'unknown-defender' };
    const cost = upgradeCost(stats, defender.tier);
    if (cost === null) return { ok: false, reason: 'max-tier' };
    if (this.mana < cost) return { ok: false, reason: 'insufficient-mana' };

    const nextTier = defender.tier + 1;
    const eff = effectiveStats(stats, nextTier);
    const prev: PlacedDefender = { ...defender };
    this.mana -= cost;
    this.manaSpent += cost;
    defender.tier = nextTier;
    defender.invested += cost;
    defender.range = eff.range;
    defender.damage = eff.damage;
    defender.maxHp = eff.hp;
    defender.hp = eff.hp; // upgrading re-blooms the Defender to full health
    defender.cooldownMax = eff.cooldown;
    defender.cooldown = Math.min(defender.cooldown, eff.cooldown);
    defender.poisonDps = eff.poisonDps;
    defender.poisonDuration = eff.poisonDuration;
    defender.armorPierce = eff.armorPierce;
    this.lastAction = { kind: 'upgrade', ringId, cost, placedAt: this.battleClock, prev };
    return { ok: true, cost, tier: nextTier };
  }

  /**
   * Uproot a Defender, returning 70% of the total Mana invested in it (placement
   * + upgrades), rounded to whole Mana (issue #30 AC4). Reversible within the
   * UNDO_WINDOW via {@link undoLastAction}.
   */
  removeDefender(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } {
    if (this.isBattleOver()) return { ok: false, reason: 'battle-over' };
    const idx = this.defenders.findIndex((d) => d.ringId === ringId && !d.dead);
    if (idx === -1) return { ok: false, reason: 'no-defender' };
    const defender = this.defenders[idx];
    const refund = Math.round(defender.invested * REMOVE_REFUND);
    this.defenders.splice(idx, 1);
    this.mana += refund;
    // The 70% refund is returned to the pool; the 30% loss stays as Mana spent.
    this.manaSpent = Math.max(0, this.manaSpent - refund);
    this.lastAction = { kind: 'remove', ringId, refund, placedAt: this.battleClock, defender };
    return { ok: true, refund };
  }

  /**
   * A modeless read on the Defender planted on a fairy ring (issue #30 AC1/AC2):
   * decisive current stats, invested Mana with the exact 70% removal refund, and
   * the next upgrade preview (cost + stat deltas + any unavailable reason).
   * Returns null when the ring has no living Defender to inspect.
   */
  inspect(ringId: string): DefenderInspection | null {
    const defender = this.defenders.find((d) => d.ringId === ringId && !d.dead);
    if (!defender) return null;
    const stats = getDefender(defender.typeId);
    if (!stats) return null;
    const top = maxTier(stats);
    const refund = Math.round(defender.invested * REMOVE_REFUND);

    let upgrade: UpgradePreview | null = null;
    const cost = upgradeCost(stats, defender.tier);
    if (cost !== null) {
      // Why the upgrade may be unavailable, in priority order. `available` is the
      // absence of a reason, so the panel can both disable and explain the button.
      let reason: UpgradePreview['reason'];
      if (this.isBattleOver()) reason = 'battle-over';
      else if (this.mana < cost) reason = 'insufficient-mana';
      else reason = undefined;
      const nextTier = defender.tier + 1;
      upgrade = {
        nextTier,
        cost,
        available: reason === undefined,
        ...(reason ? { reason } : {}),
        statChanges: diffStats(effectiveStats(stats, defender.tier), effectiveStats(stats, nextTier)),
      };
    }

    return {
      ringId,
      typeId: defender.typeId,
      name: stats.name,
      tier: defender.tier,
      maxTier: top,
      range: defender.range,
      damage: defender.damage,
      hp: defender.hp,
      maxHp: defender.maxHp,
      cooldown: defender.cooldownMax,
      blocksPath: defender.blocksPath,
      poisonDps: defender.poisonDps,
      invested: defender.invested,
      removalRefund: refund,
      upgrade,
    };
  }

  // --- Spells (issue #31) ----------------------------------------------

  /**
   * Arm a spell for select-then-target casting. Only an available spell (unlocked,
   * off cooldown, affordable) can be armed; the prior Defender selection is
   * stashed so cast/cancel can restore it. Arming the already-armed spell toggles
   * it off (AC3/AC4).
   */
  armSpell(typeId: string): { ok: true } | { ok: false; reason: string } {
    if (this.armedSpell === typeId) {
      this.cancelSpell();
      return { ok: true };
    }
    const status = this.spellStatus(typeId);
    if (!status.ok) return { ok: false, reason: status.reason };
    // Stash the current Defender tool only on the unarmed -> armed transition, so
    // switching between spells keeps the original pre-targeting selection.
    if (this.armedSpell === null) this.previousDefenderType = this.selectedDefenderType;
    this.armedSpell = typeId;
    return { ok: true };
  }

  /** Explicitly leave spell targeting and restore the previously Selected Defender. */
  cancelSpell(): void {
    if (this.armedSpell === null) return;
    this.endTargeting();
  }

  /**
   * Commit a spell at a battlefield point. Validates the same way as the preview;
   * a failed cast spends no Mana and starts no cooldown (AC2). A successful cast
   * spends the cost, starts the cooldown, applies the effect, then restores the
   * previously Selected Defender (AC3).
   */
  castSpell(
    x: number,
    y: number,
    typeId: string | null = this.armedSpell,
  ): { ok: true } | { ok: false; reason: string } {
    const status = this.spellStatus(typeId, x, y);
    if (!status.ok) return { ok: false, reason: status.reason };
    const spell = status.stats;

    this.mana -= spell.cost;
    this.spellCooldowns[spell.id] = spell.cooldown;
    this.applySpellEffect(spell, x, y);
    // Restore the Defender selection and leave targeting mode.
    this.endTargeting();
    return { ok: true };
  }

  /**
   * Preview whether castSpell would succeed at a point, without spending or
   * starting a cooldown. Drives the targeting reticle colour and lets the UI
   * explain a problem without an unintended cast.
   */
  canCastSpell(
    x: number,
    y: number,
    typeId: string | null = this.armedSpell,
  ): { ok: true } | { ok: false; reason: string } {
    const status = this.spellStatus(typeId, x, y);
    return status.ok ? { ok: true } : { ok: false, reason: status.reason };
  }

  // --- Mana flowers (issue #31) ----------------------------------------

  /**
   * Place a Mana flower at a point, but only where it clears every ring's build
   * area and any existing flower by the hit-region spacing. Refuses overlaps so a
   * flower can never steal a tap from an actionable target (AC5).
   */
  spawnManaFlower(
    x: number,
    y: number,
    mana: number = FLOWER_MANA,
  ): { ok: true; flower: ManaFlower } | { ok: false; reason: string } {
    if (!inField(x, y)) return { ok: false, reason: 'out-of-bounds' };
    if (this.rings.some((r) => Math.hypot(x - r.x, y - r.y) < r.buildRadius + MANA_FLOWER_HIT / 2)) {
      return { ok: false, reason: 'overlaps-ring' };
    }
    if (this.manaFlowers.some((f) => Math.hypot(x - f.x, y - f.y) < MANA_FLOWER_HIT)) {
      return { ok: false, reason: 'overlaps-flower' };
    }
    const flower: ManaFlower = { id: `flower-${this.flowerSeq++}`, x, y, mana };
    this.manaFlowers.push(flower);
    return { ok: true, flower };
  }

  /** Harvest a Mana flower: grants its Mana and removes it. Idempotent failure. */
  collectManaFlower(flowerId: string): { ok: true; mana: number } | { ok: false; reason: string } {
    // Mana-flower collection is a live-battle action, locked while paused (issue #32 AC4).
    if (this.paused) return { ok: false, reason: 'paused' };
    const idx = this.manaFlowers.findIndex((f) => f.id === flowerId);
    if (idx === -1) return { ok: false, reason: 'already-collected' };
    const [flower] = this.manaFlowers.splice(idx, 1);
    this.mana += flower.mana;
      return { ok: true, mana: flower.mana };
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
    this.tickSpellCooldowns(dt);
    this.maybeSpawnFlower();

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
      armedSpell: this.armedSpell,
      spells: this.spellAvailability(),
      wavePreview: this.wavePreview(),
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

  /**
   * The current + next-upcoming wave for the Planning Pause wave preview (issue
   * #32 AC1). Delegates to the pure projector so the timing math stays in one
   * place and matches the spawn schedule exactly.
   */
  wavePreview(): WavePreview {
    return buildWavePreview({
      waves: this.level.waves ?? [],
      paths: this.level.paths,
      currentWave: this.currentWave,
      clock: this.battleClock,
    });
  }

  // --- Internals --------------------------------------------------------

  /** Shared placement validation used by both the preview and the commit. */
  private validatePlacement(
    ringId: string,
    typeId: string,
  ): { ok: true; ring: Ring; stats: DefenderStats } | { ok: false; reason: string } {
    if (this.isBattleOver()) return { ok: false, reason: 'battle-over' };
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

  /** Whether the most recent reversible action is still inside its undo window. */
  private isUndoable(): boolean {
    return !!this.lastAction && this.battleClock - this.lastAction.placedAt <= UNDO_WINDOW;
  }

  /** Award a felled enemy's Mana bounty to both the spendable pool and the collected total. */
  private collectBounty(enemy: ActiveEnemy): void {
    this.mana += enemy.bounty;
    this.resourcesCollected += enemy.bounty;
  }

  /** Whether the battle has resolved and edits (place/upgrade/remove) are closed off. */
  private isBattleOver(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  /** Leave spell targeting: clear the armed spell and restore the Defender tool
   * that was active before a spell was armed (issue #31 AC3). */
  private endTargeting(): void {
    this.armedSpell = null;
    if (this.previousDefenderType) {
      this.selectedDefenderType = this.previousDefenderType;
      this.previousDefenderType = null;
    }
  }

  /**
   * Validate a spell arm/cast attempt without committing. A target point (when
   * given) must land inside the battlefield; arming omits it. affordability and
   * cooldown are checked so an unavailable spell can be neither armed nor cast.
   */
  private spellStatus(
    typeId: string | null,
    x?: number,
    y?: number,
  ): { ok: true; stats: SpellStats } | { ok: false; reason: string } {
    if (this.phase !== 'planning' && this.phase !== 'running') {
      return { ok: false, reason: 'battle-over' };
    }
    // Planning Pause freezes live-battle actions: a spell cannot be armed or
    // cast while paused (issue #32 AC4).
    if (this.paused) return { ok: false, reason: 'paused' };
    if (!typeId) return { ok: false, reason: 'no-spell-armed' };
    if (!this.availableSpells.includes(typeId)) return { ok: false, reason: 'spell-locked' };
    const stats = getSpell(typeId);
    if (!stats) return { ok: false, reason: 'unknown-spell' };
    if (this.mana < stats.cost) return { ok: false, reason: 'insufficient-mana' };
    if ((this.spellCooldowns[typeId] ?? 0) > 0) return { ok: false, reason: 'spell-cooldown' };
    if (x !== undefined && y !== undefined && !inField(x, y)) {
      return { ok: false, reason: 'invalid-target' };
    }
    return { ok: true, stats };
  }

  /** Apply a committed spell's effect within its radius at the landing point. */
  private applySpellEffect(spell: SpellStats, x: number, y: number): void {
    if (spell.effect === 'root' && spell.rootDuration) {
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.reached) continue;
        if (Math.hypot(enemy.x - x, enemy.y - y) <= spell.radius) {
          enemy.rootTime = Math.max(enemy.rootTime, spell.rootDuration);
        }
      }
    } else if (spell.effect === 'heal' && spell.heal) {
      for (const defender of this.defenders) {
        if (defender.dead) continue;
        if (Math.hypot(defender.x - x, defender.y - y) <= spell.radius) {
          defender.hp = Math.min(defender.maxHp, defender.hp + spell.heal);
        }
      }
    }
  }

  /** Availability of every unlocked spell, for the snapshot / spell toolbar. */
  private spellAvailability(): SpellAvailability[] {
    return this.availableSpells
      .map((id): SpellAvailability | null => {
        const stats = getSpell(id);
        if (!stats) return null; // unknown id in the unlock list is skipped
        const cooldownRemaining = Math.max(0, this.spellCooldowns[id] ?? 0);
        const affordable = this.mana >= stats.cost;
        const ready = cooldownRemaining === 0;
        // Planning Pause locks every spell (issue #32 AC4); otherwise the reason
        // is cooldown, then affordability, in priority order. `available` is the
        // absence of a reason, so the toolbar can both disable and explain.
        let reason: SpellAvailability['reason'];
        if (this.paused) reason = 'paused';
        else if (!ready) reason = 'spell-cooldown';
        else if (!affordable) reason = 'insufficient-mana';
        else reason = null;
        return {
          id: stats.id,
          name: stats.name,
          cost: stats.cost,
          cooldownRemaining,
          cooldownMax: stats.cooldown,
          affordable,
          ready,
          available: reason === null,
          reason,
        };
      })
      .filter((s): s is SpellAvailability => s !== null);
  }

  private tickSpellCooldowns(dt: number): void {
    for (const id of Object.keys(this.spellCooldowns)) {
      this.spellCooldowns[id] = Math.max(0, (this.spellCooldowns[id] ?? 0) - dt);
    }
  }

  /** Spawn one Mana flower per elapsed interval at a safe lattice point. */
  private maybeSpawnFlower(): void {
    if (this.manaFlowerInterval <= 0) return;
    while (this.battleClock >= this.nextFlowerAt) {
      this.spawnScheduledFlower();
      this.nextFlowerAt += this.manaFlowerInterval;
    }
  }

  /** Place a flower on the first lattice candidate that clears rings and flowers. */
  private spawnScheduledFlower(): void {
    const safe = planManaFlowers({
      rings: this.rings,
      existing: this.manaFlowers,
      candidates: FLOWER_LATTICE,
    });
    if (safe.length > 0) {
      const spot = safe[0]!;
      this.spawnManaFlower(spot.x, spot.y);
    }
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

      // Tick down the Poacher's theft cooldown whether or not it steals this step.
      if (enemy.stealCooldown > 0) enemy.stealCooldown = Math.max(0, enemy.stealCooldown - dt);

      // A flower-thief (Poacher) snatches the nearest Mana flower it is passing,
      // draining Mana on a cooldown so a single flower is lost once, not every
      // frame (issue #36 AC2). Done before movement so a steal pauses its advance
      // for the step, mirroring the legacy engine.
      if (enemy.stealsFlowers && enemy.stealCooldown <= 0 && this.manaFlowers.length > 0) {
        const flower = this.manaFlowers
          .filter((f) => Math.hypot(f.x - enemy.x, f.y - enemy.y) <= POACHER_STEAL_RANGE)
          .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0];
        if (flower) {
          this.manaFlowers = this.manaFlowers.filter((f) => f.id !== flower.id);
          this.mana = Math.max(0, this.mana - POACHER_STEAL_MANA);
          enemy.stealCooldown = POACHER_STEAL_COOLDOWN;
          continue;
        }
      }

      if (enemy.poisonTime > 0) {
        enemy.poisonTime -= dt;
        enemy.hp -= enemy.poisonDps * dt;
        if (enemy.hp <= 0) {
          enemy.dead = true;
          this.collectBounty(enemy);
          continue;
        }
      }

      // Rooted enemies still suffer damage but cannot advance or chew brambles.
      if (enemy.rootTime > 0) {
        enemy.rootTime -= dt;
        continue;
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
    // Glow is computed once per combat step: in the dark a Defender can only
    // strike an enemy that stands in light (issue #36 AC1/AC2).
    const glow = this.darkness ? this.currentGlow() : null;
    for (const defender of this.defenders) {
      if (defender.dead) continue;
      if (defender.blocksPath || defender.range <= 0) continue;
      defender.cooldown -= dt;
      if (defender.cooldown > 0) continue;

      // A Firefly Beacon emboldens nearby Defenders with extra reach and punch;
      // computed once and shared between target acquisition and the hit.
      const buff = fireflyBuff(defender, this.beaconPositions());
      const target = this.acquireTarget(defender, glow, defender.range * buff.rangeMul);
      if (!target) continue;

      const dmg = applyArmor(defender.damage * buff.damageMul, target.armor, defender.armorPierce);
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

  private acquireTarget(
    defender: PlacedDefender,
    glow: GlowSource[] | null,
    range: number,
  ): ActiveEnemy | null {
    let best: ActiveEnemy | null = null;
    let bestProgress = -1;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.reached) continue;
      // In the dark only a lit enemy is strikeable (a cloaked Poacher is dark-only).
      if (glow !== null && !inGlow(enemy.x, enemy.y, glow)) continue;
      const d = Math.hypot(enemy.x - defender.x, enemy.y - defender.y);
      if (d > range) continue;
      if (enemy.pathProgress > bestProgress) {
        bestProgress = enemy.pathProgress;
        best = enemy;
      }
    }
    return best;
  }

  /** Live Firefly Beacons as positions (for the embolden buff). */
  private beaconPositions(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const d of this.defenders) {
      if (d.dead) continue;
      if (getDefender(d.typeId)?.glowRadius) out.push({ x: d.x, y: d.y });
    }
    return out;
  }

  /**
   * Every glow source on the battlefield right now: rings, glow-mushroom
   * landmarks, and each living Firefly Beacon. Public so the renderer lifts the
   * dark mask at exactly these points (issue #36 AC1).
   */
  currentGlow(): GlowSource[] {
    const beacons: BeaconGlow[] = [];
    for (const d of this.defenders) {
      if (d.dead) continue;
      const r = getDefender(d.typeId)?.glowRadius;
      if (r) beacons.push({ x: d.x, y: d.y, glowRadius: r });
    }
    return buildGlowSources(this.level, beacons);
  }

  private findBlocker(enemy: ActiveEnemy): PlacedDefender | null {
    // A Poacher slips straight through on-path brambles instead of chewing them.
    if (enemy.ignoresBlockers) return null;
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

/**
 * First-spawn time of each wave's opening enemy, in seconds from battle start.
 * Shared by the spawn schedule and the wave preview so their timing can never
 * drift apart (issue #32 AC1). Index 0 is wave 1.
 */
function waveStartTimes(waves: ReadonlyArray<Wave>): number[] {
  const times: number[] = [];
  let cursor = 0;
  for (const wave of waves) {
    cursor += wave.delayBefore;
    times.push(cursor);
    const count = wave.enemies.reduce((sum, group) => sum + group.count, 0);
    cursor += Math.max(0, count - 1) * wave.spawnInterval + wave.delayAfter;
  }
  return times;
}

function buildSchedule(level: CompiledLevel): ScheduledSpawn[] {
  const schedule: ScheduledSpawn[] = [];
  const starts = waveStartTimes(level.waves ?? []);
  level.waves?.forEach((wave, waveIndex) => {
    const start = starts[waveIndex] ?? 0;
    let i = 0;
    for (const group of wave.enemies) {
      for (let k = 0; k < group.count; k++) {
        schedule.push({
          type: group.type,
          at: start + i * wave.spawnInterval,
          wave: waveIndex + 1,
        });
        i++;
      }
    }
  });
  return schedule;
}

/**
 * Pure wave-preview projector (issue #32 AC1): from the level's waves + paths,
 * the 1-based current wave, and the battle clock, derive the current and
 * next-upcoming wave — composition, enemy names/traits, routes, boss flag, and a
 * countdown clamped to >= 0. Deterministic given the inputs.
 */
export function buildWavePreview(input: {
  waves: ReadonlyArray<Wave>;
  paths: ReadonlyArray<{ id: string }>;
  /** 1-based wave number currently/most-recently spawning (0 before the first). */
  currentWave: number;
  /** Elapsed battle time in seconds. */
  clock: number;
}): WavePreview {
  const { waves, paths, currentWave, clock } = input;
  const routeIds = paths.map((p) => p.id);
  const starts = waveStartTimes(waves);

  const entry = (idx0: number): WavePreviewEntry | null => {
    if (idx0 < 0 || idx0 >= waves.length) return null;
    const wave = waves[idx0]!;
    const groups: WavePreviewGroup[] = wave.enemies.map((g) => {
      const stats = getEnemy(g.type);
      return {
        type: g.type,
        count: g.count,
        name: stats?.name ?? g.type,
        traits: stats?.tags ?? [],
      };
    });
    const total = groups.reduce((sum, g) => sum + g.count, 0);
    const start = starts[idx0] ?? 0;
    return {
      wave: idx0 + 1,
      total,
      groups,
      routeIds,
      boss: !!wave.bossId,
      countdown: Math.max(0, start - clock),
    };
  };

  // current = the wave currently/most-recently spawning, or the first if none yet.
  const currentIdx0 = Math.max(currentWave, 1) - 1;
  return {
    current: entry(currentIdx0),
    upcoming: entry(currentIdx0 + 1),
  };
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
    rootTime: 0,
    blockedBy: null,
    cloaked: stats.cloaked ?? false,
    ignoresBlockers: stats.ignoresBlockers ?? false,
    stealsFlowers: stats.stealsFlowers ?? false,
    stealCooldown: 0,
  };
}

function makeDefender(ring: Ring, stats: DefenderStats): PlacedDefender {
  const eff = effectiveStats(stats, 0);
  return {
    ringId: ring.id,
    typeId: stats.id,
    x: ring.x,
    y: ring.y,
    hp: eff.hp,
    maxHp: eff.hp,
    range: eff.range,
    damage: eff.damage,
    cooldown: 0,
    cooldownMax: eff.cooldown,
    blocksPath: stats.blocksPath ?? false,
    poisonDps: eff.poisonDps,
    poisonDuration: eff.poisonDuration,
    armorPierce: eff.armorPierce,
    dead: false,
    tier: 0,
    invested: stats.cost,
  };
}

/** Build the upgrade-preview deltas between two resolved tiers (omits unchanged). */
function diffStats(now: EffectiveStats, next: EffectiveStats): StatChanges {
  const changes: StatChanges = {};
  if (now.damage !== next.damage) changes.damage = { from: now.damage, to: next.damage };
  if (now.range !== next.range) changes.range = { from: now.range, to: next.range };
  if (now.hp !== next.hp) changes.hp = { from: now.hp, to: next.hp };
  if (now.cooldown !== next.cooldown) changes.cooldown = { from: now.cooldown, to: next.cooldown };
  return changes;
}

function applyArmor(base: number, armor: number, pierce: number): number {
  return Math.max(1, base - Math.max(0, armor - pierce));
}

function inField(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= FIELD_WIDTH && y <= FIELD_HEIGHT;
}

/**
 * Choose candidate Mana-flower positions that never overlap an actionable
 * target. A candidate is dropped when it falls outside the battlefield (with a
 * half-hit margin), overlaps a fairy ring's build area (plus half a hit region),
 * or sits within one hit region of an existing or already-chosen flower. The
 * kept candidates are returned in input order — deterministic given the inputs
 * (issue #31 AC5).
 */
export function planManaFlowers(input: {
  rings: ReadonlyArray<{ x: number; y: number; buildRadius: number }>;
  existing: ReadonlyArray<{ x: number; y: number }>;
  candidates: ReadonlyArray<{ x: number; y: number }>;
  hit?: number;
  width?: number;
  height?: number;
}): { x: number; y: number }[] {
  const hit = input.hit ?? MANA_FLOWER_HIT;
  const width = input.width ?? FIELD_WIDTH;
  const height = input.height ?? FIELD_HEIGHT;
  const margin = hit / 2;
  const kept: { x: number; y: number }[] = [];
  for (const c of input.candidates) {
    if (c.x < margin || c.y < margin || c.x > width - margin || c.y > height - margin) continue;
    if (input.rings.some((r) => Math.hypot(c.x - r.x, c.y - r.y) < r.buildRadius + margin)) continue;
    const occupied = [...input.existing, ...kept];
    if (occupied.some((f) => Math.hypot(c.x - f.x, c.y - f.y) < hit)) continue;
    kept.push({ x: c.x, y: c.y });
  }
  return kept;
}

// Deterministic candidate lattice the flower scheduler draws from (no RNG, so
// spawns are reproducible for the same level/field). Stays inside the field with
// a half-hit margin on every edge.
const FLOWER_LATTICE: ReadonlyArray<{ x: number; y: number }> = (() => {
  const out: { x: number; y: number }[] = [];
  const cols = 8;
  const rows = 4;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      out.push({
        x: Math.round(MANA_FLOWER_HIT + ix * ((FIELD_WIDTH - MANA_FLOWER_HIT * 2) / (cols - 1))),
        y: Math.round(MANA_FLOWER_HIT + iy * ((FIELD_HEIGHT - MANA_FLOWER_HIT * 2) / (rows - 1))),
      });
    }
  }
  return out;
})();
