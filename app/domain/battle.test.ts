import { describe, it, expect } from 'vitest';
import { BattleState, buildWavePreview, planManaFlowers, MANA_FLOWER_HIT } from './battle';
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

// Tap-tap placement safety: the Guardian can plant a Selected Defender with
// repeated taps while affordability, invalid targets, movement, cancellation,
// and simultaneous thumbs can never cause an unintended purchase (issue #22).
describe('tap-tap placement safety (issue #22)', () => {
  it('canPlaceDefender previews validity without spending or placing (AC1/AC3)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 40 });
    // Unaffordable preview names the problem and changes nothing.
    expect(battle.canPlaceDefender('ring-7', 'sprig-sentinel')).toEqual({ ok: false, reason: 'insufficient-mana' });
    expect(battle.mana).toBe(40);
    expect(battle.defenders).toHaveLength(0);

    // A valid preview likewise spends nothing and plants nothing.
    const ready = new BattleState({ level: meadows });
    expect(ready.canPlaceDefender('ring-7', 'sprig-sentinel')).toEqual({ ok: true });
    expect(ready.mana).toBe(meadows.startingMana);
    expect(ready.defenders).toHaveLength(0);
  });

  it('commits the snapshotted tool, ignoring a later selection change (AC5)', () => {
    const battle = new BattleState({ level: meadows });
    battle.selectDefender('thornvine-bramble'); // current selection is now the bramble
    // A pointer that snapshotted sprig-sentinel at touch-down commits that tool.
    const result = battle.placeDefender('ring-7', 'sprig-sentinel');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.defender.typeId).toBe('sprig-sentinel');
    // Selection is preserved — placement never clobbers the active tool.
    expect(battle.selectedDefenderType).toBe('thornvine-bramble');
  });

  it('a failed placement spends nothing and preserves selection (AC3)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 10 });
    battle.selectDefender('thornvine-bramble');
    const before = battle.mana;
    const result = battle.placeDefender('ring-7', 'sprig-sentinel'); // unaffordable
    expect(result.ok).toBe(false);
    expect(battle.mana).toBe(before);
    expect(battle.selectedDefenderType).toBe('thornvine-bramble');
  });

  it('undoes the most recent placement with a FULL refund within 4 seconds (AC6)', () => {
    const battle = new BattleState({ level: meadows }); // 150 mana
    expect(battle.placeDefender('ring-7', 'sprig-sentinel').ok).toBe(true); // -50
    expect(battle.mana).toBe(100);
    expect(battle.snapshot().canUndo).toBe(true);

    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.refund).toBe(50); // full refund, not the 70% uproot rate
    expect(battle.mana).toBe(150);
    expect(battle.defenders).toHaveLength(0);
    expect(battle.snapshot().canUndo).toBe(false);
  });

  it('undo targets only the most recent placement', () => {
    const battle = new BattleState({ level: meadows }); // 150
    battle.placeDefender('ring-7', 'sprig-sentinel'); // -50 -> 100
    battle.placeDefender('ring-onpath-6', 'thornvine-bramble'); // -35 -> 65

    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.refund).toBe(35);
    // The bramble (last placed) is gone; the sentinel stays.
    expect(battle.defenders.map((d) => d.typeId)).toEqual(['sprig-sentinel']);
    expect(battle.mana).toBe(100);
  });

  it('undo expires once the four-second window elapses (AC6)', () => {
    const battle = new BattleState({ level: meadows });
    battle.placeDefender('ring-7', 'sprig-sentinel');
    battle.start();
    for (let i = 0; i < 4 * 60; i++) battle.tick(); // exactly 4s -> still within window
    expect(battle.snapshot().canUndo).toBe(true);
    battle.tick(); // one step past 4s -> expired
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(false);
    if (!undo.ok) expect(undo.reason).toBe('undo-expired');
    expect(battle.defenders).toHaveLength(1); // expired undo does not remove it
  });

  it('pause freezes the undo window so cancellation spends nothing (AC4)', () => {
    const battle = new BattleState({ level: meadows });
    battle.placeDefender('ring-7', 'sprig-sentinel');
    battle.start();
    battle.setPaused(true);
    for (let i = 0; i < 10 * 60; i++) battle.tick(); // paused: battle clock frozen
    expect(battle.snapshot().canUndo).toBe(true);
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.refund).toBe(50);
  });

  it('a manual uproot becomes the undoable action and restores on undo', () => {
    const battle = new BattleState({ level: meadows });
    battle.placeDefender('ring-7', 'sprig-sentinel'); // -50 -> 100
    battle.removeDefender('ring-7'); // uproot: +round(50*0.7)=35 -> 135, ring freed
    // The removal is now the reversible action (the placement is no longer undoable).
    expect(battle.snapshot().canUndo).toBe(true);
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.kind).toBe('remove');
    // The Defender is replanted and the removal refund is clawed back.
    expect(battle.defenders.map((d) => d.typeId)).toEqual(['sprig-sentinel']);
    expect(battle.mana).toBe(100);
  });

  it('reports nothing-to-undo when no placement was made', () => {
    const battle = new BattleState({ level: meadows });
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(false);
    if (!undo.ok) expect(undo.reason).toBe('nothing-to-undo');
  });
});

