import { describe, it, expect } from 'vitest';
import {
  ENEMIES,
  DEFENDERS,
  getEnemy,
  getDefender,
  effectiveStats,
} from './content';
import { buildPool, type LoadoutContext } from './loadout';

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

// Content-catalogue coverage for the crossroads level (issue #34, PRD #18).
// Old Stump Crossroads spawns Surveyors and Chainsaw Brutes and unlocks the
// Wisp Willow. The slim app battle throws on any un-catalogued enemy spawn and
// the Loadout pool drops any un-catalogued reward, so these entries are what
// make the level's waves resolvable (AC2) and its reward selectable (AC3).

describe('crossroads enemies are catalogued (issue #34 AC2)', () => {
  it('surveyor resolves with the marking tag and standard combat stats', () => {
    const surveyor = getEnemy('surveyor');
    expect(surveyor).not.toBeNull();
    expect(ENEMIES['surveyor']).toBeDefined();
    expect(surveyor!.tags).toContain('marks-targets');
    expect(surveyor!.hp).toBeGreaterThan(0);
    expect(surveyor!.speed).toBeGreaterThan(0);
    expect(surveyor!.manaBounty).toBeGreaterThan(0);
  });

  it('chainsaw-brute resolves with heavy-chop stats so it spawns without throwing', () => {
    const brute = getEnemy('chainsaw-brute');
    expect(brute).not.toBeNull();
    expect(ENEMIES['chainsaw-brute']).toBeDefined();
    expect(brute!.tags).toContain('heavy-chop');
    expect(brute!.hp).toBeGreaterThan(ENEMIES['logger']!.hp);
    expect(brute!.speed).toBeLessThan(ENEMIES['logger']!.speed);
  });
});

describe('Wisp Willow reward is catalogued (issue #34 AC3)', () => {
  it('wisp-willow resolves as a ranged, anti-air Defender', () => {
    const willow = getDefender('wisp-willow');
    expect(willow).not.toBeNull();
    expect(DEFENDERS['wisp-willow']).toBeDefined();
    expect(willow!.tags).toContain('anti-air');
    expect(willow!.range).toBeGreaterThan(0);
    expect(willow!.damage).toBeGreaterThan(0);
    // Effective stats resolve for the base tier without throwing.
    expect(effectiveStats(willow!, 0).range).toBe(willow!.range);
  });

  it('wisp-willow is immediately available in the crossroads Loadout pool', () => {
    // Level 02 (campaign order 2) cumulatively unlocks the level-01 defenders
    // plus its own Wisp Willow reward. The pool is the catalogued subset, so
    // Wisp Willow must appear before the battle is won.
    const ctx: LoadoutContext = {
      levelOrder: 2,
      availableIds: ['sprig-sentinel', 'thornvine-bramble', 'wisp-willow'],
      catalog: { defenders: DEFENDERS, spells: {} },
    };
    const pool = buildPool(ctx).map((i) => i.id);
    expect(pool).toContain('wisp-willow');
    expect(pool).toContain('sprig-sentinel');
    expect(pool).toContain('thornvine-bramble');
  });
});
