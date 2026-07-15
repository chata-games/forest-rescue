import { describe, it, expect } from 'vitest';
import {
  GUIDANCE_MAX,
  defaultGuidance,
  guidanceActive,
  guidanceForClearedCount,
  setGuidanceEnabled,
  reduceGuidance,
  sanitizeGuidance,
  coachingAdvice,
  type GuidanceState,
  type CoachingInput,
} from './guidance';

// Engine-independent Guidance + retry-coaching rules (issue #23). Nothing here
// touches the DOM, localStorage, or Phaser — it is the pure boundary the shell
// and these tests drive, mirroring the save and loadout contracts.

// --- AC1: defaults enabled, independently toggleable, fades on success --------

describe('guidance defaults and activity (AC1)', () => {
  it('defaults to enabled at full intensity, so a new Guardian is guided', () => {
    const g = defaultGuidance();
    expect(g.enabled).toBe(true);
    expect(g.level).toBe(GUIDANCE_MAX);
    expect(guidanceActive(g)).toBe(true);
  });

  it('is active only while opted in AND intensity has not faded to zero', () => {
    expect(guidanceActive({ enabled: true, level: 2 })).toBe(true);
    // Opted out: inactive even at full intensity (independent toggle).
    expect(guidanceActive({ enabled: false, level: GUIDANCE_MAX })).toBe(false);
    // Faded out: inactive even while still opted in (eventual disable).
    expect(guidanceActive({ enabled: true, level: 0 })).toBe(false);
  });

  it('Challenge mode is absent — there is no challenge field or concept', () => {
    // AC2: Standard Challenge and Challenge-specific records/controls are absent
    // from v1. Guidance is the sole surviving half of the pair, independently
    // configurable. The state carries only the guidance preference.
    const g: GuidanceState = defaultGuidance();
    expect(Object.keys(g).sort()).toEqual(['enabled', 'level']);
  });
});

describe('setGuidanceEnabled: the independent toggle (AC1)', () => {
  it('flips the preference without touching the faded intensity', () => {
    const g = setGuidanceEnabled({ enabled: true, level: 2 }, false);
    expect(g.enabled).toBe(false);
    expect(g.level).toBe(2);
    expect(guidanceActive(g)).toBe(false);
  });

  it('is pure — the input is not mutated', () => {
    const original: GuidanceState = { enabled: true, level: 3 };
    setGuidanceEnabled(original, false);
    expect(original).toEqual({ enabled: true, level: 3 });
  });

  it('re-enabling restores activity when intensity remains', () => {
    const off = setGuidanceEnabled({ enabled: true, level: 3 }, false);
    const back = setGuidanceEnabled(off, true);
    expect(guidanceActive(back)).toBe(true);
  });
});

describe('reduceGuidance: fades after a successful completion (AC1)', () => {
  it('steps the intensity down by one per completion', () => {
    expect(reduceGuidance({ enabled: true, level: 3 }).level).toBe(2);
    expect(reduceGuidance({ enabled: true, level: 2 }).level).toBe(1);
  });

  it('eventually disables guidance by bottoming the intensity at zero', () => {
    let g: GuidanceState = { enabled: true, level: 3 };
    g = reduceGuidance(g); // 2
    g = reduceGuidance(g); // 1
    g = reduceGuidance(g); // 0
    expect(g.level).toBe(0);
    // Still opted in, but the faded intensity has disabled guidance.
    expect(g.enabled).toBe(true);
    expect(guidanceActive(g)).toBe(false);
  });

  it('never reduces below zero', () => {
    expect(reduceGuidance({ enabled: true, level: 0 }).level).toBe(0);
  });

  it('is pure — the input is not mutated', () => {
    const original: GuidanceState = { enabled: true, level: 3 };
    reduceGuidance(original);
    expect(original).toEqual({ enabled: true, level: 3 });
  });
});

describe('guidanceForClearedCount: reconstructing faded guidance on migration (AC1/AC6)', () => {
  it('starts a Guardian with no clears at full intensity', () => {
    expect(guidanceForClearedCount(0)).toEqual({ enabled: true, level: GUIDANCE_MAX });
  });

  it('fades once per cleared level, matching reduceGuidance applied N times', () => {
    expect(guidanceForClearedCount(1).level).toBe(2);
    expect(guidanceForClearedCount(2).level).toBe(1);
  });

  it('graduates (level 0) at and beyond the max number of clears', () => {
    expect(guidanceForClearedCount(GUIDANCE_MAX).level).toBe(0);
    expect(guidanceForClearedCount(99).level).toBe(0);
    expect(guidanceActive(guidanceForClearedCount(99))).toBe(false);
  });

  it('stays opted in regardless of how many levels are cleared', () => {
    expect(guidanceForClearedCount(50).enabled).toBe(true);
  });
});