// Combined star result: the BattleState tracks Mana spent and resources collected
// and exposes a 1–3 star result (0 on defeat) through the snapshot, so the
// campaign/application seam can score, unlock, and replay Meadow's Edge.
describe('combined star result (issue #29)', () => {
  it('tracks net Mana spent across placement, full undo, and 70% uproot', () => {
    const battle = new BattleState({ level: meadows }); // 150 mana
    battle.placeDefender('ring-7', 'sprig-sentinel'); // +50
    expect(battle.manaSpent).toBe(50);
    battle.undoLastAction(); // full refund reverses the spend
    expect(battle.manaSpent).toBe(0);

    battle.placeDefender('ring-7', 'sprig-sentinel'); // +50
    battle.removeDefender('ring-7'); // 70% uproot keeps the 30% loss as spent
    expect(battle.manaSpent).toBe(15); // round(50 * 0.3)
  });

  it('tracks Mana bounty gathered as resources are collected', () => {
    const battle = new BattleState({ level: tinyLevel() }); // 2 loggers worth 8 each
    battle.placeDefender('r1', 'sprig-sentinel');
    battle.start();
    battle.runToCompletion();
    expect(battle.phase).toBe('won');
    expect(battle.resourcesCollected).toBe(16); // both loggers felled for bounty
  });

  it('exposes a 1–3 star result on the victory snapshot', () => {
    const battle = new BattleState({ level: tinyLevel() });
    battle.placeDefender('r1', 'sprig-sentinel');
    battle.start();
    battle.runToCompletion();
    const stars = battle.snapshot().stars;
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(stars).toBeLessThanOrEqual(3);
  });

  it('scores zero stars on a defeat and does not collect leaked bounty', () => {
    const battle = new BattleState({ level: meadows });
    battle.start();
    battle.runToCompletion();
    expect(battle.phase).toBe('lost');
    expect(battle.snapshot().stars).toBe(0);
    // Everything leaked past the Heartwood; no bounty was gathered.
    expect(battle.resourcesCollected).toBe(0);
});
});

