// Production entry point. The campaign starts on the Trail — a semantic DOM/CSS
// map whose route, nodes, state, labels, and hit regions are all derived from
// the campaign manifest (generated art supplies scenery only). Entering a level
// lazily boots the Phaser battlefield behind the same semantic DOM/CSS HUD.
//
// Relative asset paths (base './') keep the build deployable to GitHub Pages at
// any subpath. Progress is a versioned local JSON save with safe reset on
// schema drift or corruption.

import Phaser from 'phaser';
import { BattleState } from './domain/battle';
import { getDefender } from './domain/content';
import { BattleScene } from './phaser/battle-scene';
import { humanReason, renderHud, type HudElements } from './hud';
import { renderTrail, renderDetail, type TrailElements, type DetailElements, type NodeElement } from './trail';
import {
  resolveTrail,
  emptyProgress,
  markCleared,
  type CampaignManifest,
  type LevelMeta,
  type CampaignProgress,
  type TrailNode,
} from './domain/campaign';
import type { BattleSnapshot } from './domain/battle';
import type { CompiledLevel } from './domain/types';
import manifestRaw from '../levels/campaign.json';
import lvl01 from '../levels/compiled/01-meadows-edge.json';
import lvl02 from '../levels/compiled/02-old-stump-crossroads.json';
import lvl03 from '../levels/compiled/03-whispering-river.json';
import lvl04 from '../levels/compiled/04-mushroom-hollow.json';
import lvl05 from '../levels/compiled/05-sawmill-clearing.json';
import lvl06 from '../levels/compiled/06-ashfall-scar.json';
import lvl07 from '../levels/compiled/07-boulder-pass.json';

const manifest = manifestRaw as CampaignManifest;

// Every campaign CompiledLevel, keyed by stable id. The Trail resolves from the
// manifest; the battle boots the matching CompiledLevel when one is entered.
const COMPILED: Record<string, CompiledLevel> = {
  '01-meadows-edge': lvl01 as CompiledLevel,
  '02-old-stump-crossroads': lvl02 as CompiledLevel,
  '03-whispering-river': lvl03 as CompiledLevel,
  '04-mushroom-hollow': lvl04 as CompiledLevel,
  '05-sawmill-clearing': lvl05 as CompiledLevel,
  '06-ashfall-scar': lvl06 as CompiledLevel,
  '07-boulder-pass': lvl07 as CompiledLevel,
};

function buildMeta(level: CompiledLevel): LevelMeta {
  return {
    id: level.id,
    name: level.name,
    biome: level.biome,
    waveCount: level.waves.length,
    unlocks: level.unlocks ?? [],
    spellUnlock: level.spellUnlock ?? null,
    bossId: level.bossId ?? null,
  };
}

const META: Record<string, LevelMeta> = {};
for (const id of Object.keys(COMPILED)) META[id] = buildMeta(COMPILED[id]);

// --- Options + progress ---------------------------------------------------
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

const SAVE_KEY = 'heartwood-trail-v1';
const SAVE_VERSION = 1;

interface SaveData {
  schemaVersion: number;
  levels: CampaignProgress;
}

function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptyProgress();
    const data = JSON.parse(raw) as Partial<SaveData>;
    // Migration / corruption recovery: an unexpected schema resets cleanly.
    if (data.schemaVersion !== SAVE_VERSION || !data.levels) return emptyProgress();
    return data.levels;
  } catch {
    return emptyProgress();
  }
}

function saveProgress(p: CampaignProgress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SAVE_VERSION, levels: p }));
  } catch {
    /* localStorage may be unavailable (private mode / quota) — progress stays in-memory. */
  }
}

let progress = loadProgress();

// --- DOM references -------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const trailScreen = $<HTMLElement>('trailScreen');
const trailMap = $<HTMLElement>('trailMap');
const detail = $<HTMLDialogElement>('trailDetail');
const battleRoot = $<HTMLElement>('battleRoot');

const levelName = $<HTMLElement>('levelName');
const manaValue = $<HTMLSpanElement>('manaValue');
const heartsValue = $<HTMLSpanElement>('heartsValue');
const waveValue = $<HTMLSpanElement>('waveValue');
const pauseBtn = $<HTMLButtonElement>('pauseBtn');
const startBtn = $<HTMLButtonElement>('startBtn');
const replayBtn = $<HTMLButtonElement>('replayBtn');
const returnToTrailBtn = $<HTMLButtonElement>('returnToTrailBtn');
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

