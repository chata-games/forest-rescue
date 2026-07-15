// Pure HUD rendering for the semantic DOM shell. Kept free of Phaser and DOM
// globals so it can be unit-tested with plain stub elements: it is the exact
// transformation the browser applies to each BattleState snapshot.

import type {
  BattleSnapshot,
  DefenderInspection,
  SpellAvailability,
  StatChanges,
  WavePreview,
  WavePreviewEntry,
} from './domain/battle';

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
    case 'no-defender':
      return 'No defender there';
    case 'max-tier':
      return 'Already at max tier';
    case 'nothing-to-undo':
      return 'Nothing to undo';
    case 'undo-expired':
      return 'Undo window expired';
    case 'spell-cooldown':
      return 'Spell on cooldown';
    case 'paused':
      return 'Not while paused';
    case 'spell-locked':
      return 'Spell not unlocked';
    case 'unknown-spell':
      return 'Unknown spell';
    case 'no-spell-armed':
      return 'No spell selected';
    case 'invalid-target':
      return 'Cannot cast there';
    case 'already-collected':
      return 'Already collected';
    case 'overlaps-ring':
      return 'Too close to a fairy ring';
    case 'overlaps-flower':
      return 'Too close to another flower';
    case 'out-of-bounds':
      return 'Outside the battlefield';
    default:
      return 'Cannot place there';
  }
}

/**
 * Visible, textual state for one spell so the toolbar can show — and a screen
 * reader can hear — why an unavailable spell cannot be selected (issue #31 AC4).
 * Cooldown is rounded up so the Guardian never sees "0s" on a still-locking spell.
 */