// Modeless Defender management: inspect any planted Defender without losing the
// selected tool, then upgrade or remove it through explicit, reversible actions
// that share the four-second undo window (issue #30, blocked by #22).
describe('inspect / upgrade / remove modelessly (issue #30)', () => {
  it('inspect returns null for an empty ring and keeps selection untouched (AC1)', () => {
    const battle = new BattleState({ level: meadows });
    battle.selectDefender('thornvine-bramble');
    expect(battle.inspect('ring-7')).toBeNull();
    // Inspecting — or having nothing to inspect — never clobbers the active tool.
    expect(battle.selectedDefenderType).toBe('thornvine-bramble');
  });

  it('inspect surfaces decisive stats, invested Mana, the refund, and the upgrade preview (AC2/AC3/AC4)', () => {
    const battle = new BattleState({ level: meadows });
    battle.placeDefender('ring-7', 'sprig-sentinel'); // costs 50
    const info = battle.inspect('ring-7')!;
    expect(info.typeId).toBe('sprig-sentinel');
    expect(info.tier).toBe(0);
    expect(info.maxTier).toBe(2);
    expect(info.damage).toBe(35);
    expect(info.range).toBe(160);
    expect(info.invested).toBe(50);
    expect(info.removalRefund).toBe(35); // round(50 * 0.7)
    expect(info.upgrade).not.toBeNull();
    const up = info.upgrade!;
    expect(up.nextTier).toBe(1);
    expect(up.cost).toBe(45);
    expect(up.available).toBe(true);
    expect(up.statChanges.damage).toEqual({ from: 35, to: 55 });
    expect(up.statChanges.range).toEqual({ from: 160, to: 175 });
    // Untouched stats are omitted from the delta.
    expect(up.statChanges.hp).toBeUndefined();
  });

  it('upgrade commits the exact cost, raises the tier, applies the stat change, and full-heals (AC3)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel'); // invested 50
    const result = battle.upgradeDefender('ring-7');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cost).toBe(45);
      expect(result.tier).toBe(1);
    }
    const d = battle.defenders[0]!;
    expect(d.tier).toBe(1);
    expect(d.damage).toBe(55);
    expect(d.range).toBe(175);
    expect(d.invested).toBe(95); // 50 placement + 45 upgrade
    expect(d.hp).toBe(d.maxHp); // upgrading re-blooms to full health
  });

  it('upgrade explains an unavailable upgrade: max tier reached (AC3)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel');
    battle.upgradeDefender('ring-7'); // -> tier 1
    battle.upgradeDefender('ring-7'); // -> tier 2 (max)
    const maxed = battle.upgradeDefender('ring-7');
    expect(maxed.ok).toBe(false);
    if (!maxed.ok) expect(maxed.reason).toBe('max-tier');
    // At the top of the ladder there is no upgrade preview to offer.
    expect(battle.inspect('ring-7')!.upgrade).toBeNull();
  });

  it('upgrade explains an unavailable upgrade: not enough Mana, spending nothing (AC3)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 50 });
    battle.placeDefender('ring-7', 'sprig-sentinel'); // -> 0 mana
    const before = battle.defenders[0]!;
    const result = battle.upgradeDefender('ring-7');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-mana');
    expect(battle.mana).toBe(0);
    expect(battle.defenders[0]).toEqual(before); // nothing changed
  });

  it('remove refunds 70% of total invested Mana, not just the base cost (AC4)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel'); // invested 50
    battle.upgradeDefender('ring-7'); // invested 95
    const result = battle.removeDefender('ring-7');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.refund).toBe(67); // round(95 * 0.7)
    expect(battle.defenders).toHaveLength(0); // the ring is freed
  });

  it('undo rolls back an upgrade within the window, refunding the cost (AC5)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel'); // 9999 -> 9949, tier 0
    battle.upgradeDefender('ring-7'); // -> 9904, tier 1, damage 55
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.kind).toBe('upgrade');
    const d = battle.defenders[0]!;
    expect(d.tier).toBe(0); // back to the prior tier snapshot
    expect(d.damage).toBe(35);
    expect(d.range).toBe(160);
    expect(battle.mana).toBe(9949); // upgrade cost refunded
  });

  it('undo replays a removal, restoring the Defender and clawing back the refund (AC5)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel');
    battle.upgradeDefender('ring-7'); // invested 95, tier 1
    const beforeRemove = battle.mana;
    const rm = battle.removeDefender('ring-7');
    expect(rm.ok).toBe(true);
    if (!rm.ok) return;
    expect(battle.mana).toBe(beforeRemove + rm.refund);
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.kind).toBe('remove');
    // Restored at the tier it was removed at, and the refund is paid back.
    expect(battle.defenders.map((d) => d.tier)).toEqual([1]);
    expect(battle.mana).toBe(beforeRemove);
  });

  it('undo of an upgrade expires once the four-second window elapses (AC5/AC6)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel');
    battle.upgradeDefender('ring-7'); // -> tier 1
    battle.start();
    for (let i = 0; i < 4 * 60; i++) battle.tick();
    battle.tick(); // past the window
    const undo = battle.undoLastAction();
    expect(undo.ok).toBe(false);
    if (!undo.ok) expect(undo.reason).toBe('undo-expired');
    expect(battle.defenders[0]!.tier).toBe(1); // not rolled back
  });
});

