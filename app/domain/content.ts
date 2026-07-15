// Engine-independent content catalogue: the stats behind defenders and enemies.
// Ported from src/content/{defenders,enemies}.js and typed for the domain layer.
// The domain depends only on this file plus geometry/path/types — never on Phaser.

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
