// Engine-independent campaign save: persist, migrate, and recover (issue #27).
//
// The save is a local-only, versioned JSON document. It stores stable content
// IDs only — progression, best stars, earned unlocks, and per-level Loadouts —
// plus the schema version and the campaign content epoch it was written against.
// Authored content (defender/spell stats, geometry, waves) is NEVER copied in:
// it is re-derived from the live catalogue on load (AC5).
//
// Loading runs four journeys the issue requires:
//   - Reload              — a current-shape save round-trips intact.
//   - Compatible migration — sequential schema migrations (v1 → v2 → …) and
//                            stable-ID aliases preserve progress across renamed
//                            but still-compatible content (AC2).
//   - Incompatible epoch  — a deliberately-bumped content epoch archives the old
//                            progress and starts a fresh campaign with a
//                            one-time, plain-language notice (AC3).
//   - Corruption          — unparseable / unrecognisable data, or a migration
//                            failure, preserves the raw value for diagnostics,
//                            starts a safe fresh campaign, and explains the
//                            recovery without trapping the player (AC4).
//
// Nothing here touches localStorage or the DOM: that is the shell's job. This
// module is the pure boundary the shell and its Vitest suite drive, mirroring the
// campaign and Loadout contracts.

import { emptyProgress, type CampaignProgress } from './campaign';
import { defaultGuidance, guidanceForClearedCount, sanitizeGuidance, type GuidanceState } from './guidance';
import type { SavedLoadout, SavedLoadoutSlot } from './loadout';

/**
 * The save's own schema version — the on-disk JSON shape. Bumped whenever that
 * shape changes; each bump is covered by a sequential migration step below.
 * v1 is the pre-issue-#27 shape written by the original shell
 * (`{ schemaVersion: 1, levels: CampaignProgress }`); v2 is the full shape here;
 * v3 adds the Guidance preference (issue #23).
 */
export const SAVE_SCHEMA_VERSION = 3;

/**
 * The campaign content epoch this build ships. A *deliberate, incompatible*
 * content change bumps this; a stored save whose epoch differs is archived and a
 * fresh campaign starts with a one-time notice (AC3). Compatible renames instead
 * use CONTENT_ALIASES so progress survives (AC2). Maintainers bump this by hand.
 */
export const CONTENT_EPOCH = 'heartwood-v1';

/**
 * Stable-ID aliases for compatible content renames: `{ oldId: newId }`. Applied
 * to level ids, loadout slot ids, and unlock ids on load. Empty until content is
 * renamed; populated only with backwards-compatible renames.
 */
export const CONTENT_ALIASES: Readonly<Record<string, string>> = {};

/** One level's persisted result (cleared flag + best star result). */
export interface LevelProgressSave {
  cleared: boolean;
  stars: number;
}

/** Persisted progression, keyed by stable level id. */
export type ProgressSave = Record<string, LevelProgressSave>;

/**
 * The versioned local JSON save (AC1). Stable content IDs only — no authored
 * stats, geometry, or waves are ever copied in (AC5).
 */
export interface SaveData {
  schemaVersion: number;
  /** The content epoch this save was written against (AC3 marker). */
  contentEpoch: string;
  /** The campaign id this save belongs to. */
  campaignId: string;
  progress: ProgressSave;
  /** Stable reward ids earned so far (defenders + spells). Self-describing. */
  unlocks: string[];
  /** Per-level chosen Loadout, keyed by stable level id. Stable IDs only. */
  loadouts: Record<string, SavedLoadout>;
  /** The Guidance preference + fading intensity (issue #23 AC1/AC6). */
  guidance: GuidanceState;
}

export type SaveNoticeKind = 'epoch' | 'corrupted';

/** A one-time, plain-language recovery notice shown after a reset (AC3/AC4). */
export interface SaveNotice {
  kind: SaveNoticeKind;
  message: string;
}

/** The result of loading + migrating + recovering a raw save (issue #27). */
export interface SaveLoadOutcome {
  progress: CampaignProgress;
  unlocks: string[];
  loadouts: Record<string, SavedLoadout>;
  /** The Guidance preference recovered from the save (issue #23 AC6). */
  guidance: GuidanceState;
  /** A recovery notice, or null when the save loaded cleanly. */
  notice: SaveNotice | null;
  /** The preserved raw value when progress was archived/recovered (AC4). */
  archivedRaw: string | null;
}

/** The live content identity + compatible renames the loader resolves against. */
export interface SaveContext {
  contentEpoch: string;
  campaignId: string;
  aliases: Readonly<Record<string, string>>;
}

// --- Public API ------------------------------------------------------------

/** A blank save for a fresh campaign, bound to the live content identity. */
export function freshSave(ctx: SaveContext): SaveData {
  return buildSave({ ctx, progress: emptyProgress(), unlocks: [], loadouts: {} });
}

