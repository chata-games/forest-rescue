// Production entry point. The campaign starts on the Trail — a semantic DOM/CSS
// map whose route, nodes, state, labels, and hit regions are all derived from
// the campaign manifest (generated art supplies scenery only). Entering a level
// lazily boots the Phaser battlefield behind the same semantic DOM/CSS HUD.
//
// Relative asset paths (base './') keep the build deployable to GitHub Pages at
// any subpath. Progress is a versioned local JSON save with safe reset on
// schema drift or corruption.
//
// Author preview: `?level=<id>` drops straight into any level, `?layout=portrait`
// forces the compact phone layout, and `?preview=1` overlays routes, hazards,
// wave composition, metrics, and the deterministic simulation summary.

import Phaser from 'phaser';
import { BattleState } from './domain/battle';
import type { BattleSnapshot, WavePreview } from './domain/battle';
import { DEFENDERS, SPELLS, getDefender, getSpell } from './domain/content';
import {
  addToLoadout,
  buildLoadoutView,
  buildPool,
  canStart,
  clearSlot,
  emptyLoadout,
  loadoutAdvice,
  loadoutCapacity,
  starterLoadout,
  type AvailableItem,
  type Loadout,
  type LoadoutContext,
} from './domain/loadout';
import { BattleScene } from './phaser/battle-scene';
import {
  buildContextPanel,
  buildWavePreviewView,
  humanReason,
  renderHud,
  spellStateText,
  type HudElements,
  type WavePreviewWaveView,
} from './hud';
import {
  effectiveLayout,
  portraitAdvice,
  shouldShowPortraitAdvice,
  type LayoutMode,
  type LayoutOverride,
} from './responsive';
import { renderTrail, renderDetail, type TrailElements, type DetailElements } from './trail';
import {
  resolveTrail,
  emptyProgress,
  type CampaignManifest,
  type LevelMeta,
  type CampaignProgress,
  type TrailNode,
} from './domain/campaign';
import { recordResult } from './domain/scoring';
import { buildPreviewSummary, type PreviewSummary, type SimulationFile } from './domain/preview';
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

// Manifest order for the author level picker, and the deterministic simulations
// (outcome bands) keyed by level id — eagerly imported so any level can preview.
const LEVEL_ORDER = Object.keys(COMPILED).sort();
const simModules = import.meta.glob('../levels/compiled/*.simulation.json', { eager: true }) as Record<string, SimulationFile>;
const SIMS: Record<string, SimulationFile> = {};
for (const sim of Object.values(simModules)) SIMS[sim.levelId] = sim;

function resolveLevel(id: string): CompiledLevel {
  return COMPILED[id] ?? COMPILED['01-meadows-edge'];
}

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

/**
 * Defenders AND spells immediately available for a level's Loadout: every reward
 * unlocked by this level or an earlier one in campaign order (cumulative), so
 * completion rewards stay usable for the next Loadout (issue #21 AC3). Drives
 * the Loadout pool; ids not yet in the content catalogue are filtered out by the
 * pool builder (they are not "immediately available").
 */
function cumulativeUnlocks(levelId: string): string[] {
  const idx = LEVEL_ORDER.indexOf(levelId);
  const ids: string[] = [];
  for (let i = 0; i <= idx; i++) {
    const meta = META[LEVEL_ORDER[i] ?? ''];
    if (!meta) continue;
    for (const defender of meta.unlocks) if (!ids.includes(defender)) ids.push(defender);
    if (meta.spellUnlock && !ids.includes(meta.spellUnlock)) ids.push(meta.spellUnlock);
  }
  return ids;
}

// Mana flowers spawn on a steady cadence so collection is a live part of play.
// Measured on the battle clock, so Pause/planning freeze the spawns too.
const MANA_FLOWER_INTERVAL_SEC = 12;

// --- Options + progress ---------------------------------------------------
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

// Deterministic outcome-band summary for the author preview level (if any).
const summary: PreviewSummary | undefined = options.preview
  ? buildPreviewSummary(resolveLevel(options.levelId), SIMS[options.levelId])
  : undefined;

// --- DOM references -------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const trailScreen = $<HTMLElement>('trailScreen');
const trailMap = $<HTMLElement>('trailMap');
const detail = $<HTMLDialogElement>('trailDetail');
const battleRoot = $<HTMLElement>('battleRoot');

// Loadout screen (issue #21): the pre-battle assembly step between the Trail
// detail and the battlefield. The Guardian fills slots from the immediately
// available pool; Start is gated on a non-empty Loadout.
const loadoutScreen = $<HTMLElement>('loadoutScreen');
const loadoutTitle = $<HTMLHeadingElement>('loadoutTitle');
const loadoutPool = $<HTMLElement>('loadoutPool');
const loadoutSlots = $<HTMLElement>('loadoutSlots');
const loadoutAdviceEl = $<HTMLElement>('loadoutAdvice');
const loadoutStartBtn = $<HTMLButtonElement>('loadoutStart');
const loadoutBackBtn = $<HTMLButtonElement>('loadoutBack');

const levelName = $<HTMLElement>('levelName');
const manaValue = $<HTMLSpanElement>('manaValue');
const heartsValue = $<HTMLSpanElement>('heartsValue');
const waveValue = $<HTMLSpanElement>('waveValue');
const pauseBtn = $<HTMLButtonElement>('pauseBtn');
const startBtn = $<HTMLButtonElement>('startBtn');
const replayBtn = $<HTMLButtonElement>('replayBtn');
const returnToTrailBtn = $<HTMLButtonElement>('returnToTrailBtn');
const undoBtn = $<HTMLButtonElement>('undoBtn');
const toolbar = $<HTMLElement>('toolbar');
// Defender tools are rebuilt per battle from the chosen Loadout (issue #21), so
// the array is reassigned rather than captured once.
let toolButtons: HTMLButtonElement[] = [];
const spellbar = $<HTMLElement>('spellbar');
let spellButtons: HTMLButtonElement[] = [];
const overlay = $<HTMLElement>('outcomeOverlay');
const outcomeTitle = $<HTMLHeadingElement>('outcomeTitle');
const outcomeStars = $<HTMLParagraphElement>('outcomeStars');
const outcomeMessage = $<HTMLParagraphElement>('outcomeMessage');
const hint = $<HTMLOutputElement>('hint');
// Author preview controls: level picker, phone-layout toggle, and the legend.
const levelSelect = $<HTMLSelectElement>('levelSelect');
const layoutBtn = $<HTMLButtonElement>('layoutBtn');
const previewPanel = $<HTMLElement>('previewPanel');

