import { describe, it, expect } from 'vitest';
import { BattleState } from './battle';
import type { CompiledLevel, Ring } from './types';
import hollowRaw from '../../levels/compiled/04-mushroom-hollow.json';

const mushroomHollow = hollowRaw as CompiledLevel;

/**
 * A straight-line darkness level: one path along y = 256, with rings placed 130
 * units above it. 130 is past a ring's 95-unit glow but inside a Sprig Sentinel's
 * 160 range, so a Defender on such a ring can reach the path but — in the dark —
 * cannot strike an enemy standing on it (the enemy is unlit). A Firefly Beacon's
 * 210 glow, however, reaches the path and lights it.
 */
function darkLevel(opts: { darkness: boolean; rings: Ring[] }): CompiledLevel {
  return {
    id: 'dark-test',
    name: 'Dark Test',
    compilerVersion: '1.0.0',
    intentHash: 'x',
    seed: 's',
    biome: 'mushroom-hollow',
    unlocks: [],
    spellUnlock: null,
    bossId: null,
    startingMana: 300,
    maxHearts: 5,
    levelModifiers: opts.darkness ? ['darkness'] : [],
    paths: [
      {
        id: 'main',
        width: 92,
        length: 600,
        controlPoints: [{ x: 600, y: 256 }, { x: 0, y: 256 }],
        arcLengths: Array.from({ length: 61 }, (_, i) => i * 10),
        samples: Array.from({ length: 61 }, (_, i) => ({ x: 600 - i * 10, y: 256 })),
      },
    ],
    rings: opts.rings,
    waves: [{ enemies: [{ type: 'logger', count: 1 }], delayBefore: 0.5, delayAfter: 1, spawnInterval: 1 }],
  };
}

/** A ring 130 units above the path at the given x (out of ring glow, in Sprig range). */
function ringAbove(id: string, x: number): Ring {
  return { id, x, y: 126, role: 'frontline', placement: 'beside-path', radius: 48, buildRadius: 42 };
}

describe('darkness + light in battle', () => {
  it('exposes whether the level is dark and its live glow sources', () => {
    const battle = new BattleState({
      level: darkLevel({ darkness: true, rings: [ringAbove('r1', 300)] }),
    });
    expect(battle.darkness).toBe(true);
    // Ring r1 sheds glow; no beacon yet.
    const glow = battle.currentGlow();
    expect(glow.some((s) => s.kind === 'ring' && s.x === 300)).toBe(true);
    expect(glow.some((s) => s.kind === 'beacon')).toBe(false);
  });

  it('a non-dark level is not dark', () => {
    const battle = new BattleState({
      level: darkLevel({ darkness: false, rings: [ringAbove('r1', 300)] }),
    });
    expect(battle.darkness).toBe(false);
  });

  it('in the dark a Defender cannot strike an enemy outside every glow (it leaks)', () => {
    const battle = new BattleState({
      level: darkLevel({ darkness: true, rings: [ringAbove('r1', 300)] }),
    });
    expect(battle.placeDefender('r1', 'sprig-sentinel').ok).toBe(true);
    battle.start();
    battle.runToCompletion();
    // The Logger walks the unlit path straight past the Sprig and leaks through.
    expect(battle.leaked).toBeGreaterThan(0);
  });

  it('in the light the same Defender clears the wave (darkness is what blocks it)', () => {
    const battle = new BattleState({
      level: darkLevel({ darkness: false, rings: [ringAbove('r1', 300)] }),
    });
    expect(battle.placeDefender('r1', 'sprig-sentinel').ok).toBe(true);
    battle.start();
    battle.runToCompletion();
    expect(battle.phase).toBe('won');
    expect(battle.leaked).toBe(0);
  });

  it('a Firefly Beacon lights the path so the Defender can strike again', () => {
    // r1 (Sprig) and r2 (Beacon) both 130 above the path and close together, so
    // the Beacon's 210 glow lights the full reach of the Sprig (and emboldens
    // it): the Logger is strikeable as it passes and the wave is cleared where a
    // lone Sprig could not land a shot.
    const battle = new BattleState({
      level: darkLevel({ darkness: true, rings: [ringAbove('r1', 300), ringAbove('r2', 340)] }),
    });
    expect(battle.placeDefender('r2', 'firefly-beacon').ok).toBe(true);
    expect(battle.placeDefender('r1', 'sprig-sentinel').ok).toBe(true);
    battle.start();
    battle.runToCompletion();
    expect(battle.darkness).toBe(true);
    // Lit by the Beacon, the Sprig clears the wave where it could not alone.
    expect(battle.leaked).toBe(0);
    expect(battle.phase).toBe('won');
    // The planted Beacon now appears as a glow source.
    expect(battle.currentGlow().some((s) => s.kind === 'beacon')).toBe(true);
  });
});

