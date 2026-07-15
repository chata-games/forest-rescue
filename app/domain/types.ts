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
}
