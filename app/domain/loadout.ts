// Engine-independent Loadout rules (issue #21).
//
// Before a battle, the Guardian assembles a Loadout — a limited set of slots,
// each holding either one unlocked Defender or one unlocked Guardian spell —
// drawn from the items immediately available at this point in the campaign.
// Start is gated on a non-empty Loadout; recommendations and warnings stay
// advisory. Nothing here depends on Phaser, the DOM, or any renderer: it is the
// observable boundary the pre-battle shell and its tests drive, mirroring the
// BattleState and campaign contracts.
//
// "Immediately available" is the intersection of (a) everything the campaign has
// unlocked for this level (cumulative, including the level's own rewards) with
// (b) the content catalogue. A reward id that is unlocked but not yet authored
// into the catalogue (e.g. a Defender still being implemented) is therefore not
// selectable yet — exactly the "immediately available" wording of the brief.

import type { SpellStats } from './content';
import type { DefenderStats } from './types';

/** Which kind of item a slot (or pool entry) holds. */
export type LoadoutKind = 'defender' | 'spell';

/** One selectable Defender or spell in the available pool. */
export interface AvailableItem {
  kind: LoadoutKind;
  id: string;
  name: string;
  cost: number;
}

/** A single Loadout slot: an item, or null when empty. */
export type LoadoutSlot = AvailableItem | null;

/** A fixed-length Loadout: one entry per capacity slot, in slot order. */
export type Loadout = LoadoutSlot[];

/** The Defender and spell catalogues the pool resolves names/costs against. */
export interface LoadoutCatalog {
  defenders: Record<string, DefenderStats>;
  spells: Record<string, SpellStats>;
}

/** Everything the Loadout rules need to resolve a level's choices. */
export interface LoadoutContext {
  /** 1-based campaign order of the level being loaded out. */
  levelOrder: number;
  /** Cumulative unlock ids available for this level (defenders + spells), in the
   * order they were earned. Duplicates are tolerated. */
  availableIds: string[];
  catalog: LoadoutCatalog;
}

/**
 * Slots by campaign level order (issue #21 AC2): one at level 1, two at levels
 * 2–3, four at levels 4+. The post-v1 eight-slot tier is intentionally NOT
 * implemented. A non-positive order clamps to the starter capacity.
 */
export function loadoutCapacity(levelOrder: number): number {
  if (levelOrder <= 1) return 1;
  if (levelOrder <= 3) return 2;
  return 4;
}

/**
 * The pool of immediately-available Defenders and spells for a level (AC1/AC3):
 * the catalogued subset of the cumulative unlock ids, in unlock order, deduped.
 * An id absent from both catalogues (a reward not yet authored) is skipped.
 */
export function buildPool(ctx: LoadoutContext): AvailableItem[] {
  const seen = new Set<string>();
  const items: AvailableItem[] = [];
  for (const id of ctx.availableIds) {
    if (seen.has(id)) continue;
    const defender = ctx.catalog.defenders[id];
    if (defender) {
      seen.add(id);
      items.push({ kind: 'defender', id, name: defender.name, cost: defender.cost });
      continue;
    }
    const spell = ctx.catalog.spells[id];
    if (spell) {
      seen.add(id);
      items.push({ kind: 'spell', id, name: spell.name, cost: spell.cost });
    }
  }
  return items;
}

/** A fresh, empty Loadout sized to a level's capacity. */
export function emptyLoadout(capacity: number): Loadout {
  return Array.from({ length: Math.max(0, capacity) }, () => null);
}

/**
 * A valid starter Loadout (AC3): fill slots up to capacity, Defenders first then
 * spells, so a fresh campaign always begins battle-ready. Leftover slots stay
 * empty when fewer items are available than the capacity allows.
 */
export function starterLoadout(ctx: LoadoutContext): Loadout {
  const pool = buildPool(ctx);
  const capacity = loadoutCapacity(ctx.levelOrder);
  const loadout = emptyLoadout(capacity);
  const ordered = [...pool.filter((i) => i.kind === 'defender'), ...pool.filter((i) => i.kind === 'spell')];
  for (let i = 0; i < capacity && i < ordered.length; i++) loadout[i] = ordered[i]!;
  return loadout;
}

/**
 * Whether the Loadout is ready to start (AC4): available as soon as at least one
 * slot is filled, and disabled only while every slot is empty.
 */
export function canStart(loadout: Loadout): boolean {
  return loadout.some((slot) => slot !== null);
}

/**
 * Place an item in the first empty slot. Refuses to duplicate an item already
 * slotted and is a no-op when full. Pure: returns a new Loadout, leaving the
 * input untouched.
 */
export function addToLoadout(loadout: Loadout, item: AvailableItem): Loadout {
  const already = loadout.some((slot) => slot !== null && slot.kind === item.kind && slot.id === item.id);
  if (already) return loadout;
  const idx = loadout.indexOf(null);
  if (idx === -1) return loadout;
  const next = loadout.slice();
  next[idx] = item;
  return next;
}

/** Empty the slot at `index` (out-of-range indices are ignored). Pure. */
export function clearSlot(loadout: Loadout, index: number): Loadout {
  if (index < 0 || index >= loadout.length) return loadout;
  const next = loadout.slice();
  next[index] = null;
  return next;
}