// --- Trail construction ---------------------------------------------------
let trailNodes: TrailNode[] = resolveTrail(manifest, META, progress);
let selectedId: string | null = null;
let nodeButtons: HTMLButtonElement[] = [];
let routeLine: SVGPolylineElement | null = null;
let lastFocusedNode: HTMLButtonElement | null = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A projector-facing view of a node button. Real HTMLElements satisfy every
 * field except `dataset` (DOMStringMap is string|undefined), so this delegates
 * writes to the button while exposing the plain shape renderTrail expects.
 */
function nodeView(btn: HTMLButtonElement): NodeElement {
  return {
    style: btn.style,
    get textContent() {
      return btn.textContent;
    },
    set textContent(v: string | null) {
      btn.textContent = v;
    },
    get ariaLabel() {
      return btn.ariaLabel;
    },
    set ariaLabel(v: string | null) {
      btn.ariaLabel = v;
    },
    dataset: btn.dataset as unknown as Record<string, string>,
  };
}

function buildTrailDom(): void {
  trailMap.innerHTML = '';

  // Route polyline: joins node centers. viewBox 0..100 + non-uniform scaling
  // maps the manifest's normalized positions straight onto the map.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'trail__route');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  routeLine = document.createElementNS(SVG_NS, 'polyline');
  routeLine.setAttribute('class', 'route__line');
  svg.append(routeLine);
  trailMap.append(svg);

  // One semantic control per level, appended in manifest order so keyboard
  // (Tab) traversal follows the campaign route.
  nodeButtons = trailNodes.map((node) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trail-node';
    btn.dataset.level = node.id;
    btn.addEventListener('click', () => selectNode(node.id, btn));
    trailMap.append(btn);
    return btn;
  });
}

function renderTrailView(): void {
  const routeMirror = { points: '' as string | null };
  const els: TrailElements = { nodes: nodeButtons.map(nodeView), route: routeMirror };
  renderTrail(trailNodes, els);
  routeLine?.setAttribute('points', routeMirror.points ?? '');
}

function refreshTrail(): void {
  trailNodes = resolveTrail(manifest, META, progress);
  // Node count is fixed by the manifest; reuse the existing controls.
  if (nodeButtons.length !== trailNodes.length) buildTrailDom();
  renderTrailView();
}

// --- Trail selection / detail --------------------------------------------
function selectNode(levelId: string, origin: HTMLButtonElement): void {
  selectedId = levelId;
  lastFocusedNode = origin;
  const node = trailNodes.find((n) => n.id === levelId);
  if (!node) return;

  const enterBtnEl = $<HTMLButtonElement>('detailEnter');
  const backBtnEl = $<HTMLButtonElement>('detailBack');
  const els: DetailElements = {
    title: $<HTMLHeadingElement>('detailTitle'),
    blurb: $<HTMLParagraphElement>('detailBlurb'),
    meta: $<HTMLParagraphElement>('detailMeta'),
    rewards: $<HTMLParagraphElement>('detailRewards'),
    unlock: $<HTMLParagraphElement>('detailUnlock'),
    enterBtn: enterBtnEl,
  };
  renderDetail(node, els);

  if (typeof detail.showModal === 'function') {
    if (!detail.open) detail.showModal();
  } else if (!detail.open) {
    detail.setAttribute('open', '');
  }
  // Focus the primary action for available levels, the dismiss action for locked.
  (node.enterable ? enterBtnEl : backBtnEl).focus();
}

function closeDetail(): void {
  if (detail.open) detail.close();
}

function trailKeydown(event: KeyboardEvent): void {
  // Spatial keyboard navigation between nodes, complementing Tab order.
  const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
  const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
  if (!horizontal && !vertical) return;
  const current = nodeButtons.indexOf(document.activeElement as HTMLButtonElement);
  if (current === -1) return;
  event.preventDefault();
  const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  const next = (current + delta + nodeButtons.length) % nodeButtons.length;
  nodeButtons[next]!.focus();
}

$<HTMLButtonElement>('detailBack').addEventListener('click', closeDetail);
$<HTMLButtonElement>('detailEnter').addEventListener('click', () => {
  if (!selectedId) return;
  const node = trailNodes.find((n) => n.id === selectedId);
  if (!node || !node.enterable) return;
  closeDetail();
  enterLevel(selectedId);
});
detail.addEventListener('close', () => {
  lastFocusedNode?.focus();
  lastFocusedNode = null;
});