// Modeless Defender context panel (issue #30): inspect/upgrade/remove the
// Defender on a tapped occupied ring without dropping the selected placement tool.
const contextPanel = $<HTMLElement>('contextPanel');
const cpTitle = $<HTMLHeadingElement>('cpTitle');
const cpTier = $<HTMLElement>('cpTier');
const cpStats = $<HTMLUListElement>('cpStats');
const cpUpgradeSummary = $<HTMLParagraphElement>('cpUpgradeSummary');
const cpUpgradeDetail = $<HTMLParagraphElement>('cpUpgradeDetail');
const cpUpgradeBtn = $<HTMLButtonElement>('cpUpgradeBtn');
const cpRemoveSummary = $<HTMLParagraphElement>('cpRemoveSummary');
const cpRemoveBtn = $<HTMLButtonElement>('cpRemoveBtn');
const cpConfirm = $<HTMLElement>('cpConfirm');
const cpConfirmText = $<HTMLParagraphElement>('cpConfirmText');
const cpConfirmBtn = $<HTMLButtonElement>('cpConfirmBtn');
const cpCancelBtn = $<HTMLButtonElement>('cpCancelBtn');
const cpCloseBtn = $<HTMLButtonElement>('cpClose');

// Wave preview (issue #32 AC1) — a corner panel while planning, and a copy inside
// the pause overlay for mid-battle planning.
const wavePreviewPanel = $<HTMLElement>('wavePreview');
const wavePreviewBody = $<HTMLElement>('wavePreviewBody');
// Portrait recommendation (issue #24 AC2): offered once per session when a battle
// is entered in the Compact portrait layout.
const portraitAdviceOverlay = $<HTMLElement>('portraitAdvice');
const portraitAdviceTitle = $<HTMLHeadingElement>('portraitAdviceTitle');
const portraitAdviceBody = $<HTMLParagraphElement>('portraitAdviceBody');
const portraitAdviceKeepBtn = $<HTMLButtonElement>('portraitAdviceKeep');
// Planning Pause overlay (issue #32 AC5): Resume / Settings / Restart / Exit.
const pauseOverlay = $<HTMLElement>('pauseOverlay');
const pauseWavePreview = $<HTMLElement>('pauseWavePreview');
const resumeBtn = $<HTMLButtonElement>('resumeBtn');
const settingsBtn = $<HTMLButtonElement>('settingsBtn');
const restartBtn = $<HTMLButtonElement>('restartBtn');
const exitBtn = $<HTMLButtonElement>('exitBtn');
const pauseSettings = $<HTMLElement>('pauseSettings');
const pauseLayoutBtn = $<HTMLButtonElement>('pauseLayoutBtn');
const pauseConfirm = $<HTMLElement>('pauseConfirm');
const pauseConfirmText = $<HTMLParagraphElement>('pauseConfirmText');
const pauseConfirmYes = $<HTMLButtonElement>('pauseConfirmYes');
const pauseConfirmNo = $<HTMLButtonElement>('pauseConfirmNo');

const hudElements: HudElements = {
  mana: manaValue,
  hearts: heartsValue,
  wave: waveValue,
  startBtn,
  outcomeTitle,
  outcomeStars,
  outcomeMessage,
  overlay,
};

// Detail-surface elements, hoisted once like hudElements so selectNode reuses
// them instead of re-querying the DOM on every node click.
const detailBackBtn = $<HTMLButtonElement>('detailBack');
const detailEnterBtn = $<HTMLButtonElement>('detailEnter');
const detailElements: DetailElements = {
  title: $<HTMLHeadingElement>('detailTitle'),
  blurb: $<HTMLParagraphElement>('detailBlurb'),
  meta: $<HTMLParagraphElement>('detailMeta'),
  rewards: $<HTMLParagraphElement>('detailRewards'),
  unlock: $<HTMLParagraphElement>('detailUnlock'),
  enterBtn: detailEnterBtn,
};

// --- Layout + level selection (author preview) ---------------------------
// The effective battle layout (issue #24 AC1). A forced `?layout=` override (or a
// press of the Layout button) wins; otherwise the viewport's aspect ratio decides
// — square-or-wider is the Preferred landscape layout, a taller viewport is the
// Compact portrait layout. Reflected on <body data-layout="..."> so CSS reflows
// and the browser journeys can observe it.
let layoutOverride: LayoutOverride = options.layout;

function effectiveLayoutNow(): LayoutMode {
  return effectiveLayout(layoutOverride, window.innerWidth, window.innerHeight);
}

function refreshLayout(): void {
  const effective = effectiveLayoutNow();
  document.body.dataset.layout = effective;
  // The force-classes drive the author preview's simulated phone/landscape frame.
  document.body.classList.toggle('force-portrait', layoutOverride === 'portrait');
  document.body.classList.toggle('force-landscape', layoutOverride === 'landscape');
  if (layoutBtn) {
    layoutBtn.textContent = `Layout: ${effective}`;
    layoutBtn.setAttribute(
      'aria-label',
      `Toggle battle layout. Landscape is preferred. Current: ${effective}.`,
    );
  }
}

/** Cycle the forced override between portrait and landscape (the Layout button). */
function cycleOverride(): LayoutOverride {
  return layoutOverride === 'portrait' ? 'landscape' : 'portrait';
}

