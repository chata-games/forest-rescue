import { describe, it, expect } from 'vitest';
import type { DefenderStats } from './types';
import type { SpellStats } from './content';
import {
  loadoutCapacity,
  buildPool,
  emptyLoadout,
  starterLoadout,
  canStart,
  addToLoadout,
  clearSlot,
  validateLoadout,
  loadoutAdvice,
  buildLoadoutView,
  type Loadout,
  type LoadoutContext,
  type LoadoutCatalog,
  type AvailableItem,
} from './loadout';

// --- Test catalogues ------------------------------------------------------

function def(
  partial: Partial<DefenderStats> & Pick<DefenderStats, 'id' | 'name' | 'cost' | 'placement'>,
): DefenderStats {
  return {
    range: 100,
    damage: 10,
    cooldown: 1,
    hp: 100,
    tags: [],
    sprite: '',
    projectile: '',
    ...partial,
  };
}

function spell(
  partial: Partial<SpellStats> & Pick<SpellStats, 'id' | 'name' | 'cost'>,
): SpellStats {
  return { cooldown: 10, radius: 100, effect: 'root', ...partial };
}

/** A catalogue with a ranged Defender, a blocker, and one spell. */
function catalog(): LoadoutCatalog {
  return {
    defenders: {
      'sprig-sentinel': def({ id: 'sprig-sentinel', name: 'Sprig Sentinel', cost: 50, placement: 'beside-path' }),
      'thornvine-bramble': def({
        id: 'thornvine-bramble',
        name: 'Thornvine Bramble',
        cost: 35,
        placement: 'on-path',
        blocksPath: true,
      }),
    },
    spells: {
      'root-snare': spell({ id: 'root-snare', name: 'Root Snare', cost: 45 }),
    },
  };
}

function ctx(availableIds: string[], levelOrder = 1, cat: LoadoutCatalog = catalog()): LoadoutContext {
  return { levelOrder, availableIds, catalog: cat };
}

const sprig: AvailableItem = { kind: 'defender', id: 'sprig-sentinel', name: 'Sprig Sentinel', cost: 50 };
const bramble: AvailableItem = { kind: 'defender', id: 'thornvine-bramble', name: 'Thornvine Bramble', cost: 35 };
const snare: AvailableItem = { kind: 'spell', id: 'root-snare', name: 'Root Snare', cost: 45 };

// --- Capacity (AC2) -------------------------------------------------------

describe('loadoutCapacity', () => {
  it('grants one slot at level 1', () => {
    expect(loadoutCapacity(1)).toBe(1);
  });

  it('grants two slots at levels 2 and 3', () => {
    expect(loadoutCapacity(2)).toBe(2);
    expect(loadoutCapacity(3)).toBe(2);
  });

  it('grants four slots at levels 4 through 10', () => {
    for (const order of [4, 5, 6, 7, 8, 9, 10]) {
      expect(loadoutCapacity(order)).toBe(4);
    }
  });

  it('never grants the post-v1 eight-slot tier', () => {
    // The whole v1 ladder tops out at 4 slots.
    for (let order = 1; order <= 10; order++) {
      expect(loadoutCapacity(order)).toBeLessThanOrEqual(4);
    }
  });

  it('clamps a non-positive order to the starter capacity', () => {
    expect(loadoutCapacity(0)).toBe(1);
  });
});

// --- Available pool (AC1/AC3) --------------------------------------------