// A level whose single enemy takes ~28s to cross, so the battle stays running
// long enough to observe a full spell cooldown elapse on the battle clock.
function slowLevel(): CompiledLevel {
  const samples = Array.from({ length: 121 }, (_, i) => ({ x: 1200 - i * 10, y: 256 }));
  return {
    id: 'slow',
    name: 'Slow',
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
        length: 1200,
        controlPoints: [{ x: 1200, y: 256 }, { x: 0, y: 256 }],
        arcLengths: Array.from({ length: 121 }, (_, i) => i * 10),
        samples,
      },
    ],
    rings: [
      { id: 'r1', x: 600, y: 256, role: 'frontline', placement: 'beside-path', radius: 48, buildRadius: 42 },
    ],
    waves: [{ enemies: [{ type: 'logger', count: 1 }], delayBefore: 0.5, delayAfter: 0, spawnInterval: 1 }],
  };
}

// Guardian spell casting: select-then-target with a safe commit. Invalid aims,
// cancellation, and unaffordable/on-cooldown states spend no Mana and start no
// cooldown, and the previously Selected Defender is always restored (issue #31).
describe('Guardian spell casting (issue #31)', () => {
  it('arms a spell; a cast spends Mana, starts a cooldown, and roots enemies in radius', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 200, availableSpells: ['root-snare'] });
    expect(battle.armedSpell).toBeNull();
    expect(battle.armSpell('root-snare')).toEqual({ ok: true });
    expect(battle.armedSpell).toBe('root-snare');

    battle.start();
    for (let i = 0; i < 60; i++) battle.tick(); // ~1s in
    const enemy = battle.enemies[0]!;
    const cast = battle.castSpell(enemy.x, enemy.y);
    expect(cast.ok).toBe(true);
    expect(battle.mana).toBe(200 - 45);
    expect(battle.snapshot().spells[0]!.cooldownRemaining).toBe(25);
    // The enemy was within the spell radius of the cast point, so it is rooted.
    expect(enemy.rootTime).toBeGreaterThan(0);
  });

  it('an unaffordable cast spends no Mana and starts no cooldown (AC2)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 10, availableSpells: ['root-snare'] });
    expect(battle.castSpell(300, 256, 'root-snare')).toEqual({ ok: false, reason: 'insufficient-mana' });
    expect(battle.mana).toBe(10);
    expect(battle.snapshot().spells[0]!.cooldownRemaining).toBe(0);
  });

  it('cannot arm an unavailable spell; canCastSpell previews why (AC4)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 10, availableSpells: ['root-snare'] });
    expect(battle.armSpell('root-snare')).toEqual({ ok: false, reason: 'insufficient-mana' });
    expect(battle.armedSpell).toBeNull();
    expect(battle.canCastSpell(300, 256, 'root-snare')).toEqual({ ok: false, reason: 'insufficient-mana' });
  });

  it('restores the previously Selected Defender after a successful cast (AC3)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 200, availableSpells: ['root-snare'] });
    battle.selectDefender('thornvine-bramble');
    battle.armSpell('root-snare');
    expect(battle.castSpell(300, 256).ok).toBe(true);
    expect(battle.armedSpell).toBeNull();
    expect(battle.selectedDefenderType).toBe('thornvine-bramble');
  });

  it('restores the previously Selected Defender after an explicit cancel (AC3)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 200, availableSpells: ['root-snare'] });
    battle.selectDefender('thornvine-bramble');
    battle.armSpell('root-snare');
    battle.cancelSpell();
    expect(battle.armedSpell).toBeNull();
    expect(battle.selectedDefenderType).toBe('thornvine-bramble');
  });

  it('arming the already-armed spell toggles it off and restores the prior Defender', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 200, availableSpells: ['root-snare'] });
    battle.selectDefender('thornvine-bramble');
    battle.armSpell('root-snare');
    expect(battle.armSpell('root-snare')).toEqual({ ok: true });
    expect(battle.armedSpell).toBeNull();
    expect(battle.selectedDefenderType).toBe('thornvine-bramble');
  });

  it('selecting a Defender exits spell targeting without losing selection', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 200, availableSpells: ['root-snare'] });
    battle.selectDefender('thornvine-bramble');
    battle.armSpell('root-snare');
    battle.selectDefender('sprig-sentinel');
    expect(battle.armedSpell).toBeNull();
    expect(battle.selectedDefenderType).toBe('sprig-sentinel');
  });

  it('a second cast before the cooldown elapses is refused and spends nothing (AC2)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 9999, availableSpells: ['root-snare'] });
    expect(battle.castSpell(300, 256, 'root-snare').ok).toBe(true);
    const second = battle.castSpell(300, 256, 'root-snare');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('spell-cooldown');
    expect(battle.mana).toBe(9999 - 45); // only the first cast was paid for
  });

  it('starts the cooldown, and it ticks down on the battle clock', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 9999, availableSpells: ['root-snare'] });
    battle.castSpell(300, 256, 'root-snare');
    expect(battle.snapshot().spells[0]).toMatchObject({ ready: false });
    expect(battle.snapshot().spells[0]!.cooldownRemaining).toBeCloseTo(25, 5);
    battle.start();
    for (let i = 0; i < 5 * 60; i++) battle.tick(); // 5s later (battle still running)
    expect(battle.snapshot().spells[0]!.ready).toBe(false);
    expect(battle.snapshot().spells[0]!.cooldownRemaining).toBeCloseTo(20, 5);
  });

  it('the cooldown fully elapses so the spell becomes ready again', () => {
    const battle = new BattleState({ level: slowLevel(), startingMana: 9999, availableSpells: ['root-snare'] });
    battle.castSpell(300, 256, 'root-snare');
    battle.start();
    // 26s: the 25s cooldown has elapsed (and clamped to 0); the lone enemy is
    // still mid-trail (it needs ~28s to cross), so the battle is still running.
    for (let i = 0; i < 26 * 60; i++) battle.tick();
    expect(battle.snapshot().spells[0]).toMatchObject({ ready: true, cooldownRemaining: 0 });
  });

  it('a rooted enemy stops advancing until the root expires', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 9999, availableSpells: ['root-snare'] });
    battle.start();
    for (let i = 0; i < 60; i++) battle.tick();
    const enemy = battle.enemies[0]!;
    const sBefore = enemy.s;
    battle.castSpell(enemy.x, enemy.y, 'root-snare');
    const rootTime = enemy.rootTime;
    for (let i = 0; i < 30; i++) battle.tick(); // 0.5s while rooted
    expect(battle.enemies[0]!.s).toBe(sBefore); // frozen in place
    expect(battle.enemies[0]!.rootTime).toBeCloseTo(rootTime - 0.5, 5);
  });

  it('cleansing-rain heals defenders within its radius (capped at maxHp)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 9999, availableSpells: ['cleansing-rain'] });
    expect(battle.placeDefender('r1', 'sprig-sentinel').ok).toBe(true); // r1 at (300,256)
    const defender = battle.defenders[0]!;
    defender.hp = 10; // wound it
    battle.castSpell(300, 256, 'cleansing-rain');
    expect(battle.defenders[0]!.hp).toBe(70); // +60 heal
  });

  it('only unlocked spells appear in the snapshot availability list', () => {
    const battle = new BattleState({ level: tinyLevel(), availableSpells: ['root-snare'] });
    const ids = battle.snapshot().spells.map((s) => s.id);
    expect(ids).toEqual(['root-snare']);
    expect(battle.snapshot().spells[0]).toMatchObject({ affordable: true, ready: true, available: true, reason: null });
  });
});

