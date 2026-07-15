import { describe, it, expect } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  CONTENT_EPOCH,
  buildSave,
  serializeSave,
  loadSave,
  applyAliases,
  freshSave,
  type SaveContext,
  type SaveData,
} from './save';
import { emptyProgress, markCleared, type CampaignProgress } from './campaign';

// The save module is engine-independent: loadSave/buildSave/serialize never touch
// localStorage — that is the shell's job. These tests drive the pure domain
// boundary for the four journeys issue #27 requires: reload, compatible
// migration, incompatible epoch, and corruption recovery.

const CTX: SaveContext = {
  contentEpoch: CONTENT_EPOCH,
  campaignId: 'heartwood-v1',
  aliases: {},
};

function ctx(over: Partial<SaveContext> = {}): SaveContext {
  return { ...CTX, ...over };
}

/** A progress snapshot with a couple of cleared levels + best stars. */
function sampleProgress(): CampaignProgress {
  let p = emptyProgress();
  p = markCleared(p, '01-meadows-edge', 2);
  p = markCleared(p, '02-old-stump-crossroads', 3);
  return p;
}

/** Build + serialize a current-shape save (what the shell writes today). */
function serialize(input: {
  progress?: CampaignProgress;
  unlocks?: string[];
  loadouts?: SaveData['loadouts'];
  epoch?: string;
  campaignId?: string;
} = {}): string {
  return serializeSave(
    buildSave({
      ctx: ctx({ contentEpoch: input.epoch ?? CONTENT_EPOCH, campaignId: input.campaignId ?? 'heartwood-v1' }),
      progress: input.progress ?? sampleProgress(),
      unlocks: input.unlocks ?? ['sprig-sentinel', 'thornvine-bramble'],
      loadouts: input.loadouts ?? {
        '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }],
      },
    }),
  );
}

// --- Reload (AC1: round-trip survives reload) ------------------------------