function navigate(next: Partial<QueryOptions>): void {
  const params = new URLSearchParams(location.search);
  const merged = { ...options, ...next };
  params.set('level', merged.levelId);
  if (merged.preview) params.set('preview', '1'); else params.delete('preview');
  if (merged.layout !== 'auto') params.set('layout', merged.layout); else params.delete('layout');
  location.search = params.toString();
}

if (levelSelect) {
  for (const id of LEVEL_ORDER) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = COMPILED[id]?.name ?? id;
    if (id === options.levelId) opt.selected = true;
    levelSelect.appendChild(opt);
  }
  levelSelect.addEventListener('change', () => navigate({ levelId: levelSelect.value }));
}

if (layoutBtn) {
  layoutBtn.addEventListener('click', () => {
    layoutOverride = cycleOverride();
    refreshLayout();
  });
}

refreshLayout();
// A viewport resize re-derives the effective layout so the shell stays responsive
// in real time (window resize on desktop, rotation on a device — see the
// orientationchange handler below for the rotation pause).
window.addEventListener('resize', refreshLayout);

// --- Trail construction ---------------------------------------------------
let trailNodes: TrailNode[] = resolveTrail(manifest, META, progress);
let selectedId: string | null = null;
let nodeButtons: HTMLButtonElement[] = [];
let routeLine: SVGPolylineElement | null = null;
let lastFocusedNode: HTMLButtonElement | null = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  const els: TrailElements = { nodes: nodeButtons, route: routeMirror };
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

  renderDetail(node, detailElements);

  if (!detail.open) {
    if (typeof detail.showModal === 'function') detail.showModal();
    else detail.setAttribute('open', '');
  }
  // Focus the primary action for available levels, the dismiss action for locked.
  (node.enterable ? detailEnterBtn : detailBackBtn).focus();
}

function closeDetail(): void {
  if (detail.open) detail.close();
}

function trailKeydown(event: KeyboardEvent): void {
  // Spatial keyboard navigation between nodes, complementing Tab order.
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!forward && !backward) return;
  const current = nodeButtons.indexOf(document.activeElement as HTMLButtonElement);
  if (current === -1) return;
  event.preventDefault();
  const delta = forward ? 1 : -1;
  const next = (current + delta + nodeButtons.length) % nodeButtons.length;
  nodeButtons[next]!.focus();
}

