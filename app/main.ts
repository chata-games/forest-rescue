// Production entry point. Wires the engine-independent BattleState to the Phaser
// battlefield and the semantic DOM/CSS HUD. Relative asset paths (base './')
// keep the build deployable to GitHub Pages at any subpath.
//
// Author preview: `?level=<id>` previews any compiled level, `?layout=portrait`
// forces the compact phone layout, and `?preview=1` overlays routes, hazards,
// wave composition, metrics, and the deterministic simulation summary.

import Phaser from 'phaser';
import { BattleState } from './domain/battle';
import { getDefender } from './domain/content';
import { BattleScene } from './phaser/battle-scene';
import { humanReason, renderHud, type HudElements } from './hud';
import { buildPreviewSummary, type PreviewSummary, type SimulationFile } from './domain/preview';
import type { BattleSnapshot } from './domain/battle';
import type { CompiledLevel } from './domain/types';

// Eagerly import every compiled level (+ its deterministic simulation) so any
// level can be previewed by stable id without a network round-trip.
const levelModules = import.meta.glob('../levels/compiled/*.json', { eager: true }) as Record<string, CompiledLevel>;
const simModules = import.meta.glob('../levels/compiled/*.simulation.json', { eager: true }) as Record<string, SimulationFile>;

const LEVELS: Record<string, CompiledLevel> = {};
for (const [path, level] of Object.entries(levelModules)) {
  if (path.includes('.simulation')) continue;
  LEVELS[level.id] = level;
}
const SIMS: Record<string, SimulationFile> = {};
for (const sim of Object.values(simModules)) SIMS[sim.levelId] = sim;

const LEVEL_ORDER = Object.keys(LEVELS).filter((id) => !id.startsWith('00-')).sort();
if (LEVEL_ORDER.length === 0) throw new Error('No compiled levels found for preview');

interface QueryOptions {
  god: boolean;
  timeScale: number;
  levelId: string;
  layout: 'auto' | 'portrait' | 'landscape';
  preview: boolean;
}

function readOptions(): QueryOptions {
  const params = new URLSearchParams(location.search);
  const layoutParam = params.get('layout');
  const layout = layoutParam === 'portrait' || layoutParam === 'landscape' ? layoutParam : 'auto';
  return {
    god: params.get('god') === '1',
    timeScale: Math.max(1, Number(params.get('turbo')) || 1),
    levelId: params.get('level') ?? '01-meadows-edge',
    layout,
    preview: params.get('preview') === '1',
  };
}

const options = readOptions();

function resolveLevel(id: string): CompiledLevel {
  const level = LEVELS[id] ?? LEVELS[LEVEL_ORDER[0]];
  if (!level) throw new Error(`No compiled level for id '${id}'`);
  return level;
}

const level = resolveLevel(options.levelId);
const simulation = SIMS[level.id];

function createBattle(): BattleState {
  return new BattleState({
    level,
    startingMana: options.god ? 9999 : level.startingMana,
  });
}

const battle = createBattle();
const summary: PreviewSummary | undefined = options.preview
  ? buildPreviewSummary(level, simulation)
  : undefined;

// --- DOM references -------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const manaValue = $<HTMLSpanElement>('manaValue');
const heartsValue = $<HTMLSpanElement>('heartsValue');
const waveValue = $<HTMLSpanElement>('waveValue');
const pauseBtn = $<HTMLButtonElement>('pauseBtn');
const startBtn = $<HTMLButtonElement>('startBtn');
const replayBtn = $<HTMLButtonElement>('replayBtn');
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tool'));
const overlay = $<HTMLElement>('outcomeOverlay');
const outcomeTitle = $<HTMLHeadingElement>('outcomeTitle');
const outcomeMessage = $<HTMLParagraphElement>('outcomeMessage');
const hint = $<HTMLOutputElement>('hint');
const levelName = $<HTMLElement>('levelName');
const levelSelect = $<HTMLSelectElement>('levelSelect');
const layoutBtn = $<HTMLButtonElement>('layoutBtn');
const previewPanel = $<HTMLElement>('previewPanel');

// --- Layout + level selection --------------------------------------------
function currentLayout(): QueryOptions['layout'] {
  if (document.body.classList.contains('force-portrait')) return 'portrait';
  if (document.body.classList.contains('force-landscape')) return 'landscape';
  return 'auto';
}

