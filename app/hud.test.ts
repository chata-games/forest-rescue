import { describe, it, expect } from 'vitest';
import {
  heartsGlyph,
  humanReason,
  renderHud,
  starsGlyph,
  waveText,
  buildContextPanel,
  spellStateText,
  buildWavePreviewView,
  type HudElements,
} from './hud';
import type {
  BattleSnapshot,
  DefenderInspection,
  SpellAvailability,
  WavePreview,
  WavePreviewEntry,
} from './domain/battle';

function stubs(): HudElements {
  return {
    mana: { textContent: '' },
    hearts: { textContent: '' },
    wave: { textContent: '' },
    startBtn: { textContent: '', disabled: false },
    outcomeTitle: { textContent: '' },
    outcomeStars: { textContent: '' },
    outcomeMessage: { textContent: '' },
    overlay: { hidden: true },
  };
}

function snap(partial: Partial<BattleSnapshot>): BattleSnapshot {
  return {
    phase: 'planning',
    outcome: null,
    mana: 150,
    hearts: 5,
    maxHearts: 5,
    waveNumber: 0,
    totalWaves: 8,
    waveActive: false,
    selectedDefenderType: 'sprig-sentinel',
    paused: false,
    defenderCount: 0,
    enemyCount: 0,
    leaked: 0,
    canUndo: false,
    stars: 0,
    armedSpell: null,
    spells: [],
    wavePreview: { current: null, upcoming: null },
    ...partial,
  };
}

function spell(partial: Partial<SpellAvailability>): SpellAvailability {
  return {
    id: 'root-snare',
    name: 'Root Snare',
    cost: 45,
    cooldownRemaining: 0,
    cooldownMax: 25,
    affordable: true,
    ready: true,
    available: true,
    reason: null,
    ...partial,
  };
}

describe('HUD rendering', () => {
  it('renders Mana, Hearts and Wave from a snapshot', () => {
    const els = stubs();
    renderHud(snap({ mana: 42, hearts: 3, waveNumber: 4 }), els);
    expect(els.mana.textContent).toBe('42');
    expect(els.hearts.textContent).toBe('♥♥♥♡♡');
    expect(els.wave.textContent).toBe('4 / 8');
    expect(els.overlay.hidden).toBe(true);
  });

  it('clamps the displayed wave to at least 1 during planning', () => {
    expect(waveText(snap({ waveNumber: 0 }))).toBe('1 / 8');
  });

  it('marks the start control as running while waves are active', () => {
    const els = stubs();
    renderHud(snap({ phase: 'running', waveNumber: 2 }), els);
    expect(els.startBtn.textContent).toBe('Wave Running');
    expect(els.startBtn.disabled).toBe(true);
  });

  it('reveals a Victory overlay with the combined star result and hearts that survived', () => {
    const els = stubs();
    renderHud(snap({ phase: 'won', outcome: 'victory', hearts: 4, stars: 3 }), els);
    expect(els.overlay.hidden).toBe(false);
    expect(els.outcomeTitle.textContent).toBe('Victory');
    expect(els.outcomeStars.textContent).toBe('★★★');
    expect(els.outcomeMessage.textContent).toContain('4 heart');
  });

  it('reveals a Defeat overlay with no star result', () => {
    const els = stubs();
    renderHud(snap({ phase: 'lost', outcome: 'defeat', hearts: 0 }), els);
    expect(els.overlay.hidden).toBe(false);
    expect(els.outcomeTitle.textContent).toBe('Defeat');
    expect(els.outcomeStars.textContent).toBe('');
    expect(els.outcomeMessage.textContent).toContain('ChopCo');
  });

  it('translates placement rejections into Guardian-facing hints', () => {
    expect(humanReason('insufficient-mana')).toBe('Not enough mana');
    expect(humanReason('placement-mismatch')).toBe('That defender belongs on a different ring');
    expect(humanReason('unknown-ring')).toBe('No fairy ring there');
    expect(humanReason('nothing-to-undo')).toBe('Nothing to undo');
    expect(humanReason('undo-expired')).toBe('Undo window expired');
    expect(humanReason('some-unknown-reason')).toBe('Cannot place there');
  });

  it('builds the hearts glyph for full and empty health', () => {
    expect(heartsGlyph(5, 5)).toBe('♥♥♥♥♥');
    expect(heartsGlyph(0, 5)).toBe('♡♡♡♡♡');
  });

  it('builds the star glyph for the combined result', () => {
    expect(starsGlyph(3)).toBe('★★★');
    expect(starsGlyph(2)).toBe('★★☆');
    expect(starsGlyph(1)).toBe('★☆☆');
    expect(starsGlyph(0)).toBe(''); // a defeat shows no stars
  });

  it('translates the new management rejections into Guardian-facing hints', () => {
    expect(humanReason('no-defender')).toBe('No defender there');
    expect(humanReason('max-tier')).toBe('Already at max tier');
    expect(humanReason('battle-over')).toBe('The battle is over');
  });
});

