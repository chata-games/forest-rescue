import { describe, it, expect } from 'vitest';
import { GLOW, hasDarkness, glowSources, inGlow, fireflyBuff } from './light';
import type { CompiledLevel } from './types';

/** A tiny darkness level with one ring and a glow-mushroom landmark. */
function darkLevel(): CompiledLevel {
  return {
    id: 'dark',
    name: 'Dark',
    compilerVersion: '1.0.0',
    intentHash: 'x',
    seed: 's',
    biome: 'mushroom-hollow',
    unlocks: [],
    spellUnlock: null,
    bossId: null,
    startingMana: 150,
    maxHearts: 5,
    levelModifiers: ['darkness'],
    paths: [],
    rings: [{ id: 'r1', x: 100, y: 100, role: 'frontline', placement: 'beside-path', radius: 48, buildRadius: 42 }],
    landmarks: [{ type: 'glow-mushroom-cluster', x: 400, y: 100 }],
    waves: [],
  };
}

describe('light / darkness boundary', () => {
  it('detects the darkness modifier', () => {
    expect(hasDarkness(darkLevel())).toBe(true);
    const lit = { ...darkLevel(), levelModifiers: [] };
    expect(hasDarkness(lit)).toBe(false);
    expect(hasDarkness({ levelModifiers: [] })).toBe(false);
  });

  it('builds glow sources from rings, glow-mushroom landmarks, and beacons', () => {
    const sources = glowSources(darkLevel(), [{ x: 700, y: 100, glowRadius: 210 }]);
    expect(sources).toContainEqual({ x: 100, y: 100, r: GLOW.ring, kind: 'ring' });
    expect(sources).toContainEqual({ x: 400, y: 100, r: GLOW.mushroom, kind: 'mushroom' });
    expect(sources).toContainEqual({ x: 700, y: 100, r: 210, kind: 'beacon' });
  });

  it('ignores non-glow landmarks', () => {
    const level = { rings: [], landmarks: [{ type: 'stump', x: 10, y: 10 }] };
    expect(glowSources(level as never)).toEqual([]);
  });

  it('only treats glow-mushroom-cluster as a mushroom glow', () => {
    const level = {
      rings: [],
      landmarks: [{ type: 'glow-mushroom-cluster', x: 5, y: 5 }, { type: 'rock', x: 6, y: 6 }],
    };
    const sources = glowSources(level as never);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'mushroom', r: GLOW.mushroom });
  });

  it('inGlow is true inside a source radius and false outside every source', () => {
    const sources = glowSources(darkLevel());
    expect(inGlow(100, 100, sources)).toBe(true); // on the ring
    expect(inGlow(100 + GLOW.ring - 1, 100, sources)).toBe(true); // just inside
    expect(inGlow(950, 950, sources)).toBe(false); // far from every source
  });

  it('grants the firefly buff only to Defenders within beacon range', () => {
    const beacons = [{ x: 200, y: 200 }];
    expect(fireflyBuff({ x: 200, y: 200 }, beacons)).toEqual({ rangeMul: 1.2, damageMul: 1.2 });
    expect(fireflyBuff({ x: 200 + GLOW.beaconBuff - 10, y: 200 }, beacons)).toEqual({
      rangeMul: 1.2,
      damageMul: 1.2,
    });
    expect(fireflyBuff({ x: 900, y: 900 }, beacons)).toEqual({ rangeMul: 1, damageMul: 1 });
    expect(fireflyBuff({ x: 0, y: 0 }, [])).toEqual({ rangeMul: 1, damageMul: 1 });
  });
});