describe('buildPool', () => {
  it('lists only catalogued defenders and spells as immediately available', () => {
    // wisp-willow is unlocked but not yet in the catalogue → not immediately available.
    const pool = buildPool(ctx(['sprig-sentinel', 'wisp-willow', 'root-snare']));
    expect(pool).toEqual([sprig, snare]);
  });

  it('keeps defenders before spells in campaign unlock order', () => {
    const pool = buildPool(ctx(['root-snare', 'sprig-sentinel']));
    // Order follows the availableIds input, not kind, so the Guardian sees rewards
    // in the order they were earned.
    expect(pool).toEqual([snare, sprig]);
  });

  it('deduplicates an id unlocked by more than one level', () => {
    const pool = buildPool(ctx(['sprig-sentinel', 'sprig-sentinel', 'thornvine-bramble']));
    expect(pool).toEqual([sprig, bramble]);
  });

  it('carries the name and cost from the catalogue', () => {
    const pool = buildPool(ctx(['thornvine-bramble']));
    expect(pool[0]).toMatchObject({ name: 'Thornvine Bramble', cost: 35 });
  });

  it('classifies each entry as a defender or a spell', () => {
    const pool = buildPool(ctx(['sprig-sentinel', 'root-snare']));
    expect(pool.map((p) => p.kind)).toEqual(['defender', 'spell']);
  });
});

// --- Starter loadout (AC3) -----------------------------------------------

describe('starterLoadout', () => {
  it('fills every slot up to capacity with defenders first, then spells', () => {
    // Level 4 → 4 slots; pool has 2 defenders + 1 spell = 3 items.
    const loadout = starterLoadout(ctx(['sprig-sentinel', 'thornvine-bramble', 'root-snare'], 4));
    expect(loadout.length).toBe(4);
    expect(loadout.slice(0, 2)).toEqual([sprig, bramble]);
    expect(loadout[2]).toEqual(snare);
    expect(loadout[3]).toBeNull();
  });

  it('never exceeds capacity, even when more is unlocked', () => {
    const loadout = starterLoadout(ctx(['sprig-sentinel', 'thornvine-bramble', 'root-snare'], 1));
    expect(loadout.length).toBe(1);
    expect(loadout[0]).toEqual(sprig);
  });

  it('is always ready to start (a valid starter choice)', () => {
    const loadout = starterLoadout(ctx(['sprig-sentinel'], 1));
    expect(canStart(loadout)).toBe(true);
    expect(validateLoadout(loadout, ctx(['sprig-sentinel'], 1)).valid).toBe(true);
  });

  it('leaves slots empty when nothing is immediately available', () => {
    const loadout = starterLoadout(ctx(['wisp-willow'], 2));
    expect(loadout).toEqual([null, null]);
    expect(canStart(loadout)).toBe(false);
  });
});

// --- canStart (AC4) -------------------------------------------------------

describe('canStart', () => {
  it('is false for an empty loadout', () => {
    expect(canStart(emptyLoadout(2))).toBe(false);
  });

  it('is true as soon as one slot is filled', () => {
    expect(canStart([sprig, null])).toBe(true);
  });

  it('stays true when only a spell is chosen', () => {
    expect(canStart([snare, null])).toBe(true);
  });
});

// --- Editing operations ---------------------------------------------------

describe('addToLoadout', () => {
  it('places an item in the first empty slot and returns a new loadout', () => {
    const before: Loadout = [null, null];
    const after = addToLoadout(before, sprig);
    expect(before).toEqual([null, null]); // pure: input untouched
    expect(after).toEqual([sprig, null]);
  });

  it('refuses to duplicate an item already in a slot', () => {
    const after = addToLoadout([sprig, null], sprig);
    expect(after).toEqual([sprig, null]);
  });

  it('is a no-op when every slot is full', () => {
    const full: Loadout = [sprig];
    expect(addToLoadout(full, bramble)).toEqual([sprig]);
  });

  it('packs new items into the earliest gap left by a cleared slot', () => {
    expect(addToLoadout([sprig, null], bramble)).toEqual([sprig, bramble]);
    expect(addToLoadout([null, sprig], bramble)).toEqual([bramble, sprig]);
  });
});

describe('clearSlot', () => {
  it('empties a filled slot and leaves the rest untouched', () => {
    expect(clearSlot([sprig, bramble], 0)).toEqual([null, bramble]);
  });

  it('ignores an out-of-range index', () => {
    expect(clearSlot([sprig], 5)).toEqual([sprig]);
  });
});

// --- Validation -----------------------------------------------------------