// Mana flowers: collectible pickups with safe, non-overlapping placement and a
// generous hit region. The Guardian taps to collect without stealing a Defender
// tap (issue #31).
describe('Mana flowers (issue #31)', () => {
  it('planManaFlowers drops candidates overlapping a ring or another flower', () => {
    const rings = [{ x: 300, y: 256, buildRadius: 42 }];
    const tooCloseToRing = { x: 320, y: 256 }; // within buildRadius + hit/2
    const existing = [{ x: 600, y: 256 }];
    const tooCloseToFlower = { x: 610, y: 256 }; // within hit of the existing flower
    const clean = { x: 900, y: 256 };
    const result = planManaFlowers({
      rings,
      existing,
      candidates: [tooCloseToRing, tooCloseToFlower, clean],
    });
    expect(result).toEqual([clean]);
  });

  it('collectManaFlower grants Mana and removes the flower', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 0 });
    expect(battle.spawnManaFlower(900, 256, 25).ok).toBe(true);
    expect(battle.manaFlowers).toHaveLength(1);
    const r = battle.collectManaFlower(battle.manaFlowers[0]!.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mana).toBe(25);
    expect(battle.mana).toBe(25);
    expect(battle.manaFlowers).toHaveLength(0);
  });

  it('collecting an already-collected flower reports already-collected', () => {
    const battle = new BattleState({ level: tinyLevel() });
    battle.spawnManaFlower(900, 256, 25);
    const id = battle.manaFlowers[0]!.id;
    battle.collectManaFlower(id);
    const second = battle.collectManaFlower(id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('already-collected');
  });

  it('spawnManaFlower refuses to place a flower overlapping a ring', () => {
    const battle = new BattleState({ level: tinyLevel() }); // r1 at (300,256), buildRadius 42
    const r = battle.spawnManaFlower(310, 256, 20);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('overlaps-ring');
  });

  it('spawns a Mana flower at a safe spot on each interval of battle time', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 0, manaFlowerIntervalSec: 5 });
    battle.start();
    for (let i = 0; i < 6 * 60; i++) battle.tick(); // past the 5s interval mark
    expect(battle.manaFlowers.length).toBeGreaterThanOrEqual(1);
    // The spawned flower must clear the only ring's build area + half a hit region.
    const f = battle.manaFlowers[0]!;
    expect(Math.hypot(f.x - 300, f.y - 256)).toBeGreaterThan(42 + MANA_FLOWER_HIT / 2);
  });
});

