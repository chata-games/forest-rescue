// Engine-independent content catalogue: the stats behind defenders, enemies,
// and Guardian spells. Ported from src/content/{defenders,enemies,spells}.js and
// typed for the domain layer. The domain depends only on this file plus
// geometry/path/types — never on Phaser.

import type { DefenderStats, EnemyStats, UpgradeTier } from './types';

/** A Defender's resolved combat stats at a specific upgrade tier. */
export interface EffectiveStats {
  range: number;
  damage: number;
  hp: number;
  cooldown: number;
  poisonDps: number;
  poisonDuration: number;
  armorPierce: number;
}

/**
 * What a spell does where it lands. The combat depth of each effect (e.g. fire
 * dousing for Cleansing Rain) is layered in elsewhere; this enum only names the
 * self-contained, observable effect the engine-independent battle applies so the
 * cast-commit path is testable without a full hazard model.
 */
export type SpellEffect = 'root' | 'heal';

export interface SpellStats {
  id: string;
  name: string;
  cost: number;
  /** Seconds of battle time the Guardian must wait between casts. */
  cooldown: number;
  /** World-unit radius of the area the spell affects (preview + effect). */
  radius: number;
  effect: SpellEffect;
  /** For 'root': how long grounded enemies in the radius are frozen. */
  rootDuration?: number;
  /** For 'heal': HP restored to defenders in the radius. */
  heal?: number;
}

export const DEFENDERS: Record<string, DefenderStats> = {
  'sprig-sentinel': {
    id: 'sprig-sentinel',
    name: 'Sprig Sentinel',
    cost: 50,
    range: 160,
    damage: 35,
    cooldown: 1.15,
    hp: 95,
    tags: ['forest', 'dps'],
    placement: 'beside-path',
    sprite: 'sprig-sentinel-idle',
    projectile: 'seed-bolt',
    upgrades: [
      // Tier 1: sharper seeds reach further.
      { cost: 45, damage: 55, range: 175 },
      // Tier 2: heavy rapid-fire bloom.
      { cost: 80, damage: 85, range: 195, cooldown: 0.95 },
    ],
  },
  'thornvine-bramble': {
    id: 'thornvine-bramble',
    name: 'Thornvine Bramble',
    cost: 35,
    range: 0,
    damage: 0,
    cooldown: 0,
    hp: 180,
    tags: ['forest', 'blocker'],
    placement: 'on-path',
    sprite: 'thornvine-bramble-idle',
    projectile: '',
    blocksPath: true,
    upgrades: [
      // Tier 1: a thicker weave so Loggers chew longer.
      { cost: 30, hp: 300 },
      // Tier 2: barbed thorns poison anything trying to push through.
      { cost: 50, hp: 460, poisonDps: 6, poisonDuration: 2 },
    ],
  },
  'wisp-willow': {
    id: 'wisp-willow',
    name: 'Wisp Willow',
    cost: 90,
    range: 180,
    damage: 28,
    cooldown: 0.85,
    hp: 70,
    tags: ['arcane', 'anti-air', 'chain'],
    placement: 'beside-path',
    sprite: 'wisp-willow-idle',
    projectile: 'chain-lightning',
  },
  'dewdrop-nymph': {
    id: 'dewdrop-nymph',
    name: 'Dewdrop Nymph',
    cost: 75,
    range: 140,
    damage: 18,
    cooldown: 1.4,
    hp: 80,
    tags: ['control', 'slow', 'rust', 'douses-fire'],
    placement: 'beside-path',
    sprite: 'dewdrop-nymph-idle',
    projectile: 'dew-splash',
  },
  'firefly-beacon': {
    id: 'firefly-beacon',
    name: 'Firefly Beacon',
    cost: 60,
    range: 0,
    damage: 0,
    cooldown: 0,
    hp: 65,
    tags: ['support', 'light'],
    placement: 'beside-path',
    sprite: 'firefly-beacon-idle',
    projectile: '',
    // A support Defender: it casts no attacks of its own (range 0 skips combat),
    // but its glow pushes back the dark so other Defenders can strike, and it
    // emboldens nearby allies with extra reach and punch.
    supportOnly: true,
    glowRadius: 210,
  },
  'mushroom-shaman': {
    id: 'mushroom-shaman',
    name: 'Mushroom Shaman',
    cost: 80,
    range: 130,
    damage: 8,
    cooldown: 1.1,
    hp: 85,
    tags: ['poison', 'aoe'],
    placement: 'beside-path',
    sprite: 'mushroom-shaman-idle',
    projectile: 'spore-cloud',
    poisonDps: 10,
    poisonDuration: 4,
  },
};