// --- Battle (lazy) --------------------------------------------------------
let battle: BattleState | null = null;
let currentLevelId: string | null = null;
let game: Phaser.Game | null = null;
let outcomeRecorded = false;
let hintTimer = 0;
let lastSync = '';

function showHint(message: string): void {
  hint.textContent = message;
  hintTimer = 1.4;
}

function selectDefender(typeId: string): void {
  if (!battle) return;
  battle.selectDefender(typeId);
  for (const btn of toolButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.defender === typeId));
  }
}

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => selectDefender(btn.dataset.defender!));
});

startBtn.addEventListener('click', () => {
  if (!battle || battle.phase !== 'planning') return;
  battle.start();
});

pauseBtn.addEventListener('click', () => {
  if (!battle) return;
  const next = !battle.paused;
  battle.setPaused(next);
  pauseBtn.setAttribute('aria-pressed', String(next));
  pauseBtn.textContent = next ? 'Resume' : 'Pause';
});

function handleRingClick(ringId: string | null): void {
  if (!ringId || !battle) return;
  if (battle.phase !== 'planning' && battle.phase !== 'running') return;
  const result = battle.placeDefender(ringId);
  if (result.ok) {
    const stats = getDefender(result.defender.typeId);
    showHint(`Planted ${stats?.name ?? 'defender'}`);
  } else {
    showHint(humanReason(result.reason));
  }
}

function resetBattleHud(): void {
  lastSync = '';
  outcomeRecorded = false;
  overlay.hidden = true;
  startBtn.textContent = 'Start Wave';
  startBtn.disabled = false;
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.textContent = 'Pause';
  hint.textContent = '';
  selectDefender('sprig-sentinel');
}

function starsFor(hearts: number, max: number): number {
  if (hearts >= max) return 3;
  if (hearts >= max - 1) return 2;
  return 1;
}

function recordOutcome(snap: BattleSnapshot): void {
  if (!currentLevelId || snap.phase !== 'won' || outcomeRecorded) return;
  outcomeRecorded = true;
  progress = markCleared(progress, currentLevelId, starsFor(snap.hearts, snap.maxHearts));
  saveProgress(progress);
}

function syncHud(snap: BattleSnapshot): void {
  recordOutcome(snap);
  const key = `${snap.phase}|${snap.mana}|${snap.hearts}|${snap.waveNumber}|${snap.paused}`;
  if (key === lastSync) {
    if (hintTimer > 0) hintTimer -= 1 / 60;
    return;
  }
  lastSync = key;
  renderHud(snap, hudElements);
}

function bootBattleScene(): void {
  if (!battle) return;
  game = new Phaser.Game({
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
}

function enterLevel(levelId: string): void {
  const level = COMPILED[levelId];
  if (!level) return;
  currentLevelId = levelId;

  // Fresh battle for this level. Destroy any prior Phaser game so the scene
  // recompiles terrain for the new trail/rings.
  if (game) {
    game.destroy(true);
    game = null;
  }
  battle = new BattleState({
    level,
    startingMana: options.god ? 9999 : level.startingMana,
  });

  levelName.textContent = level.name;
  resetBattleHud();

  trailScreen.hidden = true;
  battleRoot.hidden = false;
  bootBattleScene();
  window.fr = makeDebugApi();
}

function returnToTrail(): void {
  if (game) {
    game.destroy(true);
    game = null;
  }
  battle = null;
  currentLevelId = null;
  closeDetail();
  battleRoot.hidden = true;
  trailScreen.hidden = false;
  refreshTrail();
  // Land focus on the current level so the next step is obvious.
  const current = trailNodes.find((n) => n.status === 'current') ?? trailNodes[0];
  if (current) nodeButtons.find((b) => b.dataset.level === current.id)?.focus();
}

replayBtn.addEventListener('click', () => {
  if (currentLevelId) enterLevel(currentLevelId);
});
returnToTrailBtn.addEventListener('click', returnToTrail);

// Debug/test seam. Ring taps on a FIT-scaled canvas are coordinate-fragile, so
// this exposes the exact same placement/start handlers the pointer path uses,
// letting E2E drive a deterministic launch-to-outcome journey after entering a
// level from the Trail. The domain and HUD still do all the real work.
function makeDebugApi() {
  return {
    placeOnRing: (ringId: string) => handleRingClick(ringId),
    selectDefender,
    start: () => battle?.start(),
    ringIds: () => (battle ? battle.rings.map((r) => r.id) : []),
  };
}

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

// --- Boot -----------------------------------------------------------------
buildTrailDom();
renderTrailView();
trailMap.addEventListener('keydown', trailKeydown);