// --- sanitizeGuidance: recovery across the persistence boundary (AC6) ---------

describe('sanitizeGuidance: lenient recovery of persisted state (AC6)', () => {
  it('adopts the default for a missing or non-object value', () => {
    for (const empty of [undefined, null, 'x', 42, []]) {
      expect(sanitizeGuidance(empty)).toEqual(defaultGuidance());
    }
  });

  it('preserves a valid preference exactly', () => {
    expect(sanitizeGuidance({ enabled: false, level: 2 })).toEqual({ enabled: false, level: 2 });
  });

  it('defaults enabled to true unless explicitly false', () => {
    expect(sanitizeGuidance({ level: 2 }).enabled).toBe(true);
    expect(sanitizeGuidance({ enabled: false, level: 2 }).enabled).toBe(false);
  });

  it('clamps a wild intensity back into 0..max', () => {
    expect(sanitizeGuidance({ enabled: true, level: 99 }).level).toBe(GUIDANCE_MAX);
    expect(sanitizeGuidance({ enabled: true, level: -3 }).level).toBe(0);
    expect(sanitizeGuidance({ enabled: true, level: 'two' }).level).toBe(GUIDANCE_MAX);
  });
});

// --- AC5: opt-in coaching from observable battle results ---------------------

function input(over: Partial<CoachingInput> = {}): CoachingInput {
  return {
    outcome: 'defeat',
    stars: 0,
    hearts: 0,
    maxHearts: 5,
    manaSpent: 80,
    resourcesCollected: 40,
    totalBounty: 200,
    startingMana: 150,
    hadBlocker: true,
    hadRanged: true,
    ...over,
  };
}

describe('coachingAdvice: opt-in, observable, non-blocking (AC5)', () => {
  it('never throws and always returns plain-language, non-blocking advice', () => {
    const tips = coachingAdvice(input());
    expect(Array.isArray(tips)).toBe(true);
    for (const t of tips) expect(typeof t).toBe('string');
  });

  it('advises a blocker when the Loadout brought none', () => {
    const tips = coachingAdvice(input({ hadBlocker: false }));
    expect(tips.some((t) => /block/i.test(t))).toBe(true);
  });

  it('advises a ranged defender when the Loadout brought none', () => {
    const tips = coachingAdvice(input({ hadRanged: false }));
    expect(tips.some((t) => /ranged/i.test(t))).toBe(true);
  });

  it('flags reaching-the-Heartwood damage on a defeat', () => {
    const tips = coachingAdvice(input({ hearts: 1, maxHearts: 5 }));
    expect(tips.some((t) => /heartwood|reached|front|sooner/i.test(t))).toBe(true);
  });

  it('advises economy gathering when little bounty was collected', () => {
    const tips = coachingAdvice(input({ resourcesCollected: 10, totalBounty: 200 }));
    expect(tips.some((t) => /mana|bounty|flower|gather/i.test(t))).toBe(true);
  });

  it('celebrates a flawless victory without nagging improvements', () => {
    const tips = coachingAdvice(
      input({ outcome: 'victory', stars: 3, hearts: 5, maxHearts: 5, resourcesCollected: 200 }),
    );
    expect(tips.length).toBe(1);
    expect(/flawless|nothing to improve/i.test(tips[0]!)).toBe(true);
  });

  it('suggests efficiency gains on a low-star victory', () => {
    const tips = coachingAdvice(
      input({
        outcome: 'victory',
        stars: 1,
        hearts: 5,
        maxHearts: 5,
        manaSpent: 320,
        resourcesCollected: 200,
        totalBounty: 200,
        startingMana: 150,
      }),
    );
    expect(tips.some((t) => /efficiency|conserve|spen/i.test(t))).toBe(true);
  });

  it('is pure — the input is not mutated', () => {
    const i = input();
    coachingAdvice(i);
    expect(i).toEqual(input());
  });
});
