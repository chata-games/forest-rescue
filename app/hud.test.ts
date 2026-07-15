import { describe, it, expect } from 'vitest';
import { heartsGlyph, humanReason, renderHud, starsGlyph, waveText, type HudElements } from './hud';
import type { BattleSnapshot } from './domain/battle';

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
});