function applyLayout(layout: QueryOptions['layout']): void {
  document.body.classList.toggle('force-portrait', layout === 'portrait');
  document.body.classList.toggle('force-landscape', layout === 'landscape');
  if (layoutBtn) {
    layoutBtn.textContent = `Layout: ${currentLayout()}`;
  }
}

function navigate(next: Partial<QueryOptions>): void {
  const params = new URLSearchParams(location.search);
  const merged = { ...options, ...next };
  params.set('level', merged.levelId);
  if (merged.preview) params.set('preview', '1'); else params.delete('preview');
  if (merged.layout !== 'auto') params.set('layout', merged.layout); else params.delete('layout');
  location.search = params.toString();
}

if (levelName) levelName.textContent = level.name;

if (levelSelect) {
  for (const id of LEVEL_ORDER) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = LEVELS[id].name ?? id;
    if (id === level.id) opt.selected = true;
    levelSelect.appendChild(opt);
  }
  levelSelect.addEventListener('change', () => navigate({ levelId: levelSelect.value }));
}

if (layoutBtn) {
  layoutBtn.addEventListener('click', () => {
    applyLayout(currentLayout() === 'portrait' ? 'landscape' : 'portrait');
  });
}

applyLayout(options.layout);

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

function handleRingClick(ringId: string | null): void {
  if (!ringId) return;
  if (battle.phase !== 'planning' && battle.phase !== 'running') return;
  const result = battle.placeDefender(ringId);
  if (result.ok) {
    const stats = getDefender(result.defender.typeId);
    showHint(`Planted ${stats?.name ?? 'defender'}`);
  } else {
    showHint(humanReason(result.reason));
  }
}

// --- Preview legend (author overlays) ------------------------------------
function renderPreviewLegend(): void {
  if (!previewPanel || !summary) return;
  const m = summary.metrics;
  const rows: string[] = [];
  rows.push(`<h3>${summary.meta.name}</h3>`);
  rows.push(`<p class="preview__meta">${summary.meta.biome} · boss: ${summary.meta.bossId ?? 'none'} · spell: ${summary.meta.spellUnlock ?? 'none'}</p>`);
  if (m) {
    rows.push(`<p class="preview__metrics">path ${m.pathLength} · ${m.ringCount} rings · coverage ${m.averageRingCoverage} · choke ${m.chokepoints} · diff ${m.estimatedDifficulty}</p>`);
  }
  if (summary.hazards.length) {
    rows.push(`<p class="preview__hazards">hazards: ${summary.hazards.map((h) => h.label).join(', ')}</p>`);
  }
  const waveList = summary.waves
    .map((w) => `<li><b>W${w.index + 1}</b> ${w.totalEnemies} foe${w.totalEnemies === 1 ? '' : 's'}: ${w.groups.map((g) => `${g.count}× ${g.type}`).join(', ')}</li>`)
    .join('');
  rows.push(`<ol class="preview__waves">${waveList}</ol>`);
  if (summary.simulation?.length) {
    const sims = summary.simulation
      .map((s) => {
        const verdict = s.band ? `${s.band}: ${s.inBand ? 'in band' : 'OUT OF BAND'}` : 'no band';
        return `<li>${s.bot} — ${s.won ? 'win' : 'loss'} (${s.hearts}♥) <span class="preview__band">${verdict}</span></li>`;
      })
      .join('');
    rows.push(`<ul class="preview__sims">${sims}</ul>`);
  }
  previewPanel.innerHTML = rows.join('');
  previewPanel.hidden = false;
}

if (options.preview) renderPreviewLegend();

// --- HUD sync (driven by the scene each frame) ----------------------------
let lastSync = '';

function syncHud(snap: BattleSnapshot): void {
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
game.registry.set('preview', options.preview);
if (summary) game.registry.set('summary', summary);

// Debug/test seam. Ring taps on a FIT-scaled canvas are coordinate-fragile, so
// this exposes the exact same placement/start handlers the pointer path uses,
// letting E2E drive a deterministic launch-to-outcome journey. The domain and
// HUD still do all the real work; this only routes input.
export interface ForestRescueDebug {
  placeOnRing(ringId: string): void;
  selectDefender(typeId: string): void;
  start(): void;
  ringIds(): string[];
  level: CompiledLevel;
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
  level,
};