// A level with multiple waves (one a scripted boss wave) and two routes, so the
// wave preview can show current/upcoming composition, traits, boss warnings,
// routes, and a countdown to the next wave (issue #32 AC1).
function previewLevel(): CompiledLevel {
  const samples = Array.from({ length: 61 }, (_, i) => ({ x: 600 - i * 10, y: 256 }));
  return {
    id: 'preview',
    name: 'Preview',
    compilerVersion: '1.0.0',
    intentHash: 'x',
    seed: 's',
    biome: 'meadow-edge',
    unlocks: [],
    spellUnlock: null,
    bossId: 'the-grinder',
    startingMana: 9999,
    maxHearts: 5,
    levelModifiers: [],
    paths: [
      { id: 'main', width: 92, length: 600, controlPoints: [{ x: 600, y: 256 }, { x: 0, y: 256 }], arcLengths: Array.from({ length: 61 }, (_, i) => i * 10), samples },
      { id: 'secondary', width: 80, length: 600, controlPoints: [{ x: 600, y: 700 }, { x: 0, y: 700 }], arcLengths: Array.from({ length: 61 }, (_, i) => i * 10), samples: samples.map((s) => ({ x: s.x, y: 700 })) },
    ],
    rings: [],
    waves: [
      { enemies: [{ type: 'logger', count: 3 }], delayBefore: 2, delayAfter: 4, spawnInterval: 1 },
      { enemies: [{ type: 'logger', count: 4 }], delayBefore: 1, delayAfter: 4, spawnInterval: 1 },
      { enemies: [{ type: 'logger', count: 1 }, { type: 'marker-drone', count: 2 }], delayBefore: 1, delayAfter: 0, spawnInterval: 1 },
      { enemies: [{ type: 'the-grinder', count: 1 }], delayBefore: 3, delayAfter: 0, spawnInterval: 1, scripted: true, bossId: 'the-grinder' },
    ],
  };
}

