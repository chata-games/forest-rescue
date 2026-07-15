import { describe, it, expect } from 'vitest';
import {
  scoreStars,
  scoreQuality,
  recordResult,
  type BattleScoreInput,
} from './scoring';
import { emptyProgress, resolveTrail, type CampaignManifest, type LevelMeta } from './campaign';

// Meadow's Edge-shaped numbers: 5 Hearts, 150 starting Mana, 100 total bounty.
const BASE: BattleScoreInput = {
  outcome: 'victory',
  hearts: 5,
  maxHearts: 5,
  manaSpent: 0,
  resourcesCollected: 100,
  totalBounty: 100,
  startingMana: 150,
};

/** A two-level manifest so unlock/replay can be observed at the boundary. */
function manifest(): CampaignManifest {
  return {
    schemaVersion: 1,
    id: 'test',
    acts: [{ id: 'a', title: 'Act', levels: ['01-meadows', '02-next'] }],
    levels: [
      { id: '01-meadows', act: 'a', mapPosition: { x: 0.2, y: 0.5 } },
      { id: '02-next', act: 'a', mapPosition: { x: 0.8, y: 0.5 } },
    ],
  };
}

function meta(): Record<string, LevelMeta> {
  return {
    '01-meadows': { id: '01-meadows', name: "Meadow's Edge", biome: 'meadow-edge', waveCount: 8, unlocks: [], spellUnlock: null, bossId: null },
    '02-next': { id: '02-next', name: 'Next', biome: 'meadow', waveCount: 6, unlocks: [], spellUnlock: null, bossId: null },
  };
}

describe('Star scoring rule (issue #29 AC2)', () => {
  it('scores a defeat as zero stars', () => {
    expect(scoreStars({ ...BASE, outcome: 'defeat', hearts: 0 })).toBe(0);
  });

  it('scores a null outcome as zero stars (battle still running)', () => {
    expect(scoreStars({ ...BASE, outcome: null })).toBe(0);
  });

  it('awards 3 stars for a flawless victory (full Hearts, full collection, no spend)', () => {
    expect(scoreStars(BASE)).toBe(3);
  });

  it('awards 1 star for a scrappy victory (few Hearts, thin collection, heavy spend)', () => {
    // 2/5 hearts, 30% collected, spent most of the budget.
    const q = scoreQuality({ ...BASE, hearts: 2, resourcesCollected: 30, manaSpent: 200 });
    expect(q).toBeLessThan(0.5);
    expect(scoreStars({ ...BASE, hearts: 2, resourcesCollected: 30, manaSpent: 200 })).toBe(1);
  });

  it('always grants at least 1 star for any victory', () => {
    // Worst viable victory: 1 heart, nothing collected, entire budget spent.
    expect(scoreStars({ ...BASE, hearts: 1, resourcesCollected: 0, manaSpent: 250 })).toBe(1);
  });

  it('combines all three factors: each one moves the quality on its own', () => {
    // Hearts remaining changes the quality.
    const fullHearts = scoreQuality({ ...BASE, hearts: 5 });
    const lowHearts = scoreQuality({ ...BASE, hearts: 2 });
    expect(fullHearts).toBeGreaterThan(lowHearts);

    // Resources collected changes the quality.
    const fullEconomy = scoreQuality({ ...BASE, resourcesCollected: 100 });
    const thinEconomy = scoreQuality({ ...BASE, resourcesCollected: 20 });
    expect(fullEconomy).toBeGreaterThan(thinEconomy);

    // Mana spent changes the quality (conservation is rewarded).
    const frugal = scoreQuality({ ...BASE, manaSpent: 0 });
    const lavish = scoreQuality({ ...BASE, manaSpent: 200 });
    expect(frugal).toBeGreaterThan(lavish);
  });

  it('clamps each factor so over-collection or over-spend never explodes the score', () => {
    // Collecting more than the total bounty caps at full economy credit.
    expect(scoreQuality({ ...BASE, resourcesCollected: 999 })).toBeLessThanOrEqual(1);
    // Spending more than the budget caps at zero efficiency credit (not negative).
    expect(scoreQuality({ ...BASE, manaSpent: 999 })).toBeGreaterThanOrEqual(0);
  });
});

describe('Result flow at the campaign/application boundary (issue #29 AC1/AC3/AC4)', () => {
  it('a victory records progress and unlocks the next level', () => {
    let progress = emptyProgress();
    progress = recordResult(progress, '01-meadows', BASE); // 3-star victory
    const nodes = resolveTrail(manifest(), meta(), progress);
    expect(nodes.map((n) => n.status)).toEqual(['cleared', 'current']);
    expect(nodes[0]!.stars).toBe(3);
    // The freshly unlocked level is enterable.
    expect(nodes[1]!.enterable).toBe(true);
  });

  it('a loss advances nothing: the next level stays locked', () => {
    let progress = emptyProgress();
    progress = recordResult(progress, '01-meadows', { ...BASE, outcome: 'defeat', hearts: 0 });
    const nodes = resolveTrail(manifest(), meta(), progress);
    expect(nodes.map((n) => n.status)).toEqual(['current', 'locked']);
    expect(nodes[1]!.enterable).toBe(false);
  });

  it('replaying with a worse result preserves the best star result', () => {
    let progress = emptyProgress();
    progress = recordResult(progress, '01-meadows', BASE); // 3 stars
    progress = recordResult(progress, '01-meadows', { ...BASE, hearts: 2, resourcesCollected: 30, manaSpent: 200 }); // 1 star
    const node = resolveTrail(manifest(), meta(), progress)[0]!;
    expect(node.stars).toBe(3); // the earlier better result is kept
    expect(node.status).toBe('cleared');
  });

  it('replaying with a better result raises the best star result', () => {
    let progress = emptyProgress();
    progress = recordResult(progress, '01-meadows', { ...BASE, hearts: 2, resourcesCollected: 30, manaSpent: 200 }); // 1 star
    progress = recordResult(progress, '01-meadows', BASE); // 3 stars
    expect(resolveTrail(manifest(), meta(), progress)[0]!.stars).toBe(3);
  });
});
