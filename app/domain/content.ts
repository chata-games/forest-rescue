// Engine-independent content catalogue: the stats behind defenders and enemies.
// Ported from src/content/{defenders,enemies}.js and typed for the domain layer.
// The domain depends only on this file plus geometry/path/types — never on Phaser.

import type { DefenderStats, EnemyStats } from './types';

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