/**
 * Build a save from the live campaign state. Inputs are sanitized, so partial or
 * loosely-typed app state can never produce an invalid save. `guidance` defaults
 * to a brand-new Guardian's preference when omitted (issue #23).
 */
export function buildSave(input: {
  ctx: SaveContext;
  progress: CampaignProgress;
  unlocks: string[];
  loadouts: Record<string, SavedLoadout>;
  guidance?: GuidanceState;
}): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    contentEpoch: input.ctx.contentEpoch,
    campaignId: input.ctx.campaignId,
    progress: sanitizeProgress(input.progress),
    unlocks: sanitizeStringArray(input.unlocks),
    loadouts: sanitizeLoadouts(input.loadouts),
    guidance: sanitizeGuidance(input.guidance),
  };
}

/** Serialize a save to a JSON string for localStorage. */
export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

/**
 * Load, migrate, and recover a save from its raw localStorage string. Never
 * throws: every failure path yields a safe fresh campaign plus an explanatory
 * notice, with the raw value preserved for diagnostics (AC4).
 */
export function loadSave(raw: string | null | undefined, ctx: SaveContext): SaveLoadOutcome {
  if (raw == null || raw === '') {
    return {
      progress: emptyProgress(),
      unlocks: [],
      loadouts: {},
      guidance: defaultGuidance(),
      notice: null,
      archivedRaw: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return recover(raw, 'corrupted', CORRUPT_MESSAGE);
  }
  if (!isObject(parsed)) {
    return recover(raw, 'corrupted', CORRUPT_MESSAGE);
  }

  let migrated: SaveData;
  try {
    migrated = runMigrations(parsed, ctx);
  } catch {
    return recover(raw, 'corrupted', CORRUPT_MESSAGE);
  }

  const aliased = applyAliases(migrated, ctx.aliases);
  if (aliased.contentEpoch !== ctx.contentEpoch) {
    return recover(raw, 'epoch', EPOCH_MESSAGE);
  }
  return {
    progress: aliased.progress,
    unlocks: aliased.unlocks,
    loadouts: aliased.loadouts,
    guidance: aliased.guidance,
    notice: null,
    archivedRaw: null,
  };
}

/**
 * Rewrite stable IDs in a save using the alias map (compatible renames, AC2).
 * Applies to level ids (progress + loadout keys), loadout slot ids, and unlock
 * ids. A no-op (returns the same reference) when there are no aliases.
 */
export function applyAliases(save: SaveData, aliases: Readonly<Record<string, string>>): SaveData {
  if (!aliases || Object.keys(aliases).length === 0) return save;
  const remap = (id: string): string => aliases[id] ?? id;

  const progress: ProgressSave = {};
  for (const [id, val] of Object.entries(save.progress)) progress[remap(id)] = val;

  const loadouts: Record<string, SavedLoadout> = {};
  for (const [levelId, slots] of Object.entries(save.loadouts)) {
    loadouts[remap(levelId)] = slots.map((slot) => (slot ? { kind: slot.kind, id: remap(slot.id) } : null));
  }

  return { ...save, progress, loadouts, unlocks: save.unlocks.map(remap) };
}

// --- Migration ladder ------------------------------------------------------

/** A migration step: read schemaVersion N (1-indexed), return the next version's
 * raw shape. The final {@link normalizeSave} call validates + cleans it into a
 * well-typed SaveData, so a step need only carry the fields it transforms. */
type Migration = (data: unknown, ctx: SaveContext) => Record<string, unknown>;

/**
 * v1 → v2: lift the pre-issue-#27 `{ schemaVersion: 1, levels }` shape into the
 * full save. Progress is preserved; unlocks/loadouts start empty. Legacy saves
 * adopt the *current* content epoch, so a routine migration is never mistaken
 * for an incompatible content change (only a deliberate epoch bump is).
 */
const migrateV1ToV2: Migration = (data, ctx) => {
  const levels = isObject(data) && isObject((data as { levels?: unknown }).levels)
    ? (data as { levels: object }).levels
    : {};
  return {
    schemaVersion: 2,
    contentEpoch: ctx.contentEpoch,
    campaignId: ctx.campaignId,
    progress: sanitizeProgress(levels),
    unlocks: [],
    loadouts: {},
  };
};

/**
 * v2 → v3: add the Guidance preference (issue #23 AC1/AC6). A v2 save carried no
 * guidance, so its faded level is reconstructed from how many levels the
 * Guardian has already cleared — the level they would have reached had guidance
 * faded once per first-time clear (clamped at 0 = graduated). Progress, unlocks,
 * and Loadouts are preserved verbatim. Like the v1→v2 step, a migrated save
 * adopts the current content epoch.
 */
const migrateV2ToV3: Migration = (data, ctx) => {
  const obj = isObject(data) ? data : {};
  const progress = sanitizeProgress(obj.progress);
  const cleared = Object.values(progress).filter((p) => p.cleared).length;
  return {
    schemaVersion: 3,
    contentEpoch: ctx.contentEpoch,
    campaignId: ctx.campaignId,
    progress,
    unlocks: sanitizeStringArray(obj.unlocks),
    loadouts: sanitizeLoadouts(obj.loadouts),
    guidance: guidanceForClearedCount(cleared),
  };
};

/**
 * Sequential migration ladder. Entry i migrates schemaVersion (i + 1) → (i + 2).
 * Adding a new schema version appends one step here and bumps SAVE_SCHEMA_VERSION.
 */
const MIGRATIONS: Migration[] = [migrateV1ToV2, migrateV2ToV3];

/** Run the migration ladder from the parsed save's version to the current one. */
function runMigrations(parsed: unknown, ctx: SaveContext): SaveData {
  const obj = isObject(parsed) ? parsed : {};
  const startVersion = integerVersion(obj.schemaVersion);
  if (startVersion < 1) throw new Error('invalid schemaVersion');
  if (startVersion > SAVE_SCHEMA_VERSION) throw new Error('save is newer than this build');

  let current: unknown = obj;
  for (let version = startVersion; version < SAVE_SCHEMA_VERSION; version++) {
    const migrate = MIGRATIONS[version - 1];
    if (!migrate) throw new Error(`no migration from schema ${version}`);
    current = migrate(current, ctx);
  }
  return normalizeSave(current);
}

/**
 * Validate + clean the final shape into a well-typed SaveData. Lenient: it
 * sanitizes rather than throws, so a parseable-but-weird save recovers gracefully
 * (bad entries are dropped) instead of hard-failing. Only a missing/invalid
 * schemaVersion or a thrown migration surfaces as corruption (handled upstream).
 */
function normalizeSave(data: unknown): SaveData {
  if (!isObject(data)) throw new Error('save is not an object');
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    contentEpoch: typeof data.contentEpoch === 'string' ? data.contentEpoch : '',
    campaignId: typeof data.campaignId === 'string' ? data.campaignId : '',
    progress: sanitizeProgress(isObject(data.progress) ? data.progress : {}),
    unlocks: sanitizeStringArray(data.unlocks),
    loadouts: sanitizeLoadouts(data.loadouts),
    guidance: sanitizeGuidance(data.guidance),
  };
}

