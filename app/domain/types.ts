// Engine-independent domain types for the Forest Rescue battle boundary.
// These describe the data contracts that cross the application/domain edge.
// Nothing here may depend on Phaser, the DOM, or any rendering engine.

export interface Vec2 {
  x: number;
  y: number;
}

/** A compiled spline trail the enemies follow from entrance to Heartwood. */
export interface CompiledPath {
  id: string;
  controlPoints: Vec2[];
  samples: Vec2[];
  arcLengths: number[];
  width: number;
  length: number;
}

/** A fairy ring: a build spot beside (or on) the trail where a Defender is planted. */
export interface Ring {
  id: string;
  x: number;
  y: number;
  role: string;
  placement: 'beside-path' | 'on-path' | string;
  radius: number;
  buildRadius: number;
}

export interface WaveEnemyGroup {
  type: string;
  count: number;
}

/** A scripted group of enemies with spawn timing — compiler output. */
export interface Wave {
  enemies: WaveEnemyGroup[];
  delayBefore: number;
  delayAfter: number;
  spawnInterval: number;
  /** True when an intent override fully authored this wave (boss waves, etc.). */
  scripted?: boolean;
  bossId?: string | null;
}

/** Deterministic compiler output: geometry, rings, and waves. Never authored by hand. */
export interface CompiledLevel {
  id: string;
  name: string;
  compilerVersion: string;
  intentHash: string;
  seed: string;
  biome: string;
  unlocks: string[];
  spellUnlock: string | null;
  bossId: string | null;
  startingMana: number;
  maxHearts: number;
  levelModifiers: string[];
  paths: CompiledPath[];
  rings: Ring[];
  waves: Wave[];
  /** Compiler-derived difficulty/shape metrics (present on shipped levels). */
  metrics?: LevelMetrics;
  /** Optional hazard geometry authored by specific biomes/topologies. */
  waterMasks?: WaterMask[];
  airLanes?: AirLane[];
  /** Decorative + gameplay landmarks the compiler places (e.g. glow mushroom clusters). */
  landmarks?: Landmark[];
}

/** A placed landmark: a gameplay-relevant decoration such as a glow mushroom cluster. */
export interface Landmark {
  type: string;
  x: number;
  y: number;
}

/** Shape + difficulty metrics the compiler emits for each level. */
export interface LevelMetrics {
  pathLength: number;
  averageRingCoverage: number;
  chokepoints: number;
  ringCount: number;
  estimatedDifficulty: number;
}

/** A water hazard region (river-crossings topology). */
export interface WaterMask {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** A flying-enemy lane that bypasses the ground trail. */
export interface AirLane {
  forEnemy: string;
  from: Vec2;
  to: Vec2;
}

/**
 * One step on a Defender's upgrade ladder. Each tier is a sparse delta applied on
 * top of the previous tier (replace semantics for any stat it names); an omitted
 * field keeps the prior tier's value. Index 0 is the upgrade FROM tier 0 → 1.
 */
export interface UpgradeTier {
  /** Mana cost to upgrade TO this tier. */
  cost: number;
  range?: number;
  damage?: number;
  hp?: number;
  cooldown?: number;
  poisonDps?: number;
  poisonDuration?: number;
  armorPierce?: number;
}

export interface DefenderStats {
  id: string;
  name: string;
  cost: number;
  range: number;
  damage: number;
  cooldown: number;
  hp: number;
  tags: string[];
  placement: 'beside-path' | 'on-path';
  sprite: string;
  projectile: string;
  blocksPath?: boolean;
  supportOnly?: boolean;
  poisonDps?: number;
  poisonDuration?: number;
  armorPierce?: number;
  /**
   * World-unit radius of light this Defender casts in a darkness level (the
   * Firefly Beacon). A glow source reveals enemies so ranged Defenders can strike
   * them and lifts the dark mask so the Guardian sees the trail.
   */
  glowRadius?: number;
  /** Upgrade ladder; tier 0 is the base, each entry lifts the Defender one tier. */
  upgrades?: UpgradeTier[];
}

export interface EnemyStats {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  attackInterval: number;
  manaBounty: number;
  armor?: number;
  tags: string[];
  flying?: boolean;
  /**
   * A cloaked enemy (the Poacher) is only targetable and visible while standing
   * in light. In a darkness level this is the rule for every enemy; the flag
   * keeps a cloaked foe hidden even if it ever appears outside the dark.
   */
  cloaked?: boolean;
  /** Walks straight through on-path blockers (Thornvine Bramble) instead of chewing. */
  ignoresBlockers?: boolean;
  /** Drains Mana from a nearby Mana flower on a cooldown (the Poacher's theft). */
  stealsFlowers?: boolean;
}