/** The non-empty slots of a Loadout, in slot order (drops the empty gaps). */
export function filledSlots(loadout: Loadout): AvailableItem[] {
  return loadout.filter((slot): slot is AvailableItem => slot !== null);
}

export type LoadoutProblem = 'unknown-item' | 'duplicate' | 'over-capacity';

export interface LoadoutValidation {
  valid: boolean;
  /** Why the Loadout is invalid, or null when it is valid. */
  reason: LoadoutProblem | null;
  /** AC4 start gate: at least one slot filled. Independent of `valid`. */
  canStart: boolean;
}

/**
 * Validate a Loadout against a level's pool and capacity. A valid Loadout fills
 * only known, unique items and stays within capacity; `canStart` additionally
 * reflects the AC4 "at least one slot" gate. Unknown/duplicate/over-capacity
 * entries can't arise from the shell but are caught here for corrupt input.
 */
export function validateLoadout(loadout: Loadout, ctx: LoadoutContext): LoadoutValidation {
  const filled = filledSlots(loadout);
  const poolKeys = new Set(buildPool(ctx).map(itemKey));
  const seen = new Set<string>();
  for (const item of filled) {
    const key = itemKey(item);
    if (!poolKeys.has(key)) return { valid: false, reason: 'unknown-item', canStart: false };
    if (seen.has(key)) return { valid: false, reason: 'duplicate', canStart: false };
    seen.add(key);
  }
  if (filled.length > loadoutCapacity(ctx.levelOrder)) {
    return { valid: false, reason: 'over-capacity', canStart: false };
  }
  return { valid: true, reason: null, canStart: filled.length > 0 };
}

export interface LoadoutAdvice {
  /** A non-blocking starter suggestion, or null when nothing is available. */
  recommendation: string | null;
  /** Non-blocking suitability warnings; never gates Start (AC5). */
  warnings: string[];
}

/**
 * Explanatory, non-blocking advice for a Loadout (AC5). Warnings are gated on
 * what the pool actually offers (we never nag about a missing blocker when no
 * blocker is available), and they never disable Start — the Guardian keeps
 * strategic control.
 */
export function loadoutAdvice(loadout: Loadout, ctx: LoadoutContext): LoadoutAdvice {
  const pool = buildPool(ctx);
  const poolHasBlocker = pool.some((p) => p.kind === 'defender' && ctx.catalog.defenders[p.id]?.blocksPath);
  const poolHasRanged = pool.some((p) => p.kind === 'defender' && !ctx.catalog.defenders[p.id]?.blocksPath);

  const filled = filledSlots(loadout);
  const defenders = filled.filter((i) => i.kind === 'defender');
  const ranged = defenders.filter((i) => !ctx.catalog.defenders[i.id]?.blocksPath);
  const blockers = defenders.filter((i) => ctx.catalog.defenders[i.id]?.blocksPath);

  const warnings: string[] = [];
  if (defenders.length === 0) {
    warnings.push('No Defender chosen — you cannot plant anything on the battlefield.');
  } else if (poolHasRanged && ranged.length === 0) {
    warnings.push('No ranged Defender — enemies may reach the Heartwood unopposed.');
  }
  if (poolHasBlocker && ranged.length > 0 && blockers.length === 0) {
    warnings.push('No blocker chosen — Loggers may rush the path.');
  }

  const starter = filledSlots(starterLoadout(ctx));
  const recommendation = starter.length
    ? `Recommended: ${starter.map((i) => i.name).join(' + ')}.`
    : null;

  return { recommendation, warnings };
}

// --- Browser-facing projection -------------------------------------------

export interface LoadoutSlotView {
  index: number;
  filled: boolean;
  kind: LoadoutKind | null;
  /** Guardian-facing label, e.g. "Sprig Sentinel · Defender" or "Empty slot". */
  label: string;
}

export interface LoadoutView {
  capacity: number;
  slots: LoadoutSlotView[];
  /** The full available pool, for the chooser buttons. */
  pool: AvailableItem[];
  /** AC4 start gate. */
  canStart: boolean;
  /** Why Start is disabled, or null when it is available. */
  startDisabledReason: string | null;
  advice: LoadoutAdvice;
}

const KIND_LABEL: Record<LoadoutKind, string> = { defender: 'Defender', spell: 'Spell' };

/**
 * Project a Loadout + context into the plain data the pre-battle shell renders
 * (slot labels, the Start gate, the pool, and advice). Pure — no DOM access —
 * so it unit-tests directly like the HUD and Trail projectors.
 */
export function buildLoadoutView(loadout: Loadout, ctx: LoadoutContext): LoadoutView {
  const startable = canStart(loadout);
  return {
    capacity: loadout.length,
    slots: loadout.map((slot, index) =>
      slot
        ? { index, filled: true, kind: slot.kind, label: `${slot.name} · ${KIND_LABEL[slot.kind]}` }
        : { index, filled: false, kind: null, label: 'Empty slot' },
    ),
    pool: buildPool(ctx),
    canStart: startable,
    startDisabledReason: startable ? null : 'Choose at least one Defender or spell to start.',
    advice: loadoutAdvice(loadout, ctx),
  };
}

// --- Helpers --------------------------------------------------------------

/** Stable identity for an item across the pool, slots, and validation. */
function itemKey(item: AvailableItem): string {
  return `${item.kind}:${item.id}`;
}