describe('poacher behavior', () => {
  /** A short straight path a Poacher walks. */
  function poacherLevel(rings: Ring[]): CompiledLevel {
    return {
      id: 'poacher-test',
      name: 'Poacher Test',
      compilerVersion: '1.0.0',
      intentHash: 'x',
      seed: 's',
      biome: 'mushroom-hollow',
      unlocks: [],
      spellUnlock: null,
      bossId: null,
      startingMana: 100,
      maxHearts: 5,
      levelModifiers: [],
      paths: [
        {
          id: 'main',
          width: 92,
          length: 600,
          controlPoints: [{ x: 600, y: 256 }, { x: 0, y: 256 }],
          arcLengths: Array.from({ length: 61 }, (_, i) => i * 10),
          samples: Array.from({ length: 61 }, (_, i) => ({ x: 600 - i * 10, y: 256 })),
        },
      ],
      rings,
      waves: [{ enemies: [{ type: 'poacher', count: 1 }], delayBefore: 0.5, delayAfter: 1, spawnInterval: 1 }],
    };
  }

  it('steals mana from a Mana flower it passes', () => {
    // One off-path ring well away from the path so a flower can sit on it.
    const battle = new BattleState({
      level: poacherLevel([{ id: 'off', x: 300, y: 60, role: 'support', placement: 'beside-path', radius: 48, buildRadius: 42 }]),
    });
    // Plant a flower directly on the path the Poacher walks.
    expect(battle.spawnManaFlower(300, 256).ok).toBe(true);
    const manaBefore = battle.mana;
    battle.start();
    battle.runToCompletion();
    // The Poacher snatched the flower and drained mana for it.
    expect(battle.mana).toBeLessThan(manaBefore);
    expect(battle.manaFlowers.find((f) => f.x === 300 && f.y === 256)).toBeUndefined();
  });

  it('ignores on-path blockers and walks straight through', () => {
    // A Thornvine Bramble on the path would stop a Logger; a Poacher slips past.
    const battle = new BattleState({
      level: poacherLevel([{ id: 'on', x: 300, y: 256, role: 'chokepoint', placement: 'on-path', radius: 40, buildRadius: 38 }]),
    });
    expect(battle.placeDefender('on', 'thornvine-bramble').ok).toBe(true);
    const hpBefore = battle.defenders.find((d) => d.ringId === 'on')!.hp;
    battle.start();
    battle.runToCompletion();
    // The Poacher passed without chewing the bramble — its HP is untouched.
    expect(battle.defenders.find((d) => d.ringId === 'on')?.hp ?? hpBefore).toBe(hpBefore);
  });
});

describe('firefly beacon buff', () => {
  it('emboldens a nearby Defender with extra damage', () => {
    // Lit level (no darkness) so targeting is unrestricted; isolate the buff.
    const level: CompiledLevel = {
      id: 'buff-test',
      name: 'Buff Test',
      compilerVersion: '1.0.0',
      intentHash: 'x',
      seed: 's',
      biome: 'meadow-edge',
      unlocks: [],
      spellUnlock: null,
      bossId: null,
      startingMana: 300,
      maxHearts: 5,
      levelModifiers: [],
      paths: [
        {
          id: 'main',
          width: 92,
          length: 600,
          controlPoints: [{ x: 600, y: 256 }, { x: 0, y: 256 }],
          arcLengths: Array.from({ length: 61 }, (_, i) => i * 10),
          samples: Array.from({ length: 61 }, (_, i) => ({ x: 600 - i * 10, y: 256 })),
        },
      ],
      rings: [
        { id: 'a', x: 300, y: 256, role: 'frontline', placement: 'beside-path', radius: 48, buildRadius: 42 },
        { id: 'b', x: 360, y: 256, role: 'support', placement: 'beside-path', radius: 48, buildRadius: 42 },
      ],
      waves: [{ enemies: [{ type: 'logger', count: 1 }], delayBefore: 0.5, delayAfter: 1, spawnInterval: 1 }],
    };
    const without = new BattleState({ level });
    without.placeDefender('a', 'sprig-sentinel');
    without.start();
    without.runToCompletion();

    const withBuff = new BattleState({ level });
    withBuff.placeDefender('b', 'firefly-beacon');
    withBuff.placeDefender('a', 'sprig-sentinel');
    withBuff.start();
    withBuff.runToCompletion();

    // Both win (the Sprig clears the lone Logger either way), but the buffed
    // Sprig fells it sooner — fewer battle-clock ticks elapsed.
    expect(without.phase).toBe('won');
    expect(withBuff.phase).toBe('won');
    expect(withBuff.clock).toBeLessThan(without.clock);
  });
});

describe('Mushroom Hollow (04-mushroom-hollow) end-to-end', () => {
  it('boots, runs, and resolves without throwing on Poacher spawns', () => {
    // Regression guard: the level spawns Poachers, so it must not throw when an
    // unknown enemy type appears in a wave (the original shipping blocker).
    const battle = new BattleState({ level: mushroomHollow });
    expect(battle.darkness).toBe(true);
    battle.start();
    battle.runToCompletion();
    expect(['won', 'lost']).toContain(battle.phase);
  });

  it('is winnable by lighting the gate + mid-path chokepoints and holding them', () => {
    // The intended strategy: Firefly Beacons on the gate and mid-path rings push
    // the dark back so Sprig Sentinels can strike, and the wave clears. With the
    // battlefield lit, the level is completable (issue #36 AC3).
    const beside = mushroomHollow.rings.filter((r) => r.placement === 'beside-path');
    const beaconRings = new Set(['ring-97', 'ring-55']);
    const battle = new BattleState({ level: mushroomHollow, startingMana: 9999 });
    for (const ring of beside) {
      battle.placeDefender(ring.id, beaconRings.has(ring.id) ? 'firefly-beacon' : 'sprig-sentinel');
    }
    battle.start();
    battle.runToCompletion();
    expect(battle.phase).toBe('won');
    expect(battle.leaked).toBe(0);
  });
});