export function spellStateText(spell: SpellAvailability): string {
  // Planning Pause locks every spell (issue #32 AC4): surface that before the
  // cooldown/affordability states so the toolbar explains why it is unavailable.
  if (spell.reason === 'paused') return 'Paused';
  if (!spell.ready) return `Cooldown ${Math.ceil(spell.cooldownRemaining)}s`;
  if (!spell.affordable) return `Needs ${spell.cost} mana`;
  return 'Ready';
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

// --- Modeless Defender context panel (issue #30) --------------------------
// A pure projector: turns a DefenderInspection into the exact strings the DOM
// panel renders (title, decisive stats, upgrade preview, removal refund). Kept
// free of the DOM so it is unit-tested directly, like renderHud.

export interface StatLine {
  label: string;
  value: string;
}

export interface ContextPanelUpgradeView {
  /** Headline line, e.g. "Upgrade to Tier 2 — 80 mana" or "Max tier reached". */
  summary: string;
  /** Stat deltas or the unavailable reason, or null when there is nothing to add. */
  detail: string | null;
  buttonLabel: string;
  /** False disables the commit button (unavailable / maxed). */
  available: boolean;
}

export interface ContextPanelView {
  title: string;
  tierLabel: string;
  stats: StatLine[];
  upgrade: ContextPanelUpgradeView;
  remove: { summary: string; confirm: string };
}

const STAT_LABELS: { key: keyof StatChanges; label: string }[] = [
  { key: 'damage', label: 'Damage' },
  { key: 'range', label: 'Range' },
  { key: 'hp', label: 'Health' },
  { key: 'cooldown', label: 'Reload' },
];

/** Human-readable before→after for one stat delta (cooldown rendered as seconds). */
function changeLine(label: string, key: keyof StatChanges, from: number, to: number): string {
  if (key === 'cooldown') return `${label} ${from}s → ${to}s`;
  return `${label} ${from} → ${to}`;
}

/** "Damage 35 → 55, Range 160 → 175" — only changed stats, in a stable order. */
function describeChanges(changes: StatChanges): string {
  const parts: string[] = [];
  for (const { key, label } of STAT_LABELS) {
    const c = changes[key];
    if (c) parts.push(changeLine(label, key, c.from, c.to));
  }
  return parts.join(', ');
}

/** The decisive stat lines for an inspected Defender, by role. */
function statLines(info: DefenderInspection): StatLine[] {
  if (info.blocksPath) {
    const lines: StatLine[] = [{ label: 'Health', value: `${info.hp}/${info.maxHp}` }];
    if (info.poisonDps > 0) lines.push({ label: 'Thorns', value: `${info.poisonDps}/s` });
    lines.push({ label: 'Role', value: 'Blocks the path' });
    return lines;
  }
  const lines: StatLine[] = [
    { label: 'Damage', value: String(info.damage) },
    { label: 'Range', value: String(info.range) },
    { label: 'Fire rate', value: `${(1 / info.cooldown).toFixed(1)}/s` },
    { label: 'Health', value: `${info.hp}/${info.maxHp}` },
  ];
  return lines;
}

function upgradeView(info: DefenderInspection): ContextPanelUpgradeView {
  const up = info.upgrade;
  if (!up) {
    return { summary: 'Max tier reached', detail: null, buttonLabel: 'Maxed', available: false };
  }
  const summary = `Upgrade to tier ${up.nextTier + 1} — ${up.cost} mana`;
  const detail = up.reason
    ? humanReason(up.reason)
    : describeChanges(up.statChanges) || null;
  return {
    summary,
    detail,
    buttonLabel: up.available ? `Upgrade (${up.cost})` : 'Upgrade',
    available: up.available,
  };
}

/**
 * Project a DefenderInspection into the modeless context-panel view (issue #30
 * AC1–AC4). Returns null when there is no Defender to inspect, so the caller
 * hides the panel.
 */
export function buildContextPanel(info: DefenderInspection | null): ContextPanelView | null {
  if (!info) return null;
  const totalTiers = info.maxTier + 1;
  return {
    title: info.name,
    tierLabel: `Tier ${info.tier + 1} of ${totalTiers}`,
    stats: statLines(info),
    upgrade: upgradeView(info),
    remove: {
      summary: `Remove — ${info.removalRefund} mana refunded (70%)`,
      confirm: `Remove this Defender? ${info.removalRefund} mana will be refunded.`,
    },
  };
}

// --- Wave preview (issue #32 AC1) -----------------------------------------
// A pure projector: turns the BattleState's WavePreview into the exact strings
// the DOM panel renders (wave heading, foe counts, traits, routes, boss warning,
// countdown). Free of the DOM so it is unit-tested directly, like buildContextPanel.

export interface WavePreviewWaveView {
  /** "Wave 3" heading. */
  heading: string;
  /** "6 foes" total. */
  count: string;
  /** One summary line per enemy group, e.g. "3× Logger". */
  groups: string[];
  /** Trait tags flattened across groups, de-duplicated, e.g. ["ground","flying"]. */
  traits: string[];
  /** "Route: main" or "Routes: main, secondary". */
  routes: string;
  /** Boss warning line, or null when the wave carries no boss. */
  boss: string | null;
  /** "Starts in 8s" while the wave is still upcoming, or null once it has begun. */
  countdown: string | null;
}

export interface WavePreviewView {
  current: WavePreviewWaveView | null;
  upcoming: WavePreviewWaveView | null;
}

/** "Starts in 8s" — rounded up so the Guardian never sees "0s" on an imminent wave. */
function waveCountdownText(countdown: number): string | null {
  if (countdown <= 0) return null;
  return `Starts in ${Math.ceil(countdown)}s`;
}

/** Project one wave entry into the DOM view. */
function waveView(entry: WavePreviewEntry): WavePreviewWaveView {
  const traits: string[] = [];
  for (const group of entry.groups) {
    for (const tag of group.traits) {
      if (!traits.includes(tag)) traits.push(tag);
    }
  }
  const routes = entry.routeIds.length > 1
    ? `Routes: ${entry.routeIds.join(', ')}`
    : `Route: ${entry.routeIds[0] ?? 'main'}`;
  return {
    heading: `Wave ${entry.wave}`,
    count: `${entry.total} foe${entry.total === 1 ? '' : 's'}`,
    groups: entry.groups.map((g) => `${g.count}× ${g.name}`),
    traits,
    routes,
    boss: entry.boss ? '⚠ Boss wave' : null,
    countdown: waveCountdownText(entry.countdown),
  };
}

/**
 * Project the BattleState's WavePreview into the panel view (issue #32 AC1).
 * Empty entries (null) are preserved so the caller can hide a missing section.
 */
export function buildWavePreviewView(preview: WavePreview): WavePreviewView {
  return {
    current: preview.current ? waveView(preview.current) : null,
    upcoming: preview.upcoming ? waveView(preview.upcoming) : null,
  };
}