// Modeless context-panel projection (issue #30): the pure view the DOM panel
// renders for an inspected Defender — stats, upgrade preview, removal refund.
describe('context panel projection (issue #30)', () => {
  function inspection(partial: Partial<DefenderInspection> = {}): DefenderInspection {
    return {
      ringId: 'ring-7',
      typeId: 'sprig-sentinel',
      name: 'Sprig Sentinel',
      tier: 0,
      maxTier: 2,
      range: 160,
      damage: 35,
      hp: 95,
      maxHp: 95,
      cooldown: 1.15,
      blocksPath: false,
      poisonDps: 0,
      invested: 50,
      removalRefund: 35,
      upgrade: {
        nextTier: 1,
        cost: 45,
        available: true,
        statChanges: { damage: { from: 35, to: 55 }, range: { from: 160, to: 175 } },
      },
      ...partial,
    };
  }

  it('returns null when there is no Defender to inspect (panel hides)', () => {
    expect(buildContextPanel(null)).toBeNull();
  });

  it('shows the name, tier ladder, and decisive ranged stats (AC2)', () => {
    const view = buildContextPanel(inspection())!;
    expect(view.title).toBe('Sprig Sentinel');
    expect(view.tierLabel).toBe('Tier 1 of 3');
    const labels = view.stats.map((s) => s.label);
    expect(labels).toEqual(['Damage', 'Range', 'Fire rate', 'Health']);
    const health = view.stats.find((s) => s.label === 'Health')!;
    expect(health.value).toBe('95/95');
  });

  it('previews exact upgrade cost and stat changes for an available upgrade (AC3)', () => {
    const view = buildContextPanel(inspection())!;
    expect(view.upgrade.summary).toBe('Upgrade to tier 2 — 45 mana');
    expect(view.upgrade.detail).toBe('Damage 35 → 55, Range 160 → 175');
    expect(view.upgrade.buttonLabel).toBe('Upgrade (45)');
    expect(view.upgrade.available).toBe(true);
  });

  it('explains an upgrade the Guardian cannot afford (AC3)', () => {
    const info = inspection({
      upgrade: { nextTier: 1, cost: 45, available: false, reason: 'insufficient-mana', statChanges: {} },
    });
    const view = buildContextPanel(info)!;
    expect(view.upgrade.available).toBe(false);
    expect(view.upgrade.detail).toBe('Not enough mana');
  });

  it('reports the max tier with no upgrade to offer (AC3)', () => {
    const info = inspection({ tier: 2, upgrade: null });
    const view = buildContextPanel(info)!;
    expect(view.upgrade.summary).toBe('Max tier reached');
    expect(view.upgrade.available).toBe(false);
  });

  it('shows the exact 70% removal refund in summary and confirm prompt (AC4)', () => {
    const info = inspection({ invested: 95, removalRefund: 67 });
    const view = buildContextPanel(info)!;
    expect(view.remove.summary).toBe('Remove — 67 mana refunded (70%)');
    expect(view.remove.confirm).toBe('Remove this Defender? 67 mana will be refunded.');
  });

  it('renders blocker stats (Health + role) for an on-path Bramble', () => {
    const info = inspection({
      typeId: 'thornvine-bramble',
      name: 'Thornvine Bramble',
      range: 0,
      damage: 0,
      cooldown: 0,
      hp: 180,
      maxHp: 180,
      blocksPath: true,
      invested: 35,
      removalRefund: 25,
      upgrade: { nextTier: 1, cost: 30, available: true, statChanges: { hp: { from: 180, to: 300 } } },
    });
    const view = buildContextPanel(info)!;
    const labels = view.stats.map((s) => s.label);
    expect(labels).toEqual(['Health', 'Role']);
    expect(view.stats.at(-1)!.value).toBe('Blocks the path');
    expect(view.upgrade.detail).toBe('Health 180 → 300');
  });
});

describe('spell rejection messages (issue #31)', () => {
  it('translates spell-cast and flower rejections into Guardian-facing hints', () => {
    expect(humanReason('spell-cooldown')).toBe('Spell on cooldown');
    expect(humanReason('spell-locked')).toBe('Spell not unlocked');
    expect(humanReason('no-spell-armed')).toBe('No spell selected');
    expect(humanReason('invalid-target')).toBe('Cannot cast there');
    expect(humanReason('already-collected')).toBe('Already collected');
    expect(humanReason('overlaps-ring')).toBe('Too close to a fairy ring');
  });
});