export const ENEMIES: Record<string, EnemyStats> = {
  logger: {
    id: 'logger',
    name: 'Logger',
    hp: 115,
    speed: 42,
    damage: 28,
    attackInterval: 0.95,
    manaBounty: 8,
    tags: ['crew', 'ground', 'choppable'],
  },
  surveyor: {
    id: 'surveyor',
    name: 'Surveyor',
    hp: 95,
    speed: 48,
    damage: 18,
    attackInterval: 1.1,
    manaBounty: 10,
    tags: ['crew', 'ground', 'marks-targets'],
  },
  'chainsaw-brute': {
    id: 'chainsaw-brute',
    name: 'Chainsaw Brute',
    hp: 200,
    speed: 30,
    damage: 45,
    attackInterval: 0.8,
    manaBounty: 14,
    tags: ['crew', 'ground', 'choppable', 'heavy-chop'],
  },
  'buzzsaw-drone': {
    id: 'buzzsaw-drone',
    name: 'Buzzsaw Drone',
    hp: 85,
    speed: 55,
    damage: 22,
    attackInterval: 1.0,
    manaBounty: 12,
    tags: ['machine', 'flying'],
    // Flies the river's air lane, bypassing the winding ground trail (issue #35).
    flying: true,
  },
  poacher: {
    id: 'poacher',
    name: 'Poacher',
    hp: 90,
    speed: 52,
    damage: 20,
    attackInterval: 1.0,
    manaBounty: 11,
    tags: ['crew', 'ground', 'cloaked', 'steals-flowers'],
    // A cloaked sneak: only visible and strikeable in light, slips past Brambles,
    // and snatches Mana flowers as it passes — so lighting the trail matters.
    cloaked: true,
    ignoresBlockers: true,
    stealsFlowers: true,
  },
};

// Guardian spells: targeted abilities the Guardian arms, aims at the battlefield
// with an area preview, and commits on a clean pointer-up. Costs and cooldowns
// mirror the authored catalogue; a spell is only selectable when it is unlocked
// for the current level, off cooldown, and affordable (issue #31).
export const SPELLS: Record<string, SpellStats> = {
  'root-snare': {
    id: 'root-snare',
    name: 'Root Snare',
    cost: 45,
    cooldown: 25,
    radius: 140,
    effect: 'root',
    rootDuration: 3.5,
  },
  'cleansing-rain': {
    id: 'cleansing-rain',
    name: 'Cleansing Rain',
    cost: 50,
    cooldown: 22,
    radius: 160,
    effect: 'heal',
    heal: 60,
  },
};

export function getDefender(id: string): DefenderStats | null {
  return DEFENDERS[id] ?? null;
}

export function getEnemy(id: string): EnemyStats | null {
  return ENEMIES[id] ?? null;
}

/**
 * The upgrade ladder's top tier for a Defender (0 when it has no upgrades).
 * A Defender on `tier` can be upgraded while `tier < maxTier`.
 */
export function maxTier(stats: DefenderStats): number {
  return stats.upgrades?.length ?? 0;
}

/**
 * Resolve a Defender's combat stats at a given tier. Tier 0 is the base; each
 * upgrade entry replaces only the fields it names, applied in order. Out-of-range
 * tiers clamp to the ladder's top so a corrupt tier can never exceed the author's
 * intent.
 */
export function effectiveStats(base: DefenderStats, tier: number): EffectiveStats {
  const s: EffectiveStats = {
    range: base.range,
    damage: base.damage,
    hp: base.hp,
    cooldown: base.cooldown,
    poisonDps: base.poisonDps ?? 0,
    poisonDuration: base.poisonDuration ?? 0,
    armorPierce: base.armorPierce ?? 0,
  };
  const tiers: UpgradeTier[] = base.upgrades ?? [];
  const stop = Math.min(Math.max(0, tier), tiers.length);
  for (let i = 0; i < stop; i++) {
    const u = tiers[i];
    if (u.range !== undefined) s.range = u.range;
    if (u.damage !== undefined) s.damage = u.damage;
    if (u.hp !== undefined) s.hp = u.hp;
    if (u.cooldown !== undefined) s.cooldown = u.cooldown;
    if (u.poisonDps !== undefined) s.poisonDps = u.poisonDps;
    if (u.poisonDuration !== undefined) s.poisonDuration = u.poisonDuration;
    if (u.armorPierce !== undefined) s.armorPierce = u.armorPierce;
  }
  return s;
}

/** Mana cost to upgrade FROM `tier` to `tier + 1`, or null at the ladder's top. */
export function upgradeCost(base: DefenderStats, tier: number): number | null {
  const tiers = base.upgrades ?? [];
  if (tier < 0 || tier >= tiers.length) return null;
  return tiers[tier].cost;
}

export function getSpell(id: string): SpellStats | null {
  return SPELLS[id] ?? null;
}
