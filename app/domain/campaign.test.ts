import { describe, it, expect } from 'vitest';
import {
  resolveTrail,
  emptyProgress,
  markCleared,
  type CampaignManifest,
  type LevelMeta,
  type CampaignProgress,
} from './campaign';

/** A compact three-level manifest used to exercise linear unlock progression. */
function manifest(): CampaignManifest {
  return {
    schemaVersion: 1,
    id: 'test',
    title: 'Test Campaign',
    acts: [
      { id: 'act-1', title: 'First', levels: ['01-meadows', '02-crossroads'] },
      { id: 'act-2', title: 'Second', levels: ['03-river'] },
    ],
    levels: [
      { id: '01-meadows', act: 'act-1', mapPosition: { x: 0.1, y: 0.8 }, unlocks: ['sprig-sentinel'] },
      { id: '02-crossroads', act: 'act-1', mapPosition: { x: 0.4, y: 0.5 }, unlocks: ['wisp-willow'] },
      { id: '03-river', act: 'act-2', mapPosition: { x: 0.8, y: 0.3 }, spellUnlock: 'root-snare' },
    ],
  };
}

function meta(): Record<string, LevelMeta> {
  return {
    '01-meadows': { id: '01-meadows', name: "Meadow's Edge", biome: 'meadow-edge', waveCount: 8, unlocks: ['sprig-sentinel'], spellUnlock: null, bossId: null },
    '02-crossroads': { id: '02-crossroads', name: 'Old Stump Crossroads', biome: 'stump', waveCount: 9, unlocks: ['wisp-willow'], spellUnlock: null, bossId: null },
    '03-river': { id: '03-river', name: 'Whispering River', biome: 'river', waveCount: 7, unlocks: [], spellUnlock: 'root-snare', bossId: null },
  };
}

describe('Campaign trail resolution', () => {
  it('presents every level in manifest order', () => {
    const nodes = resolveTrail(manifest(), meta(), emptyProgress());
    expect(nodes.map((n) => n.id)).toEqual(['01-meadows', '02-crossroads', '03-river']);
    expect(nodes.map((n) => n.order)).toEqual([1, 2, 3]);
  });

  it('marks only the first level as current on a fresh campaign', () => {
    const nodes = resolveTrail(manifest(), meta(), emptyProgress());
    expect(nodes.map((n) => n.status)).toEqual(['current', 'locked', 'locked']);
    // Only the current level is enterable at the start.
    expect(nodes.map((n) => n.enterable)).toEqual([true, false, false]);
  });

  it('promotes the next level to current after the prior level is cleared', () => {
    const progress = markCleared(emptyProgress(), '01-meadows', 2);
    const nodes = resolveTrail(manifest(), meta(), progress);
    expect(nodes.map((n) => n.status)).toEqual(['cleared', 'current', 'locked']);
    // Cleared levels stay enterable for replay; the new current is enterable.
    expect(nodes.map((n) => n.enterable)).toEqual([true, true, false]);
  });

  it('keeps the best star result across replays', () => {
    let progress = markCleared(emptyProgress(), '01-meadows', 2);
    progress = markCleared(progress, '01-meadows', 1); // a worse replay must not lower it
    const node = resolveTrail(manifest(), meta(), progress).find((n) => n.id === '01-meadows')!;
    expect(node.stars).toBe(2);
    expect(node.status).toBe('cleared');
  });

  it('marks the whole campaign cleared once every level is won', () => {
    let progress: CampaignProgress = emptyProgress();
    progress = markCleared(progress, '01-meadows', 3);
    progress = markCleared(progress, '02-crossroads', 3);
    progress = markCleared(progress, '03-river', 2);
    const nodes = resolveTrail(manifest(), meta(), progress);
    expect(nodes.map((n) => n.status)).toEqual(['cleared', 'cleared', 'cleared']);
    expect(nodes.every((n) => n.enterable)).toBe(true);
  });

  it('explains the unlock requirement for locked nodes using the prior level name', () => {
    const nodes = resolveTrail(manifest(), meta(), emptyProgress());
    const river = nodes.find((n) => n.id === '03-river')!;
    expect(river.status).toBe('locked');
    expect(river.unlockRequirement).toContain('Old Stump Crossroads');
    expect(river.enterable).toBe(false);
    // Current/cleared nodes carry no unlock requirement.
    expect(nodes[0].unlockRequirement).toBeNull();
  });

  it('carries level metadata and reward unlocks into each node', () => {
    const nodes = resolveTrail(manifest(), meta(), emptyProgress());
    const meadows = nodes[0];
    expect(meadows.name).toBe("Meadow's Edge");
    expect(meadows.biome).toBe('meadow-edge');
    expect(meadows.waveCount).toBe(8);
    expect(meadows.unlocks).toEqual(['sprig-sentinel']);
    const river = nodes[2];
    expect(river.spellUnlock).toBe('root-snare');
  });

  it('resolves an act title for each node', () => {
    const nodes = resolveTrail(manifest(), meta(), emptyProgress());
    expect(nodes.map((n) => n.actTitle)).toEqual(['First', 'First', 'Second']);
  });

  it('describes node state accessibly for screen readers', () => {
    const nodes = resolveTrail(manifest(), meta(), markCleared(emptyProgress(), '01-meadows', 3));
    expect(nodes[0].stateDescription).toContain('Cleared');
    expect(nodes[0].stateDescription).toContain('3');
    expect(nodes[1].stateDescription).toContain('Available');
    expect(nodes[2].stateDescription).toContain('Locked');
    expect(nodes[2].stateDescription).toContain('Old Stump Crossroads');
  });

  it('ignores progress for unknown level ids without throwing', () => {
    const progress = markCleared(emptyProgress(), 'not-a-real-level', 3);
    const nodes = resolveTrail(manifest(), meta(), progress);
    expect(nodes.map((n) => n.status)).toEqual(['current', 'locked', 'locked']);
  });
});