describe('reload journey', () => {
  it('round-trips progression, best stars, unlocks, and loadouts', () => {
    const raw = serialize();
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress).toEqual(sampleProgress());
    expect(outcome.unlocks).toEqual(['sprig-sentinel', 'thornvine-bramble']);
    expect(outcome.loadouts).toEqual({
      '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }],
    });
    expect(outcome.notice).toBeNull();
    expect(outcome.archivedRaw).toBeNull();
  });

  it('treats a missing save as a fresh campaign with no notice', () => {
    for (const empty of [null, undefined, '']) {
      const outcome = loadSave(empty, CTX);
      expect(outcome.progress).toEqual(emptyProgress());
      expect(outcome.unlocks).toEqual([]);
      expect(outcome.loadouts).toEqual({});
      expect(outcome.notice).toBeNull();
      expect(outcome.archivedRaw).toBeNull();
    }
  });

  it('records the current schema version, content epoch, and campaign id', () => {
    const data = buildSave({ ctx: CTX, progress: sampleProgress(), unlocks: [], loadouts: {} });
    expect(data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(data.contentEpoch).toBe(CONTENT_EPOCH);
    expect(data.campaignId).toBe('heartwood-v1');
  });

  it('does not copy authored content snapshots — only stable IDs', () => {
    // A save carries level ids, reward ids, and kind+id per loadout slot — never
    // defender/spell stats, geometry, or waves.
    const data = buildSave({
      ctx: CTX,
      progress: sampleProgress(),
      unlocks: ['sprig-sentinel'],
      loadouts: { '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }, null] },
    });
    const json = serializeSave(data);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.progress).toEqual({ '01-meadows-edge': { cleared: true, stars: 2 }, '02-old-stump-crossroads': { cleared: true, stars: 3 } });
    expect(parsed.loadouts).toEqual({ '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }, null] });
    // No authored stat fields leak in.
    expect(json).not.toContain('damage');
    expect(json).not.toContain('range');
    expect(json).not.toContain('controlPoints');
  });
});

// --- Compatible migration (AC2: sequential migration + stable-ID aliases) --

describe('compatible migration journey', () => {
  it('migrates a legacy v1 save (levels only) into the current shape, preserving progress', () => {
    // The pre-issue-#27 shell wrote { schemaVersion: 1, levels: CampaignProgress }.
    const v1 = JSON.stringify({
      schemaVersion: 1,
      levels: {
        '01-meadows-edge': { cleared: true, stars: 2 },
        '02-old-stump-crossroads': { cleared: true, stars: 3 },
      },
    });
    const outcome = loadSave(v1, CTX);
    expect(outcome.progress).toEqual({
      '01-meadows-edge': { cleared: true, stars: 2 },
      '02-old-stump-crossroads': { cleared: true, stars: 3 },
    });
    // A legacy save had no unlocks/loadouts/epoch; those start empty but progress
    // is preserved and the player gets no scary notice.
    expect(outcome.unlocks).toEqual([]);
    expect(outcome.loadouts).toEqual({});
    expect(outcome.notice).toBeNull();
  });

  it('adopts the current content epoch on legacy migration (not treated as an incompatible change)', () => {
    const v1 = JSON.stringify({ schemaVersion: 1, levels: { '01-meadows-edge': { cleared: true, stars: 1 } } });
    const outcome = loadSave(v1, CTX);
    expect(outcome.progress['01-meadows-edge']).toEqual({ cleared: true, stars: 1 });
    expect(outcome.notice).toBeNull();
  });

  it('preserves progress across a compatible stable-ID rename via aliases', () => {
    // A level id was renamed; the alias maps the old id to the new one.
    const raw = serialize({ progress: markCleared(emptyProgress(), '02-old-stump-crossroads', 3) });
    const outcome = loadSave(raw, ctx({ aliases: { '02-old-stump-crossroads': '02-stump-crossroads' } }));
    expect(outcome.progress).toHaveProperty('02-stump-crossroads', { cleared: true, stars: 3 });
    expect(outcome.progress).not.toHaveProperty('02-old-stump-crossroads');
    expect(outcome.notice).toBeNull();
  });

  it('rewrites loadout and unlock ids through the alias map too', () => {
    const raw = serialize({
      unlocks: ['wisp-willow'],
      loadouts: { '02-old-stump-crossroads': [{ kind: 'defender', id: 'wisp-willow' }] },
    });
    const outcome = loadSave(raw, ctx({ aliases: { '02-old-stump-crossroads': '02-stump', 'wisp-willow': 'willow-wisp' } }));
    expect(outcome.unlocks).toEqual(['willow-wisp']);
    expect(outcome.loadouts).toEqual({ '02-stump': [{ kind: 'defender', id: 'willow-wisp' }] });
  });

  it('applyAliases is a no-op when there are no aliases', () => {
    const data = buildSave({ ctx: CTX, progress: sampleProgress(), unlocks: ['sprig-sentinel'], loadouts: {} });
    expect(applyAliases(data, {})).toBe(data);
  });
});

// --- Incompatible content epoch (AC3: archive + fresh + one-time notice) ----

describe('incompatible epoch journey', () => {
  it('archives the raw value and starts a fresh campaign with a plain-language notice', () => {
    const raw = serialize({ epoch: 'long-gone-epoch' });
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress).toEqual(emptyProgress());
    expect(outcome.unlocks).toEqual([]);
    expect(outcome.loadouts).toEqual({});
    expect(outcome.notice?.kind).toBe('epoch');
    expect(outcome.notice?.message.length).toBeGreaterThan(0);
    // The raw value is preserved for diagnostics (AC4) — the shell archives it.
    expect(outcome.archivedRaw).toBe(raw);
  });

  it('does not trap the player: the notice is one-time once the fresh save is persisted', () => {
    // After recovery the shell writes a fresh save bound to the current epoch;
    // reloading that must not re-trigger the notice.
    const recovered = loadSave(serialize({ epoch: 'old' }), CTX);
    expect(recovered.notice).not.toBeNull();
    const rewritten = serializeSave(buildSave({
      ctx: CTX,
      progress: recovered.progress,
      unlocks: recovered.unlocks,
      loadouts: recovered.loadouts,
    }));
    const reloaded = loadSave(rewritten, CTX);
    expect(reloaded.notice).toBeNull();
    expect(reloaded.progress).toEqual(emptyProgress());
  });
});

// --- Corruption recovery (AC4: preserve raw, fresh start, explain) ---------

describe('corruption recovery journey', () => {
  it('recovers from unparseable JSON with a fresh campaign, a notice, and the raw preserved', () => {
    const raw = '{ this is not valid json;;;';
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress).toEqual(emptyProgress());
    expect(outcome.notice?.kind).toBe('corrupted');
    expect(outcome.notice?.message.length).toBeGreaterThan(0);
    expect(outcome.archivedRaw).toBe(raw);
  });

  it('recovers when the parsed value is not a save object', () => {
    const raw = JSON.stringify([1, 2, 3]);
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress).toEqual(emptyProgress());
    expect(outcome.notice?.kind).toBe('corrupted');
    expect(outcome.archivedRaw).toBe(raw);
  });

  it('recovers from a save newer than this build can read', () => {
    const raw = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION + 5, levels: {} });
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress).toEqual(emptyProgress());
    expect(outcome.notice?.kind).toBe('corrupted');
    expect(outcome.archivedRaw).toBe(raw);
  });

  it('gracefully sanitizes a parseable but partially malformed current save', () => {
    // Right epoch + version, but progress entries are junk — drop them, keep the
    // good ones, and load without a scary notice.
    const raw = JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION,
      contentEpoch: CONTENT_EPOCH,
      campaignId: 'heartwood-v1',
      progress: {
        '01-meadows-edge': { cleared: true, stars: 2 },
        bogus: 'not-a-progress-entry',
        '02-old-stump-crossroads': { cleared: 'maybe', stars: 99 },
      },
      unlocks: ['sprig-sentinel', 42, ''],
      loadouts: { '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }, 'junk'] },
    });
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress).toEqual({
      '01-meadows-edge': { cleared: true, stars: 2 },
      // cleared:false + clamped stars:0 carries no meaning → dropped.
    });
    expect(outcome.unlocks).toEqual(['sprig-sentinel']);
    expect(outcome.loadouts).toEqual({ '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }, null] });
    expect(outcome.notice).toBeNull();
  });

  it('clamps out-of-range star values into 0..3 rather than rejecting the save', () => {
    const raw = JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION,
      contentEpoch: CONTENT_EPOCH,
      campaignId: 'heartwood-v1',
      progress: { '01-meadows-edge': { cleared: true, stars: 9 } },
      unlocks: [],
      loadouts: {},
    });
    const outcome = loadSave(raw, CTX);
    expect(outcome.progress['01-meadows-edge']).toEqual({ cleared: true, stars: 3 });
  });
});

// --- freshSave --------------------------------------------------------------

describe('freshSave', () => {
  it('is an empty, current-shape save bound to the live content identity', () => {
    const data = freshSave(CTX);
    expect(data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(data.contentEpoch).toBe(CONTENT_EPOCH);
    expect(data.progress).toEqual({});
    expect(data.unlocks).toEqual([]);
    expect(data.loadouts).toEqual({});
    // And it round-trips through load as a no-notice fresh campaign.
    const outcome = loadSave(serializeSave(data), CTX);
    expect(outcome.notice).toBeNull();
    expect(outcome.progress).toEqual({});
  });
});