detailBackBtn.addEventListener('click', closeDetail);
detailEnterBtn.addEventListener('click', () => {
  if (!selectedId) return;
  const node = trailNodes.find((n) => n.id === selectedId);
  if (!node || !node.enterable) return;
  // Enter leads into the pre-battle Loadout step (issue #21), not the battlefield
  // directly: the Guardian assembles a Loadout, then Starts Battle.
  openLoadout(selectedId);
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
/** Pending confirmed action from the Planning Pause overlay: 'restart' | 'exit'. */
let pendingPauseAction: 'restart' | 'exit' | null = null;
/** Tracks the pause-overlay open transition so Resume is focused once on open. */
let pauseMenuOpen = false;

// --- Loadout (issue #21) --------------------------------------------------
// The level being loaded out and the in-progress Loadout. The Loadout feeds the
// battle: its Defenders become the toolbar tools and its spells the armable
// availableSpells. Kept at module scope so the shell, the debug API, and the
// keyboard handlers share one source of truth.
let currentLoadoutCtx: LoadoutContext | null = null;
let currentLoadout: Loadout = emptyLoadout(0);

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

/**
 * Build the Defender toolbar from the Loadout's Defenders (issue #21): each
 * chosen Defender becomes a real, focusable placement tool, mirroring the spell
 * toolbar. Bound here (not at module load) because the set changes per battle.
 */
function buildDefenderToolbar(defenders: AvailableItem[]): void {
  if (!toolbar) return;
  toolbar.innerHTML = '';
  toolButtons = defenders.map((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool';
    btn.dataset.defender = item.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<span class="tool__name">${item.name}</span>` +
      `<span class="tool__cost">${item.cost} mana</span>`;
    btn.addEventListener('click', () => selectDefender(item.id));
    toolbar.append(btn);
    return btn;
  });
  toolbar.hidden = defenders.length === 0;
}

startBtn.addEventListener('click', () => {
  if (!battle || battle.phase !== 'planning') return;
  battle.start();
});

/**
 * Toggle Planning Pause (issue #32). Only a running battle can be paused. The
 * button text, pressed state, and overlay are reconciled from the snapshot each
 * frame in syncHud, so a backgrounding-driven pause keeps the UI in sync too
 * (AC5/AC6).
 */
function togglePause(next?: boolean): void {
  if (!battle || battle.phase !== 'running') return;
  battle.setPaused(next ?? !battle.paused);
}

pauseBtn.addEventListener('click', () => togglePause());

replayBtn.addEventListener('click', () => location.reload());

/** Undo the most recent placement / upgrade / removal within its 4-second window (issue #22 AC6, #30 AC5). */
function undoLastAction(): void {
  if (!battle) return;
  const result = battle.undoLastAction();
  if (result.ok) {
    showHint(
      result.kind === 'remove'
        ? `Restored defender — ${result.refund} mana re-spent`
        : `Undone — ${result.refund} mana refunded`,
    );
    // An upgrade/partial rollback on the inspected Defender refreshes its panel.
    if (inspectedRingId) syncContextPanel();
  } else {
    showHint(humanReason(result.reason));
  }
}

undoBtn.addEventListener('click', undoLastAction);

// Keyboard parity: the same Undo, spell-arm, and spell-cancel work with touch,
// mouse, pen, and keyboard (issue #22 AC6, #31 AC6).
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;
  if (e.key === 'Escape') {
    if (battle?.armedSpell) {
      e.preventDefault();
      cancelArmedSpell();
    } else if (inspectedRingId) {
      e.preventDefault();
      if (removeConfirming) {
        removeConfirming = false;
        syncContextPanel();
      } else {
        closeInspect();
      }
    }
    return;
  }
  if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
    if (!undoBtn.disabled) {
      e.preventDefault();
      undoLastAction();
    }
    return;
  }
  // 'p' is keyboard parity for the Pause control (issue #24 AC5): it toggles the
  // Planning Pause while a battle runs and no modal overlay owns the surface.
  if (e.key === 'p' || e.key === 'P') {
    if (portraitAdviceOverlay.hidden && battle && battle.phase === 'running') {
      e.preventDefault();
      togglePause();
    }
    return;
  }
  // Digit keys arm the Nth unlocked spell (1..9).
  if (/^[1-9]$/.test(e.key)) {
    const btn = spellButtons[Number(e.key) - 1];
    if (btn && !btn.disabled) {
      e.preventDefault();
      selectSpell(btn.dataset.spell!);
    }
  }
});

/** Commit a placement on an empty ring (issue #22); never inspects (issue #30). */
function commitPlacement(ringId: string, typeId?: string): void {
  if (!ringId || !battle) return;
  if (battle.phase !== 'planning' && battle.phase !== 'running') return;
  // typeId is the tool snapshotted at touch-down; committing it means a second
  // thumb flipping the selection can never buy the wrong defender (issue #22 AC5).
  const result = battle.placeDefender(ringId, typeId ?? battle.selectedDefenderType);
  if (result.ok) {
    const stats = getDefender(result.defender.typeId);
    showHint(`Planted ${stats?.name ?? 'defender'}`);
  } else {
    showHint(humanReason(result.reason));
  }
}

/**
 * Scene tap seam (issue #30 AC1): an occupied ring opens the modeless context
 * panel and RETAINS the selected placement tool; an empty ring places. The
 * decision is made here, at the shell, so the scene stays a pure renderer.
 */
function handleRingTap(ringId: string | null, typeId?: string): void {
  if (!ringId || !battle) return;
  const occupied = battle.defenders.some((d) => d.ringId === ringId && !d.dead);
  if (occupied) inspectRing(ringId);
  else commitPlacement(ringId, typeId);
}

// --- Modeless Defender context panel (issue #30) --------------------------
let inspectedRingId: string | null = null;
/** Inline-confirmation gate for removal (issue #30 AC4): Remove → Confirm. */
let removeConfirming = false;

function inspectRing(ringId: string): void {
  if (!battle) return;
  inspectedRingId = ringId;
  removeConfirming = false;
  game?.registry.set('inspected', ringId);
  syncContextPanel();
  contextPanel.hidden = false;
  cpUpgradeBtn.focus();
}

function closeInspect(): void {
  inspectedRingId = null;
  removeConfirming = false;
  game?.registry.set('inspected', null);
  contextPanel.hidden = true;
}

/** Re-project the inspected Defender onto the panel; closes it if the ring emptied. */
function syncContextPanel(): void {
  if (!battle || !inspectedRingId) {
    closeInspect();
    return;
  }
  const view = buildContextPanel(battle.inspect(inspectedRingId));
  if (!view) {
    closeInspect();
    return;
  }
  cpTitle.textContent = view.title;
  cpTier.textContent = view.tierLabel;
  cpStats.innerHTML = view.stats
    .map((s) => `<li><span class="cp__label">${s.label}</span><span class="cp__value">${s.value}</span></li>`)
    .join('');
  cpUpgradeSummary.textContent = view.upgrade.summary;
  cpUpgradeDetail.textContent = view.upgrade.detail ?? '';
  cpUpgradeDetail.hidden = !view.upgrade.detail;
  cpUpgradeBtn.textContent = view.upgrade.buttonLabel;
  cpUpgradeBtn.disabled = !view.upgrade.available;
  cpRemoveSummary.textContent = view.remove.summary;
  cpConfirmText.textContent = view.remove.confirm;
  cpConfirm.hidden = !removeConfirming;
  cpRemoveBtn.hidden = removeConfirming;
}

cpCloseBtn.addEventListener('click', closeInspect);

cpUpgradeBtn.addEventListener('click', () => {
  if (!battle || !inspectedRingId) return;
  const result = battle.upgradeDefender(inspectedRingId);
  if (result.ok) {
    showHint(`Upgraded to tier ${result.tier + 1} — ${result.cost} mana`);
    removeConfirming = false;
    syncContextPanel();
  } else {
    showHint(humanReason(result.reason));
  }
});

// Removal is a two-step, reversible action: the first tap arms an inline
// confirmation showing the exact refund; the second commits (issue #30 AC4).
cpRemoveBtn.addEventListener('click', () => {
  removeConfirming = true;
  syncContextPanel();
  cpConfirmBtn.focus();
});

cpConfirmBtn.addEventListener('click', () => {
  if (!battle || !inspectedRingId) return;
  const result = battle.removeDefender(inspectedRingId);
  if (result.ok) {
    showHint(`Removed — ${result.refund} mana refunded`);
    closeInspect();
  } else {
    removeConfirming = false;
    syncContextPanel();
    showHint(humanReason(result.reason));
  }
});

cpCancelBtn.addEventListener('click', () => {
  removeConfirming = false;
  syncContextPanel();
  cpRemoveBtn.focus();
});

// --- Guardian spells + Mana flowers (issue #31) -------------------------

/** Arm a spell for select-then-target casting (touch, mouse, pen, or keyboard). */
function selectSpell(typeId: string): void {
  if (!battle) return;
  const result = battle.armSpell(typeId);
  if (result.ok) {
    const name = getSpell(typeId)?.name ?? 'Spell';
    showHint(`Tap the battlefield to cast ${name}. Press Esc to cancel.`);
  } else {
    showHint(humanReason(result.reason));
  }
}

/** Explicitly leave spell targeting and restore the previously Selected Defender. */
function cancelArmedSpell(): void {
  if (!battle || battle.armedSpell === null) return;
  battle.cancelSpell();
  showHint('Spell canceled');
}

function handleSpellCast(x: number, y: number, typeId?: string): void {
  if (!battle) return;
  // The domain re-validates and spends nothing on a miss; a success restores the
  // prior Defender selection, so casting never loses the placement tool (AC2/AC3).
  const result = battle.castSpell(x, y, typeId ?? battle.armedSpell);
  if (result.ok) {
    const name = getSpell(typeId ?? '')?.name ?? 'Spell';
    showHint(`Cast ${name}`);
  } else {
    showHint(humanReason(result.reason));
  }
}

function handleCollectFlower(flowerId: string): void {
  if (!battle) return;
  const result = battle.collectManaFlower(flowerId);
  if (result.ok) showHint(`Collected +${result.mana} mana`);
}

// --- Wave preview + Planning Pause (issue #32) ----------------------------

/** One wave's view rendered to HTML lines (counts, traits, routes, boss, countdown). */
function wavePreviewHTML(w: WavePreviewWaveView | null, upcoming: boolean): string {
  if (!w) return '';
  const cls = upcoming ? 'wave-preview__wave wave-preview__wave--upcoming' : 'wave-preview__wave';
  const lines: string[] = [
    `<div class="${cls}">`,
    `<div class="wave-preview__heading">${upcoming ? 'Next: ' : ''}${w.heading}</div>`,
    `<div class="wave-preview__count">${w.count}</div>`,
    ...w.groups.map((g) => `<div class="wave-preview__group">${g}</div>`),
  ];
  if (w.traits.length) lines.push(`<div class="wave-preview__traits">traits: ${w.traits.join(', ')}</div>`);
  lines.push(`<div class="wave-preview__routes">${w.routes}</div>`);
  if (w.boss) lines.push(`<div class="wave-preview__boss">${w.boss}</div>`);
  if (w.countdown) lines.push(`<div class="wave-preview__countdown">${w.countdown}</div>`);
  lines.push('</div>');
  return lines.join('');
}

/** Render the current + upcoming wave into both the planning panel and the pause overlay. */
function renderWavePreview(snap: BattleSnapshot): void {
  const view = buildWavePreviewView(snap.wavePreview);
  const html = wavePreviewHTML(view.current, false) + wavePreviewHTML(view.upcoming, true);
  if (wavePreviewBody) wavePreviewBody.innerHTML = html;
  if (pauseWavePreview) pauseWavePreview.innerHTML = html;
}

resumeBtn.addEventListener('click', () => togglePause(false));

settingsBtn.addEventListener('click', () => {
  pauseSettings.hidden = !pauseSettings.hidden;
});

// The pause Settings surface mirrors the HUD layout toggle (the app's one real
// setting) so the Guardian can reflow while planning.
pauseLayoutBtn.addEventListener('click', () => {
  layoutOverride = cycleOverride();
  refreshLayout();
});

restartBtn.addEventListener('click', () =>
  armPauseConfirm('restart', 'Restart this level? Your current run will be lost.'),
);

exitBtn.addEventListener('click', () =>
  armPauseConfirm('exit', 'Leave the battle and return to the campaign trail?'),
);

pauseConfirmYes.addEventListener('click', () => {
  const action = pendingPauseAction;
  pendingPauseAction = null;
  pauseConfirm.hidden = true;
  if (action === 'restart' && currentLevelId) enterLevel(currentLevelId, currentLoadout);
  else if (action === 'exit') returnToTrail();
});

pauseConfirmNo.addEventListener('click', () => {
  pendingPauseAction = null;
  pauseConfirm.hidden = true;
});

// Backgrounding enters a safe paused state and combat never resumes without an
// explicit Resume (issue #32 AC6): hiding the tab pauses a running battle, and
// nothing auto-unpauses it on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && battle && battle.phase === 'running' && !battle.paused) {
    battle.setPaused(true);
  }
});

// Rotation (issue #24 AC3): a device rotation freezes the simulation so the
// battlefield never advances mid-turn, and the Phaser scene independently clears
// every in-flight gesture on orientationchange (spending nothing). Combat resumes
// only through explicit Resume — rotation, like backgrounding, never auto-resumes.
window.addEventListener('orientationchange', () => {
  if (battle && battle.phase === 'running' && !battle.paused) {
    battle.setPaused(true);
  }
});

// --- Portrait recommendation (issue #24 AC2) ----------------------------
// Offered once per session when a battle is entered in the Compact portrait
// layout. The visible view (title/body/action) comes from the responsive
// projector so the wording stays in one testable place; the session-once gate is
// shell state.
let portraitAdviceShown = false;

function showPortraitAdvice(): void {
  const view = portraitAdvice();
  portraitAdviceTitle.textContent = view.title;
  portraitAdviceBody.textContent = view.body;
  portraitAdviceKeepBtn.textContent = view.keepAction;
  portraitAdviceOverlay.hidden = false;
  portraitAdviceShown = true;
  portraitAdviceKeepBtn.focus();
}

function dismissPortraitAdvice(): void {
  portraitAdviceOverlay.hidden = true;
  pauseBtn.focus();
}

portraitAdviceKeepBtn.addEventListener('click', dismissPortraitAdvice);

/** Build the spell toolbar for a level's unlocked spells (aria-pressed/state sync
 * in syncHud). Each button is a real, focusable control reachable from keyboard. */
function buildSpellToolbar(spells: string[]): void {
  if (!spellbar) return;
  spellbar.innerHTML = '';
  spellButtons = spells.map((id) => {
    const stats = getSpell(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spell';
    btn.dataset.spell = id;
    btn.disabled = true;
    btn.innerHTML = `<span class="spell__name">${stats?.name ?? id}</span>` +
      `<span class="spell__cost">${stats?.cost ?? 0} mana</span>` +
      `<span class="spell__state"></span>`;
    btn.addEventListener('click', () => selectSpell(id));
    spellbar.append(btn);
    return btn;
  });
  spellbar.hidden = spells.length === 0;
}

/** Arm the Planning Pause overlay's confirmation for a destructive action (Restart/Exit). */
function armPauseConfirm(action: 'restart' | 'exit', message: string): void {
  pendingPauseAction = action;
  pauseConfirmText.textContent = message;
  pauseConfirm.hidden = false;
  pauseConfirmYes.focus();
}

/** Reset the confirm/settings state of the Planning Pause overlay. */
function closePauseMenu(): void {
  pendingPauseAction = null;
  pauseMenuOpen = false;
  pauseConfirm.hidden = true;
  pauseSettings.hidden = true;
}

function resetBattleHud(): void {
  lastSync = '';
  outcomeRecorded = false;
  overlay.hidden = true;
  startBtn.textContent = 'Start Wave';
  startBtn.disabled = false;
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.textContent = 'Pause';
  pauseOverlay.hidden = true;
  closePauseMenu();
  hint.textContent = '';
  closeInspect();
  // Default to the Loadout's first Defender so the placement tool the scene
  // snapshots is always one the Guardian actually brought (issue #21).
  const firstDefender = currentLoadout.find(
    (slot): slot is AvailableItem => slot !== null && slot.kind === 'defender',
  );
  if (firstDefender) selectDefender(firstDefender.id);
}

function recordOutcome(snap: BattleSnapshot): void {
  if (!currentLevelId || !battle || outcomeRecorded) return;
  if (snap.phase !== 'won' && snap.phase !== 'lost') return;
  outcomeRecorded = true;
  // The engine-independent seam: score the battle and fold it into progress. A
  // loss advances nothing; a victory clears the level, preserving the best star
  // result across replays (issue #29 AC1/AC3).
  progress = recordResult(progress, currentLevelId, battle.resultInput());
  saveProgress(progress);
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
        const status = s.inBand ? 'in band' : 'OUT OF BAND';
        const verdict = s.band ? `${s.band}: ${status}` : 'no band';
        return `<li>${s.bot} — ${s.won ? 'win' : 'loss'} (${s.hearts}♥) <span class="preview__band">${verdict}</span></li>`;
      })
      .join('');
    rows.push(`<ul class="preview__sims">${sims}</ul>`);
  }
  previewPanel.innerHTML = rows.join('');
  previewPanel.hidden = false;
}

function syncHud(snap: BattleSnapshot): void {
  recordOutcome(snap);
  // The Undo button reflects the undo window every frame, independent of the
  // coarser HUD sync key, so it lights up the instant a placement is refundable.
  undoBtn.disabled = !snap.canUndo;
  // Spell cooldown/affordability and the armed-spell highlight update every frame
  // too, so a spell lights up the instant it becomes selectable (issue #31 AC4).
  reconcileSpellToolbar(snap);

  // The modeless panel follows its inspected Defender live, and dismisses once
  // the battle resolves (issue #30 AC2).
  if (inspectedRingId) {
    if (snap.phase === 'won' || snap.phase === 'lost') closeInspect();
    else syncContextPanel();
  }

  const key = `${snap.phase}|${snap.mana}|${snap.hearts}|${snap.waveNumber}|${snap.paused}`;
  if (key === lastSync) {
    if (hintTimer > 0) hintTimer -= 1 / 60;
    return;
  }
  lastSync = key;
  renderHud(snap, hudElements);

  // Planning Pause (issue #32): the button, the overlay, and the wave preview all
  // reflect the snapshot, so a backgrounding-driven pause (not a button click) is
  // surfaced too. Combat resumes only through Resume (AC5/AC6).
  pauseBtn.setAttribute('aria-pressed', String(snap.paused));
  pauseBtn.textContent = snap.paused ? 'Resume' : 'Pause';
  const showPauseMenu = snap.paused && snap.phase === 'running';
  pauseOverlay.hidden = !showPauseMenu;
  if (!showPauseMenu) {
    closePauseMenu();
  } else if (!pauseMenuOpen) {
    // Focus Resume once when the menu opens (not every frame).
    pauseMenuOpen = true;
    resumeBtn.focus();
  }
  // Wave preview: a corner panel while planning (pre-Start); the pause overlay
  // carries its own copy for mid-battle planning (AC1).
  const showWavePreview = snap.phase === 'planning' && !snap.paused;
  wavePreviewPanel.hidden = !showWavePreview;
  renderWavePreview(snap);
}

/** Project spell availability + armed state onto the toolbar each frame, and keep
 * the Defender tools' pressed state consistent while a spell is armed. */
function reconcileSpellToolbar(snap: BattleSnapshot): void {
  for (const btn of spellButtons) {
    const id = btn.dataset.spell;
    if (!id) continue;
    const s = snap.spells.find((sp) => sp.id === id);
    if (!s) {
      btn.disabled = true;
      continue;
    }
    btn.disabled = !s.available;
    btn.setAttribute('aria-pressed', String(snap.armedSpell === id));
    const text = spellStateText(s);
    const state = btn.querySelector('.spell__state');
    if (state) state.textContent = text;
    btn.setAttribute('aria-label', `${s.name}, ${s.cost} mana, ${text}`);
  }
  // While a spell is armed, no Defender tool reads as pressed (targeting owns the
  // battlefield); otherwise the active Defender selection is pressed.
  for (const btn of toolButtons) {
    const pressed = snap.armedSpell === null && btn.dataset.defender === snap.selectedDefenderType;
    btn.setAttribute('aria-pressed', String(pressed));
  }
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
  game.registry.set('battleApi', {
    battle,
    onRingClick: handleRingTap,
    onSpellCast: handleSpellCast,
    onCollectFlower: handleCollectFlower,
  });
  game.registry.set('timeScale', options.timeScale);
  game.registry.set('onFrame', syncHud);
  // Author overlays: the scene tints rings by role when preview is on, and the
  // DOM legend renders the metrics/simulation summary.
  game.registry.set('preview', options.preview);
  if (summary) game.registry.set('summary', summary);
}

// --- Loadout assembly (issue #21) ----------------------------------------
// The map-to-Loadout-to-battle journey: the Trail detail's Enter action opens
// this screen, where the Guardian fills capacity slots from the immediately
// available pool. Start Battle mounts the battlefield with the chosen Loadout.

function buildLoadoutContext(levelId: string): LoadoutContext {
  return {
    levelOrder: LEVEL_ORDER.indexOf(levelId) + 1,
    availableIds: cumulativeUnlocks(levelId),
    catalog: { defenders: DEFENDERS, spells: SPELLS },
  };
}

/** Open the Loadout screen for a level, pre-filled with the valid starter. */
function openLoadout(levelId: string): void {
  const level = COMPILED[levelId];
  if (!level) return;
  currentLevelId = levelId;
  currentLoadoutCtx = buildLoadoutContext(levelId);
  currentLoadout = starterLoadout(currentLoadoutCtx);
  loadoutTitle.textContent = `Loadout — ${level.name}`;
  closeDetail();
  trailScreen.hidden = true;
  battleRoot.hidden = true;
  loadoutScreen.hidden = false;
  renderLoadout();
  // Wire the debug seam now so the Loadout journey is observable before battle.
  window.fr = makeDebugApi();
  loadoutStartBtn.focus();
}

/** Re-project the in-progress Loadout onto the pool, slots, advice, and Start gate. */
function renderLoadout(): void {
  if (!currentLoadoutCtx) return;
  const view = buildLoadoutView(currentLoadout, currentLoadoutCtx);

  // Pool chooser buttons: tap to toggle an item in/out of the Loadout.
  loadoutPool.innerHTML = '';
  for (const item of view.pool) {
    const slotted = currentLoadout.some(
      (slot) => slot !== null && slot.kind === item.kind && slot.id === item.id,
    );
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loadout__pool-item';
    btn.dataset.kind = item.kind;
    btn.dataset.id = item.id;
    btn.setAttribute('aria-pressed', String(slotted));
    btn.innerHTML =
      `<span class="loadout__pool-name">${item.name}</span>` +
      `<span class="loadout__pool-kind">${item.kind === 'defender' ? 'Defender' : 'Spell'} · ${item.cost} mana</span>`;
    btn.addEventListener('click', () => togglePoolItem(item));
    loadoutPool.append(btn);
  }
  loadoutPool.hidden = view.pool.length === 0;

  // Slots: tap a filled slot to clear it.
  loadoutSlots.innerHTML = '';
  loadoutSlots.style.setProperty('--slots', String(view.capacity));
  for (const slot of view.slots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loadout__slot' + (slot.filled ? ' loadout__slot--filled' : '');
    btn.dataset.index = String(slot.index);
    btn.setAttribute('aria-label', slot.label);
    btn.textContent = slot.label;
    if (slot.filled) btn.addEventListener('click', () => clearLoadoutSlot(slot.index));
    loadoutSlots.append(btn);
  }

  // Advice: the recommendation plus any non-blocking suitability warnings.
  const lines: string[] = [];
  if (view.advice.recommendation) lines.push(view.advice.recommendation);
  for (const warning of view.advice.warnings) lines.push(warning);
  loadoutAdviceEl.innerHTML = lines.length
    ? lines.map((line) => `<p class="loadout__advice-line">${line}</p>`).join('')
    : '';
  loadoutAdviceEl.hidden = lines.length === 0;

  // Start gate (AC4): disabled only while every slot is empty.
  loadoutStartBtn.disabled = !view.canStart;
  loadoutStartBtn.setAttribute('aria-disabled', String(!view.canStart));
}

/** Toggle a pool item: clear it if already slotted, otherwise fill the next slot. */
function togglePoolItem(item: AvailableItem): void {
  const idx = currentLoadout.findIndex(
    (slot) => slot !== null && slot.kind === item.kind && slot.id === item.id,
  );
  currentLoadout = idx >= 0 ? clearSlot(currentLoadout, idx) : addToLoadout(currentLoadout, item);
  renderLoadout();
}

function clearLoadoutSlot(index: number): void {
  currentLoadout = clearSlot(currentLoadout, index);
  renderLoadout();
}

/** Commit the Loadout and mount the battlefield with it. */
function startBattle(): void {
  if (!currentLevelId || !canStart(currentLoadout)) return;
  enterLevel(currentLevelId, currentLoadout);
}

loadoutStartBtn.addEventListener('click', startBattle);
loadoutBackBtn.addEventListener('click', () => {
  loadoutScreen.hidden = true;
  trailScreen.hidden = false;
  currentLoadoutCtx = null;
  currentLoadout = emptyLoadout(0);
  currentLevelId = null;
  const current = trailNodes.find((n) => n.status === 'current') ?? trailNodes[0];
  if (current) nodeButtons.find((b) => b.dataset.level === current.id)?.focus();
});

/**
 * Mount the battlefield for a level with a chosen Loadout (issue #21). The
 * Loadout's Defenders become the placement toolbar and its spells the armable
 * availableSpells, so the battle is fought only with what the Guardian brought.
 */
function enterLevel(levelId: string, loadout: Loadout): void {
  const level = COMPILED[levelId];
  if (!level) return;
  currentLevelId = levelId;
  currentLoadout = loadout;

  // Fresh battle for this level. Destroy any prior Phaser game so the scene
  // recompiles terrain for the new trail/rings.
  if (game) {
    game.destroy(true);
    game = null;
  }
  const defenders = loadout.filter(
    (slot): slot is AvailableItem => slot !== null && slot.kind === 'defender',
  );
  const spells = loadout
    .filter((slot): slot is AvailableItem => slot !== null && slot.kind === 'spell')
    .map((slot) => slot.id);
  battle = new BattleState({
    level,
    startingMana: options.god ? 9999 : level.startingMana,
    availableSpells: spells,
    manaFlowerIntervalSec: MANA_FLOWER_INTERVAL_SEC,
  });

  levelName.textContent = level.name;
  buildDefenderToolbar(defenders);
  buildSpellToolbar(spells);
  resetBattleHud();

  trailScreen.hidden = true;
  loadoutScreen.hidden = true;
  battleRoot.hidden = false;
  bootBattleScene();
  if (options.preview) renderPreviewLegend();
  window.fr = makeDebugApi();
  // Offer the once-per-session portrait recommendation when entering in portrait
  // (issue #24 AC2). After the first dismissal it never shows again this session.
  if (shouldShowPortraitAdvice(effectiveLayoutNow(), portraitAdviceShown)) {
    showPortraitAdvice();
  }
}

function returnToTrail(): void {
  if (game) {
    game.destroy(true);
    game = null;
  }
  battle = null;
  currentLevelId = null;
  currentLoadoutCtx = null;
  currentLoadout = emptyLoadout(0);
  closeDetail();
  battleRoot.hidden = true;
  loadoutScreen.hidden = true;
  trailScreen.hidden = false;
  refreshTrail();
  // Land focus on the current level so the next step is obvious.
  const current = trailNodes.find((n) => n.status === 'current') ?? trailNodes[0];
  if (current) nodeButtons.find((b) => b.dataset.level === current.id)?.focus();
}

// Play Again rebuilds the same level in place with the same Loadout so the best
// star result is kept (a worse replay can never lower it). Return to Trail
// returns to the campaign map, where the freshly unlocked next level is now
// enterable (issue #29 AC4).
replayBtn.addEventListener('click', () => {
  if (currentLevelId) enterLevel(currentLevelId, currentLoadout);
});
returnToTrailBtn.addEventListener('click', returnToTrail);

// Debug/test seam. Ring taps on a FIT-scaled canvas are coordinate-fragile, so
// this exposes the exact same placement/start handlers the pointer path uses,
// letting E2E drive a deterministic launch-to-outcome journey after entering a
// level from the Trail. The domain and HUD still do all the real work. The
// Loadout readers/editors are wired before the battle mounts too, so the
// map→Loadout→battle journey is observable end to end (issue #21 AC6).
function makeDebugApi(): ForestRescueDebug {
  return {
    placeOnRing: (ringId: string) => commitPlacement(ringId),
    inspectRing: (ringId: string) => inspectRing(ringId),
    upgradeRing: (ringId: string) => battle?.upgradeDefender(ringId) ?? null,
    removeRing: (ringId: string) => battle?.removeDefender(ringId) ?? null,
    selectDefender,
    selectSpell,
    castSpell: (x: number, y: number, typeId?: string) => handleSpellCast(x, y, typeId),
    collectFlower: (id: string) => handleCollectFlower(id),
    start: () => battle?.start(),
    pause: () => togglePause(true),
    resume: () => togglePause(false),
    wavePreview: () => (battle ? battle.wavePreview() : null),
    ringIds: () => (battle ? battle.rings.map((r) => r.id) : []),
    spellIds: () => (battle ? battle.snapshot().spells.map((s) => s.id) : []),
    flowerIds: () => (battle ? battle.manaFlowers.map((f) => f.id) : []),
    // --- Loadout seam (issue #21) ---
    loadoutCapacity: () => (currentLoadoutCtx ? loadoutCapacity(currentLoadoutCtx.levelOrder) : 0),
    loadoutPool: () =>
      currentLoadoutCtx
        ? buildPool(currentLoadoutCtx).map(({ kind, id, name }) => ({ kind, id, name }))
        : [],
    loadoutSlots: () => currentLoadout.map((slot) => (slot ? { kind: slot.kind, id: slot.id } : null)),
    loadoutCanStart: () => canStart(currentLoadout),
    loadoutAdvice: () =>
      currentLoadoutCtx
        ? loadoutAdvice(currentLoadout, currentLoadoutCtx)
        : { recommendation: null, warnings: [] },
    loadoutFill: (id: string) => {
      if (!currentLoadoutCtx) return;
      const item = buildPool(currentLoadoutCtx).find((p) => p.id === id);
      if (item) togglePoolItem(item);
    },
    loadoutClear: (index: number) => clearLoadoutSlot(index),
    loadoutStart: () => startBattle(),
  };
}

export interface LoadoutDebugItem {
  kind: 'defender' | 'spell';
  id: string;
  name: string;
}

export interface LoadoutDebugSlot {
  kind: 'defender' | 'spell';
  id: string;
}

export interface ForestRescueDebug {
  placeOnRing(ringId: string): void;
  inspectRing(ringId: string): void;
  upgradeRing(ringId: string): { ok: true; cost: number; tier: number } | { ok: false; reason: string } | null;
  removeRing(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } | null;
  selectDefender(typeId: string): void;
  selectSpell(typeId: string): void;
  castSpell(x: number, y: number, typeId?: string): void;
  collectFlower(id: string): void;
  start(): void;
  pause(): void;
  resume(): void;
  wavePreview(): WavePreview | null;
  ringIds(): string[];
  spellIds(): string[];
  flowerIds(): string[];
  // --- Loadout seam (issue #21) ---
  loadoutCapacity(): number;
  loadoutPool(): LoadoutDebugItem[];
  loadoutSlots(): (LoadoutDebugSlot | null)[];
  loadoutCanStart(): boolean;
  loadoutAdvice(): { recommendation: string | null; warnings: string[] };
  loadoutFill(id: string): void;
  loadoutClear(index: number): void;
  loadoutStart(): void;
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

// Author preview: `?level=<id>` opens that level's Loadout step (with optional
// phone layout + simulation overlay) instead of starting on the Trail. The
// Loadout is the universal pre-battle step, so every entry goes through it.
const bootParams = new URLSearchParams(location.search);
if (bootParams.has('level')) {
  openLoadout(options.levelId);
}
