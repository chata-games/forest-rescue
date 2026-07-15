// Production entry point. Wires the engine-independent BattleState to the Phaser
// battlefield and the semantic DOM/CSS HUD. Relative asset paths (base './')
// keep the build deployable to GitHub Pages at any subpath.

import Phaser from 'phaser';
import { BattleState } from './domain/battle';
import { getDefender } from './domain/content';
import { BattleScene } from './phaser/battle-scene';
import { humanReason, renderHud, type HudElements } from './hud';
import type { BattleSnapshot } from './domain/battle';
import type { CompiledLevel } from './domain/types';
import meadowsRaw from '../levels/compiled/01-meadows-edge.json';

const meadows = meadowsRaw as CompiledLevel;

interface QueryOptions {
  god: boolean;
  timeScale: number;
}

function readOptions(): QueryOptions {
  const params = new URLSearchParams(location.search);
  return {
    god: params.get('god') === '1',
    timeScale: Math.max(1, Number(params.get('turbo')) || 1),
  };
}

const options = readOptions();

function createBattle(): BattleState {
  return new BattleState({
    level: meadows,
    startingMana: options.god ? 9999 : meadows.startingMana,
  });
}

const battle = createBattle();

// --- DOM references -------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const manaValue = $<HTMLSpanElement>('manaValue');
const heartsValue = $<HTMLSpanElement>('heartsValue');
const waveValue = $<HTMLSpanElement>('waveValue');
const pauseBtn = $<HTMLButtonElement>('pauseBtn');
const startBtn = $<HTMLButtonElement>('startBtn');
const replayBtn = $<HTMLButtonElement>('replayBtn');
const undoBtn = $<HTMLButtonElement>('undoBtn');
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tool'));
const overlay = $<HTMLElement>('outcomeOverlay');
const outcomeTitle = $<HTMLHeadingElement>('outcomeTitle');
const outcomeMessage = $<HTMLParagraphElement>('outcomeMessage');
const hint = $<HTMLOutputElement>('hint');

const hudElements: HudElements = {
  mana: manaValue,
  hearts: heartsValue,
  wave: waveValue,
  startBtn,
  outcomeTitle,
  outcomeMessage,
  overlay,
};

let hintTimer = 0;
function showHint(message: string): void {
  hint.textContent = message;
  hintTimer = 1.4;
}

// --- Defender selection ---------------------------------------------------
function selectDefender(typeId: string): void {
  battle.selectDefender(typeId);
  for (const btn of toolButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.defender === typeId));
  }
}

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => selectDefender(btn.dataset.defender!));
});

// --- Commands -------------------------------------------------------------
startBtn.addEventListener('click', () => {
  if (battle.phase !== 'planning') return;
  battle.start();
});

pauseBtn.addEventListener('click', () => {
  const next = !battle.paused;
  battle.setPaused(next);
  pauseBtn.setAttribute('aria-pressed', String(next));
  pauseBtn.textContent = next ? 'Resume' : 'Pause';
});

replayBtn.addEventListener('click', () => location.reload());

/** Fully refund the most recent placement within its 4-second window (issue #22 AC6). */
function undoLastPlacement(): void {
  const result = battle.undoLastPlacement();
  if (result.ok) showHint(`Undone — ${result.refund} mana refunded`);
  else showHint(humanReason(result.reason));
}

undoBtn.addEventListener('click', undoLastPlacement);

// Keyboard parity: the same Undo works with touch, mouse, pen, and keyboard.
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;
  if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
    if (!undoBtn.disabled) {
      e.preventDefault();
      undoLastPlacement();
    }
  }
});

function handleRingClick(ringId: string | null, typeId: string = battle.selectedDefenderType): void {
  if (!ringId) return;
  if (battle.phase !== 'planning' && battle.phase !== 'running') return;
  // typeId is the tool snapshotted at touch-down; committing it means a second
  // thumb flipping the selection can never buy the wrong defender (issue #22 AC5).
  const result = battle.placeDefender(ringId, typeId);
  if (result.ok) {
    const stats = getDefender(result.defender.typeId);
    showHint(`Planted ${stats?.name ?? 'defender'}`);
  } else {
    showHint(humanReason(result.reason));
  }
}

// --- HUD sync (driven by the scene each frame) ----------------------------
let lastSync = '';

function syncHud(snap: BattleSnapshot): void {
  // The Undo button reflects the undo window every frame, independent of the
  // coarser HUD sync key, so it lights up the instant a placement is refundable.
  undoBtn.disabled = !snap.canUndo;

  const key = `${snap.phase}|${snap.mana}|${snap.hearts}|${snap.waveNumber}|${snap.paused}`;
  if (key === lastSync) {
    if (hintTimer > 0) hintTimer -= 1 / 60;
    return;
  }
  lastSync = key;
  renderHud(snap, hudElements);
}

// --- Phaser bootstrap -----------------------------------------------------
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1536,
  height: 1024,
  backgroundColor: '#143d2c',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene: [BattleScene],
});

game.registry.set('battleApi', { battle, onRingClick: handleRingClick });
game.registry.set('timeScale', options.timeScale);
game.registry.set('onFrame', syncHud);

// Debug/test seam. Ring taps on a FIT-scaled canvas are coordinate-fragile, so
// this exposes the exact same placement/start handlers the pointer path uses,
// letting E2E drive a deterministic launch-to-outcome journey. The domain and
// HUD still do all the real work; this only routes input.
export interface ForestRescueDebug {
  placeOnRing(ringId: string): void;
  selectDefender(typeId: string): void;
  start(): void;
  ringIds(): string[];
}

declare global {
  interface Window {
    fr?: ForestRescueDebug;
  }
}

window.fr = {
  placeOnRing: (ringId: string) => handleRingClick(ringId),
  selectDefender,
  start: () => battle.start(),
  ringIds: () => battle.rings.map((r) => r.id),
};