// Wave preview (issue #32 AC1): a pure projector off the level + battle clock
// that surfaces the current and next-upcoming wave — composition, enemy traits,
// routes, boss warnings, and a countdown — so the Guardian can plan while paused.
describe('wave preview (issue #32 AC1)', () => {
  it('before start, previews wave 1 as current and wave 2 as upcoming with countdowns', () => {
    const battle = new BattleState({ level: previewLevel() });
    const preview = battle.wavePreview();
    expect(preview.current).not.toBeNull();
    expect(preview.current!.wave).toBe(1);
    expect(preview.current!.total).toBe(3);
    expect(preview.current!.countdown).toBe(2); // wave 1 delayBefore
    expect(preview.upcoming).not.toBeNull();
    expect(preview.upcoming!.wave).toBe(2);
    expect(preview.upcoming!.total).toBe(4);
    // Wave 2 starts after wave 1 (delayBefore 2 + last spawn + delayAfter 4 + its delayBefore 1).
    expect(preview.upcoming!.countdown).toBe(2 + 2 + 4 + 1);
  });

  it('surfaces enemy counts, names, and trait tags per group', () => {
    const level = previewLevel();
    const preview = buildWavePreview({ waves: level.waves, paths: level.paths, currentWave: 1, clock: 0 });
    const g = preview.current!.groups[0]!;
    expect(g).toMatchObject({ type: 'logger', count: 3, name: 'Logger' });
    expect(g.traits).toEqual(['crew', 'ground', 'choppable']);
    // A multi-group wave lists each group; uncatalogued types fall back to the id.
    const w3 = buildWavePreview({ waves: level.waves, paths: level.paths, currentWave: 3, clock: 0 });
    expect(w3.current!.groups.map((grp) => `${grp.count}× ${grp.name}`)).toEqual(['1× Logger', '2× marker-drone']);
  });

  it('flags a boss wave and falls back to the type id when the boss is uncatalogued', () => {
    const level = previewLevel();
    // The boss wave is wave 4; project it directly (it never needs to spawn).
    const preview = buildWavePreview({ waves: level.waves, paths: level.paths, currentWave: 4, clock: 999 });
    expect(preview.current!.wave).toBe(4);
    expect(preview.current!.boss).toBe(true);
    expect(preview.upcoming).toBeNull();
    const bossGroup = preview.current!.groups[0]!;
    expect(bossGroup.type).toBe('the-grinder');
    expect(bossGroup.name).toBe('the-grinder'); // not in the catalogue -> id fallback
    expect(bossGroup.traits).toEqual([]);
  });

  it('lists the level routes so the Guardian knows where foes will arrive', () => {
    const battle = new BattleState({ level: previewLevel() });
    expect(battle.wavePreview().current!.routeIds).toEqual(['main', 'secondary']);
  });

  it('clamps the current wave countdown to 0 once it is spawning', () => {
    const battle = new BattleState({ level: previewLevel() });
    battle.start();
    for (let i = 0; i < 3 * 60; i++) battle.tick(); // past wave 1's 2s delayBefore
    const preview = battle.wavePreview();
    expect(preview.current!.wave).toBe(1);
    expect(preview.current!.countdown).toBe(0); // already started
  });

  it('reports no upcoming wave once the last wave is current', () => {
    const level = previewLevel();
    const preview = buildWavePreview({ waves: level.waves, paths: level.paths, currentWave: level.waves.length, clock: 999 });
    expect(preview.current!.wave).toBe(level.waves.length);
    expect(preview.upcoming).toBeNull();
  });

  it('is exposed on the snapshot so the HUD can render it each frame', () => {
    const battle = new BattleState({ level: previewLevel() });
    const snap = battle.snapshot();
    expect(snap.wavePreview.current).not.toBeNull();
    expect(snap.wavePreview.current!.wave).toBe(1);
  });

  it('buildWavePreview is pure: current+upcoming from waves, clock, and currentWave', () => {
    const level = previewLevel();
    const preview = buildWavePreview({
      waves: level.waves,
      paths: level.paths,
      currentWave: 2,
      clock: 5,
    });
    expect(preview.current!.wave).toBe(2);
    // Wave 2 starts at 2 + 2 + 4 + 1 = 9; clock 5 -> 4s remaining.
    expect(preview.current!.countdown).toBe(4);
    expect(preview.upcoming!.wave).toBe(3);
  });
});