describe('validateLoadout', () => {
  it('accepts a partial loadout of known, unique items', () => {
    const result = validateLoadout([sprig, null], ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    expect(result.valid).toBe(true);
    expect(result.canStart).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('rejects an item that is not in the available pool', () => {
    const result = validateLoadout([bramble, null], ctx(['sprig-sentinel'], 2));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown-item');
  });

  it('rejects a duplicated item', () => {
    const result = validateLoadout([sprig, sprig], ctx(['sprig-sentinel'], 2));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('duplicate');
  });

  it('flags an over-capacity loadout', () => {
    // Capacity 1 at level 1, but two items supplied.
    const result = validateLoadout([sprig, bramble], ctx(['sprig-sentinel', 'thornvine-bramble'], 1));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('over-capacity');
  });

  it('reports a valid but not-yet-startable empty loadout', () => {
    const result = validateLoadout([null], ctx(['sprig-sentinel'], 1));
    expect(result.valid).toBe(true);
    expect(result.canStart).toBe(false);
  });
});

// --- Advice (AC5: explanatory, non-blocking) ------------------------------

describe('loadoutAdvice', () => {
  it('warns when no Defender is chosen at all', () => {
    const advice = loadoutAdvice([snare, null], ctx(['sprig-sentinel', 'root-snare'], 2));
    expect(advice.warnings.some((w) => /no defender/i.test(w))).toBe(true);
  });

  it('warns about a missing ranged Defender only when one is available', () => {
    const advice = loadoutAdvice([bramble, null], ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    expect(advice.warnings.some((w) => /ranged/i.test(w))).toBe(true);
  });

  it('does not warn about a missing blocker when none is available', () => {
    const onlyRanged = { defenders: { 'sprig-sentinel': catalog().defenders['sprig-sentinel']! }, spells: {} };
    const advice = loadoutAdvice([sprig], ctx(['sprig-sentinel'], 2, onlyRanged));
    expect(advice.warnings.some((w) => /blocker/i.test(w))).toBe(false);
  });

  it('offers a recommendation naming the starter loadout', () => {
    const advice = loadoutAdvice([sprig], ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    expect(advice.recommendation).not.toBeNull();
    expect(advice.recommendation).toContain('Sprig Sentinel');
  });

  it('never blocks Start — warnings are advisory', () => {
    const loadout = starterLoadout(ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    const advice = loadoutAdvice(loadout, ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    // A complete starter has nothing to warn about and stays startable.
    expect(advice.warnings).toEqual([]);
    expect(canStart(loadout)).toBe(true);
  });
});

// --- View projector (browser-facing) --------------------------------------

describe('buildLoadoutView', () => {
  it('exposes capacity, slot labels, and the Start gate', () => {
    const view = buildLoadoutView([sprig, null], ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    expect(view.capacity).toBe(2);
    expect(view.slots[0]).toMatchObject({ filled: true, label: expect.stringContaining('Sprig Sentinel') });
    expect(view.slots[1]).toMatchObject({ filled: false });
    expect(view.canStart).toBe(true);
    expect(view.startDisabledReason).toBeNull();
  });

  it('gives a reason while Start is disabled for an empty loadout', () => {
    const view = buildLoadoutView([null], ctx(['sprig-sentinel'], 1));
    expect(view.canStart).toBe(false);
    expect(view.startDisabledReason).not.toBeNull();
  });

  it('labels each slot with its kind for assistive tech', () => {
    const view = buildLoadoutView([snare, null], ctx(['root-snare'], 2));
    expect(view.slots[0]?.kind).toBe('spell');
    expect(view.slots[0]?.label).toContain('Root Snare');
    expect(view.slots[1]?.kind).toBeNull();
  });

  it('threads the pool and advice through for rendering', () => {
    const view = buildLoadoutView([sprig], ctx(['sprig-sentinel', 'thornvine-bramble'], 2));
    expect(view.pool.map((p) => p.id)).toContain('thornvine-bramble');
    expect(view.advice).toBeDefined();
  });
});