describe('spell availability text (issue #31 AC4)', () => {
  it('says Ready for a selectable spell', () => {
    expect(spellStateText(spell({ ready: true, affordable: true }))).toBe('Ready');
  });

  it('names the cooldown (rounded up) while a spell is cooling down', () => {
    expect(spellStateText(spell({ ready: false, cooldownRemaining: 18.2 }))).toBe('Cooldown 19s');
  });

  it('explains unaffordability when the Guardian lacks the Mana', () => {
    expect(spellStateText(spell({ ready: true, affordable: false, cost: 50 }))).toBe('Needs 50 mana');
  });

  it('says Paused (before cooldown/affordability) while the battle is paused (issue #32 AC4)', () => {
    expect(spellStateText(spell({ ready: true, affordable: true, reason: 'paused' }))).toBe('Paused');
    // Paused takes precedence even when the spell is also cooling down.
    expect(spellStateText(spell({ ready: false, cooldownRemaining: 18.2, reason: 'paused' }))).toBe('Paused');
  });

  it('translates the paused rejection into a Guardian-facing hint (issue #32 AC4)', () => {
    expect(humanReason('paused')).toBe('Not while paused');
  });
});

// Wave preview projection (issue #32 AC1): the pure view the DOM panel renders
// for the current and upcoming wave — heading, foe counts, traits, routes, boss
// warning, and countdown.
describe('wave preview projection (issue #32 AC1)', () => {
  function entry(partial: Partial<WavePreviewEntry> = {}): WavePreviewEntry {
    return {
      wave: 1,
      total: 3,
      groups: [{ type: 'logger', count: 3, name: 'Logger', traits: ['crew', 'ground', 'choppable'] }],
      routeIds: ['main'],
      boss: false,
      countdown: 0,
      ...partial,
    };
  }

  function preview(current: WavePreviewEntry | null, upcoming: WavePreviewEntry | null = null): WavePreview {
    return { current, upcoming };
  }

  it('renders null entries as null so the caller can hide a missing section', () => {
    const view = buildWavePreviewView(preview(null, null));
    expect(view.current).toBeNull();
    expect(view.upcoming).toBeNull();
  });

  it('shows the wave heading, total foes, and per-group counts (AC1)', () => {
    const view = buildWavePreviewView(preview(entry()))!;
    expect(view.current!.heading).toBe('Wave 1');
    expect(view.current!.count).toBe('3 foes');
    expect(view.current!.groups).toEqual(['3× Logger']);
  });

  it('flattens and de-duplicates enemy trait tags across groups', () => {
    const e = entry({
      total: 3,
      groups: [
        { type: 'logger', count: 2, name: 'Logger', traits: ['ground', 'crew'] },
        { type: 'drone', count: 1, name: 'Drone', traits: ['flying', 'ground'] },
      ],
    });
    const view = buildWavePreviewView(preview(e))!;
    expect(view.current!.traits).toEqual(['ground', 'crew', 'flying']);
  });

  it('lists a single route vs. multiple routes', () => {
    expect(buildWavePreviewView(preview(entry({ routeIds: ['main'] })))!.current!.routes).toBe('Route: main');
    expect(buildWavePreviewView(preview(entry({ routeIds: ['main', 'secondary'] })))!.current!.routes).toBe(
      'Routes: main, secondary',
    );
  });

  it('shows a boss warning on a boss wave and omits it otherwise', () => {
    expect(buildWavePreviewView(preview(entry({ boss: false })))!.current!.boss).toBeNull();
    expect(buildWavePreviewView(preview(entry({ boss: true })))!.current!.boss).toBe('⚠ Boss wave');
  });

  it('counts down to an upcoming wave (rounded up), and omits it once begun', () => {
    expect(buildWavePreviewView(preview(entry({ countdown: 0 })))!.current!.countdown).toBeNull();
    expect(buildWavePreviewView(preview(entry({ countdown: 8.2 })))!.current!.countdown).toBe('Starts in 9s');
  });

  it('projects both the current and the upcoming wave', () => {
    const view = buildWavePreviewView(preview(entry({ wave: 2, countdown: 0 }), entry({ wave: 3, countdown: 5 })));
    expect(view.current!.heading).toBe('Wave 2');
    expect(view.upcoming!.heading).toBe('Wave 3');
    expect(view.upcoming!.countdown).toBe('Starts in 5s');
  });
});