// Planning Pause (issue #32 AC2/AC4): an explicit mid-battle pause freezes the
// simulation (already) and locks live-battle actions — spells and Mana-flower
// collection — explaining why, while Defender management stays available.
describe('Planning Pause (issue #32)', () => {
  it('cannot arm or cast a spell while paused, and the toolbar explains why (AC4)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 9999, availableSpells: ['root-snare'] });
    battle.start();
    battle.setPaused(true);
    expect(battle.armSpell('root-snare')).toEqual({ ok: false, reason: 'paused' });
    expect(battle.armedSpell).toBeNull();
    expect(battle.castSpell(300, 256, 'root-snare')).toEqual({ ok: false, reason: 'paused' });
    expect(battle.mana).toBe(9999); // nothing spent
    // The availability list reports every spell unavailable with a paused reason.
    const s = battle.snapshot().spells[0]!;
    expect(s.available).toBe(false);
    expect(s.reason).toBe('paused');
  });

  it('cannot collect a Mana flower while paused (AC4)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 0 });
    battle.spawnManaFlower(900, 256, 25);
    battle.start();
    battle.setPaused(true);
    const id = battle.manaFlowers[0]!.id;
    expect(battle.collectManaFlower(id)).toEqual({ ok: false, reason: 'paused' });
    expect(battle.mana).toBe(0);
    expect(battle.manaFlowers).toHaveLength(1); // flower untouched
  });

  it('keeps Defender placement, inspection, upgrade, and removal available while paused (AC3)', () => {
    const battle = new BattleState({ level: meadows, startingMana: 9999 });
    battle.placeDefender('ring-7', 'sprig-sentinel');
    battle.start();
    battle.setPaused(true);
    // A second placement on a different ring still works at normal cost.
    expect(battle.placeDefender('ring-43', 'sprig-sentinel').ok).toBe(true);
    // Inspection, upgrade, and removal are unaffected by the pause.
    expect(battle.inspect('ring-7')).not.toBeNull();
    expect(battle.upgradeDefender('ring-7').ok).toBe(true);
    expect(battle.removeDefender('ring-43').ok).toBe(true);
    expect(battle.snapshot().paused).toBe(true);
  });

  it('spells and flowers become available again once the battle resumes (AC4)', () => {
    const battle = new BattleState({ level: tinyLevel(), startingMana: 9999, availableSpells: ['root-snare'] });
    battle.spawnManaFlower(900, 256, 25);
    battle.start();
    battle.setPaused(true);
    expect(battle.snapshot().spells[0]!.available).toBe(false);
    battle.setPaused(false);
    expect(battle.snapshot().spells[0]!.available).toBe(true);
    expect(battle.collectManaFlower(battle.manaFlowers[0]!.id).ok).toBe(true);
  });

  it('pause is a no-op outside the running phase (planning is already frozen)', () => {
    const battle = new BattleState({ level: meadows });
    battle.setPaused(true); // still in planning -> ignored
    expect(battle.paused).toBe(false);
  });
});
