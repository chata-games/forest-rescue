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
import type { BattleSnapshot } from './domain/battle';
import { getDefender, getSpell } from './domain/content';
import { BattleScene } from './phaser/battle-scene';
import { buildContextPanel, humanReason, renderHud, spellStateText, type HudElements } from './hud';
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
 * Spells the Guardian may cast in a level: every spell unlocked by this level
 * or an earlier one in campaign order (cumulative, so unlocked spells stay
 * usable). Drives both the spell toolbar and the BattleState's availableSpells.
 */
function cumulativeSpells(levelId: string): string[] {
  const idx = LEVEL_ORDER.indexOf(levelId);
  const spells: string[] = [];
  for (let i = 0; i <= idx; i++) {
    const unlock = META[LEVEL_ORDER[i] ?? '']?.spellUnlock ?? null;
    if (unlock && !spells.includes(unlock)) spells.push(unlock);
  }
  return spells;
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

const levelName = $<HTMLElement>('levelName');
const manaValue = $<HTMLSpanElement>('manaValue');
const heartsValue = $<HTMLSpanElement>('heartsValue');
const waveValue = $<HTMLSpanElement>('waveValue');
const pauseBtn = $<HTMLButtonElement>('pauseBtn');
const startBtn = $<HTMLButtonElement>('startBtn');
const replayBtn = $<HTMLButtonElement>('replayBtn');
const returnToTrailBtn = $<HTMLButtonElement>('returnToTrailBtn');
const undoBtn = $<HTMLButtonElement>('undoBtn');
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tool'));
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
    applyLayout(currentLayout() === 'portrait' ? 'landscape' : 'portrait');
  });
}

applyLayout(options.layout);

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

function resetBattleHud(): void {
  lastSync = '';
  outcomeRecorded = false;
  overlay.hidden = true;
  startBtn.textContent = 'Start Wave';
  startBtn.disabled = false;
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.textContent = 'Pause';
  hint.textContent = '';
  closeInspect();
  selectDefender('sprig-sentinel');
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
    const state = btn.querySelector('.spell__state');
    if (state) state.textContent = spellStateText(s);
    btn.setAttribute('aria-label', `${s.name}, ${s.cost} mana, ${spellStateText(s)}`);
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
  const spells = cumulativeSpells(levelId);
  battle = new BattleState({
    level,
    startingMana: options.god ? 9999 : level.startingMana,
    availableSpells: spells,
    manaFlowerIntervalSec: MANA_FLOWER_INTERVAL_SEC,
  });

  levelName.textContent = level.name;
  buildSpellToolbar(spells);
  resetBattleHud();

  trailScreen.hidden = true;
  battleRoot.hidden = false;
  bootBattleScene();
  if (options.preview) renderPreviewLegend();
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

// Play Again rebuilds the same level in place so the best star result is kept
// (a worse replay can never lower it). Return to Trail returns to the campaign
// map, where the freshly unlocked next level is now enterable (issue #29 AC4).
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
    placeOnRing: (ringId: string) => commitPlacement(ringId),
    inspectRing: (ringId: string) => inspectRing(ringId),
    upgradeRing: (ringId: string) => battle?.upgradeDefender(ringId) ?? null,
    removeRing: (ringId: string) => battle?.removeDefender(ringId) ?? null,
    selectDefender,
    selectSpell,
    castSpell: (x: number, y: number, typeId?: string) => handleSpellCast(x, y, typeId),
    collectFlower: (id: string) => handleCollectFlower(id),
    start: () => battle?.start(),
    ringIds: () => (battle ? battle.rings.map((r) => r.id) : []),
    spellIds: () => (battle ? battle.snapshot().spells.map((s) => s.id) : []),
    flowerIds: () => (battle ? battle.manaFlowers.map((f) => f.id) : []),
  };
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
  ringIds(): string[];
  spellIds(): string[];
  flowerIds(): string[];
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

// Author preview: `?level=<id>` drops straight into that level (with optional
// phone layout + simulation overlay) instead of starting on the Trail.
const bootParams = new URLSearchParams(location.search);
if (bootParams.has('level')) {
  enterLevel(options.levelId);
}
