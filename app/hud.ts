// Pure HUD rendering for the semantic DOM shell. Kept free of Phaser and DOM
// globals so it can be unit-tested with plain stub elements: it is the exact
// transformation the browser applies to each BattleState snapshot.

import type { BattleSnapshot } from './domain/battle';

/** Minimal structural shape renderHud touches — real HTMLElements satisfy this. */
export interface HudElements {
  mana: { textContent: string | null };
  hearts: { textContent: string | null };
  wave: { textContent: string | null };
  startBtn: { textContent: string | null; disabled: boolean };
  outcomeTitle: { textContent: string | null };
  outcomeStars: { textContent: string | null };
  outcomeMessage: { textContent: string | null };
  overlay: { hidden: boolean | string };
}

export function heartsGlyph(hearts: number, max: number): string {
  return '♥'.repeat(Math.max(0, hearts)) + '♡'.repeat(Math.max(0, max - hearts));
}

/** Filled + empty stars out of 3 for a victory result (empty string on defeat). */
export function starsGlyph(stars: number): string {
  if (stars <= 0) return '';
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
}

export function waveText(snap: BattleSnapshot): string {
  return `${Math.max(1, snap.waveNumber)} / ${snap.totalWaves}`;
}

export function humanReason(reason: string): string {
  switch (reason) {
    case 'insufficient-mana':
      return 'Not enough mana';
    case 'ring-occupied':
      return 'That ring already has a defender';
    case 'placement-mismatch':
      return 'That defender belongs on a different ring';
    case 'battle-over':
      return 'The battle is over';
    case 'unknown-ring':
      return 'No fairy ring there';
    case 'unknown-defender':
      return 'Unknown defender';
    case 'nothing-to-undo':
      return 'Nothing to undo';
    case 'undo-expired':
      return 'Undo window expired';
    default:
      return 'Cannot place there';
  }
}

/**
 * Project a snapshot onto the semantic HUD elements. Mutates the passed element
 * stubs exactly the way the live DOM is updated each frame.
 */
export function renderHud(snap: BattleSnapshot, els: HudElements): void {
  els.mana.textContent = String(snap.mana);
  els.hearts.textContent = heartsGlyph(snap.hearts, snap.maxHearts);
  els.wave.textContent = waveText(snap);

  if (snap.phase === 'running') {
    els.startBtn.textContent = snap.paused ? 'Paused' : 'Wave Running';
    els.startBtn.disabled = true;
  }

  if (snap.phase === 'won' || snap.phase === 'lost') {
    const won = snap.phase === 'won';
    els.outcomeTitle.textContent = won ? 'Victory' : 'Defeat';
    // The combined star result is shown only for a victory (issue #29 AC2/AC4).
    els.outcomeStars.textContent = won ? starsGlyph(snap.stars) : '';
    els.outcomeMessage.textContent = won
      ? `The Heartwood endures — ${snap.hearts} heart${snap.hearts === 1 ? '' : 's'} remaining.`
      : 'ChopCo reached the Heartwood.';
    els.overlay.hidden = false;
    els.startBtn.disabled = true;
  }
}
