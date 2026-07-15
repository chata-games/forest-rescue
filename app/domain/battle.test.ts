import { describe, it, expect } from 'vitest';
import { BattleState } from './battle';
import meadowsRaw from '../../levels/compiled/01-meadows-edge.json';
import type { CompiledLevel } from './types';

const meadows = meadowsRaw as CompiledLevel;

/** A minimal level used to exercise the victory code path deterministically. */
function tinyLevel(): CompiledLevel {
  const samples = Array.from({ length: 61 }, (_, i) => ({ x: 600 - i * 10, y: 256 }));
  return {
    id: 'tiny',
    name: 'Tiny',
    compilerVersion: '1.0.0',
    intentHash: 'x',
    seed: 's',
    biome: 'meadow-edge',
    unlocks: [],
    spellUnlock: null,
    bossId: null,
    startingMana: 200,
    maxHearts: 5,
    levelModifiers: [],
    paths: [
      {
        id: 'main',
        width: 92,
        length: 600,
        controlPoints: [{ x: 600, y: 256 }, { x: 0, y: 256 }],
        arcLengths: Array.from({ length: 61 }, (_, i) => i * 10),
        samples,
      },
    ],
    rings: [
      { id: 'r1', x: 300, y: 256, role: 'frontline', placement: 'beside-path', radius: 48, buildRadius: 42 },
    ],
    waves: [{ enemies: [{ type: 'logger', count: 2 }], delayBefore: 0.5, delayAfter: 1, spawnInterval: 1 }],
  };
}

describe('BattleState observable boundary', () => {
  it('exposes the HUD contract fields on the snapshot', () => {
    const battle = new BattleState({ level: meadows });
    const snap = battle.snapshot();
    expect(snap).toMatchObject({
      phase: 'planning',
      mana: meadows.startingMana,
      hearts: meadows.maxHearts,
      maxHearts: meadows.maxHearts,
      totalWaves: meadows.waves.length,
      outcome: null,
      paused: false,
    });
    expect(snap.selectedDefenderType).toBe('sprig-sentinel');
    expect(snap.totalWaves).toBe(8);
  });

  it('reaches a deterministic defeat on Meadow\'s Edge with no defenders', () => {
    const battle = new BattleState({ level: meadows });
    battle.start();
    battle.runToCompletion();
    expect(battle.phase).toBe('lost');
    expect(battle.outcome).toBe('defeat');
    expect(battle.hearts).toBe(0);
    // Every Heart is lost to leakage — the forest is overrun.
    expect(battle.leaked).toBe(meadows.maxHearts);
  });

  it('reaches a deterministic victory when defenders clear every wave', () => {
    const battle = new BattleState({ level: tinyLevel() });
    expect(battle.placeDefender('r1', 'sprig-sentinel').ok).toBe(true);
    battle.start();
    battle.runToCompletion();
    expect(battle.phase).toBe('won');
    expect(battle.outcome).toBe('victory');
    expect(battle.leaked).toBe(0);
  });

  it('is deterministic: identical play yields identical observable state', () => {
    function play() {
      const battle = new BattleState({ level: meadows });
      const beside = battle.rings.filter((r) => r.placement === 'beside-path').slice(0, 3);
      for (const ring of beside) battle.placeDefender(ring.id, 'sprig-sentinel');
      battle.start();
      for (let i = 0; i < 30 * 60; i++) {
        if (battle.phase === 'won' || battle.phase === 'lost') break;
        battle.tick();
      }
      return battle.snapshot();
    }
    expect(play()).toEqual(play());
  });

  it('pauses and resumes the simulation without advancing state', () => {
    const battle = new BattleState({ level: meadows });
    battle.start();
    battle.setPaused(true);
    const before = battle.snapshot();
    for (let i = 0; i < 60; i++) battle.tick();
    expect(battle.snapshot()).toEqual(before);
    battle.setPaused(false);
    battle.tick();
    expect(battle.snapshot().phase).toBe('running');
  });

  it('gates defender placement on Mana cost', () => {
    const battle = new BattleState({ level: meadows, startingMana: 40 });
    const result = battle.placeDefender('ring-7', 'sprig-sentinel');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-mana');
    expect(battle.mana).toBe(40);
  });

  it('enforces placement compatibility between defender and ring', () => {
    const battle = new BattleState({ level: meadows });
    // Sprig Sentinel is beside-path only; the chokepoint ring sits on the path.
    const result = battle.placeDefender('ring-onpath-6', 'sprig-sentinel');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('placement-mismatch');
  });

  it('prevents double-planting an occupied ring', () => {
    const battle = new BattleState({ level: meadows });
    expect(battle.placeDefender('ring-7', 'sprig-sentinel').ok).toBe(true);
    const result = battle.placeDefender('ring-7', 'sprig-sentinel');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('ring-occupied');
  });

  it('refunds 70% of invested Mana (rounded) when a Defender is removed', () => {
    const battle = new BattleState({ level: meadows }); // 150 starting Mana
    battle.placeDefender('ring-onpath-6', 'thornvine-bramble'); // costs 35
    expect(battle.mana).toBe(115);
    const result = battle.removeDefender('ring-onpath-6');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.refund).toBe(25); // round(35 * 0.7) = 25
    expect(battle.mana).toBe(140);
  });

  it('advances the wave counter as scripted enemies spawn', () => {
    const battle = new BattleState({ level: meadows });
    battle.start();
    // First enemy spawns at delayBefore (1.5s); step past it.
    for (let i = 0; i < 3 * 60; i++) battle.tick();
    const snap = battle.snapshot();
    expect(snap.waveNumber).toBeGreaterThanOrEqual(1);
    expect(snap.enemyCount).toBeGreaterThan(0);
    expect(snap.waveActive).toBe(true);
  });
});
