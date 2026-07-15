import { describe, it, expect } from 'vitest';
import { DEFENDERS, ENEMIES, getDefender, getEnemy } from './content';
import { buildPool } from './loadout';

// Catalogue entries the shipped levels reference. Whispering River (issue #35)
// spawns chainsaw-brute + buzzsaw-drone and unlocks wisp-willow + dewdrop-nymph,
// so those four must resolve in the app catalogue (the slim battle slice still
// needs them so the level does not crash and its rewards reach the Loadout).

describe('river enemies (issue #35 AC1/AC5)', () => {
  it('resolves chainsaw-brute as a heavy ground foe', () => {
    const e = getEnemy('chainsaw-brute');
    expect(e).not.toBeNull();
    expect(e!.hp).toBeGreaterThan(ENEMIES.logger.hp);
    expect(e!.tags).toContain('ground');
    expect(e!.flying ?? false).toBe(false);
  });

  it('resolves buzzsaw-drone as a flying foe', () => {
    const e = getEnemy('buzzsaw-drone');
    expect(e).not.toBeNull();
    expect(e!.flying).toBe(true);
    expect(e!.tags).toContain('flying');
  });

  it('never throws on an authored river wave enemy type', () => {
    for (const type of ['logger', 'chainsaw-brute', 'buzzsaw-drone']) {
      expect(getEnemy(type)).not.toBeNull();
    }
  });
});

describe('river defender unlocks (issue #35 AC3)', () => {
  it('resolves wisp-willow and dewdrop-nymph', () => {
    expect(getDefender('wisp-willow')).not.toBeNull();
    expect(getDefender('dewdrop-nymph')).not.toBeNull();
    // wisp-willow is the anti-air answer the river teaches.
    expect(DEFENDERS['wisp-willow']!.tags).toContain('anti-air');
  });

  it('places dewdrop-nymph in the Loadout pool once the river is unlocked', () => {
    // Cumulative unlocks for level 3 (Whispering River): everything from levels 1–3.
    const availableIds = ['sprig-sentinel', 'thornvine-bramble', 'wisp-willow', 'dewdrop-nymph'];
    const pool = buildPool({
      levelOrder: 3,
      availableIds,
      catalog: { defenders: DEFENDERS, spells: {} },
    });
    const ids = pool.map((p) => p.id);
    expect(ids).toContain('dewdrop-nymph');
    expect(ids).toContain('wisp-willow');
  });
});