// --- Sanitizers ------------------------------------------------------------

function sanitizeProgress(raw: unknown): ProgressSave {
  const out: ProgressSave = {};
  if (!isObject(raw)) return out;
  for (const [id, val] of Object.entries(raw)) {
    if (typeof id !== 'string' || id === '') continue;
    if (!isObject(val)) continue;
    // Only cleared levels carry saved progress (matches markCleared's invariant:
    // a level is either cleared-with-stars or absent). A non-cleared or
    // contradictory entry is corrupt and dropped.
    if (val.cleared !== true) continue;
    out[id] = { cleared: true, stars: clampStars(val.stars) };
  }
  return out;
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v !== '' && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function sanitizeLoadouts(raw: unknown): Record<string, SavedLoadout> {
  const out: Record<string, SavedLoadout> = {};
  if (!isObject(raw)) return out;
  for (const [levelId, slots] of Object.entries(raw)) {
    if (typeof levelId !== 'string' || levelId === '' || !Array.isArray(slots)) continue;
    out[levelId] = slots.map((slot) => (isSavedSlot(slot) ? { kind: slot.kind, id: slot.id } : null));
  }
  return out;
}

function isSavedSlot(slot: unknown): slot is SavedLoadoutSlot {
  return (
    isObject(slot) &&
    (slot.kind === 'defender' || slot.kind === 'spell') &&
    typeof slot.id === 'string' &&
    slot.id !== ''
  );
}

function clampStars(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.max(0, Math.min(3, n));
}

// --- Recovery --------------------------------------------------------------

const CORRUPT_MESSAGE =
  'Your saved campaign could not be read, so a fresh one has been started. Your previous data was kept safe in case it is needed.';
const EPOCH_MESSAGE =
  'The Forest Rescue campaign has been updated. Your previous progress was set aside and a fresh campaign has started.';

/** Build a recovery outcome: a fresh campaign, a notice, and the raw preserved. */
function recover(raw: string, kind: SaveNoticeKind, message: string): SaveLoadOutcome {
  return {
    progress: emptyProgress(),
    unlocks: [],
    loadouts: {},
    guidance: defaultGuidance(),
    notice: { kind, message },
    archivedRaw: raw,
  };
}

// --- Tiny guards ------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function integerVersion(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) ? v : 1;
}
