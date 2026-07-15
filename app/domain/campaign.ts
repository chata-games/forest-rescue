// Engine-independent campaign trail resolution.
//
// The campaign manifest (levels/campaign.json) is the single source of truth for
// the ordered level route, act membership, and normalized map positions. This
// module turns that manifest plus a player's progress into the TrailNode list
// the campaign map renders: ordered levels, each with a cleared/current/locked
// status derived purely from how far the Guardian has progressed.
//
// Nothing here may depend on Phaser, the DOM, or any rendering engine — it is
// the observable boundary the Trail map and its tests drive, mirroring the
// BattleState contract for the battle flow.

/** A level's position on the normalized Trail map (0..1 in each axis). */
export interface MapPosition {
  x: number;
  y: number;
}

/** One level entry as authored in the campaign manifest. */
export interface ManifestLevel {
  id: string;
  act: string;
  mapPosition: MapPosition;
  unlocks?: string[];
  spellUnlock?: string | null;
}

/** One act as authored in the campaign manifest. */
export interface ManifestAct {
  id: string;
  title: string;
  blurb?: string;
  levels: string[];
}

/** The full campaign manifest — ordered stable level IDs and act membership. */
export interface CampaignManifest {
  schemaVersion: number;
  id: string;
  title?: string;
  acts: ManifestAct[];
  levels: ManifestLevel[];
}

/**
 * Display + rules metadata for a level, sourced from its CompiledLevel. Kept
 * separate from the manifest so the resolver stays pure (the manifest owns the
 * route; the compiled levels own the names, biomes, and wave counts).
 */
export interface LevelMeta {
  id: string;
  name: string;
  biome: string;
  waveCount: number;
  unlocks: string[];
  spellUnlock: string | null;
  bossId: string | null;
}

/** Best recorded result for a single level. */
export interface LevelProgress {
  cleared: boolean;
  /** Best star result, 0..3. */
  stars: number;
}

/** Progress keyed by stable level id. */
export type CampaignProgress = Record<string, LevelProgress>;

/** Derived Trail state for a single level, in the order it renders on the map. */
export type TrailStatus = 'cleared' | 'current' | 'locked';

export interface TrailNode {
  id: string;
  /** Stable display name from the compiled level. */
  name: string;
  /** 1-based position in the campaign route. */
  order: number;
  actId: string;
  actTitle: string;
  /** Normalized map position from the manifest. */
  position: MapPosition;
  status: TrailStatus;
  /** True unless locked — cleared levels stay enterable for replay. */
  enterable: boolean;
  /** Best star result, 0..3. */
  stars: number;
  biome: string;
  waveCount: number;
  unlocks: string[];
  spellUnlock: string | null;
  bossId: string | null;
  /** Guardian-facing requirement shown for locked nodes; null otherwise. */
  unlockRequirement: string | null;
  /** Accessible state description for the node control. */
  stateDescription: string;
}

/** A fresh campaign: no level has been cleared yet. */
export function emptyProgress(): CampaignProgress {
  return {};
}

/**
 * Record a level clear, preserving the best star result across replays. Returns
 * a new progress object (the input is not mutated). Unknown ids are stored but
 * never affect Trail resolution, so stray/legacy entries are harmless.
 */
export function markCleared(progress: CampaignProgress, levelId: string, stars: number): CampaignProgress {
  const prev = progress[levelId];
  const best = prev ? Math.max(prev.stars, stars) : stars;
  return { ...progress, [levelId]: { cleared: true, stars: best } };
}

function actTitleMap(manifest: CampaignManifest): Record<string, string> {
  const map: Record<string, string> = {};
  for (const act of manifest.acts) map[act.id] = act.title;
  return map;
}

/**
 * Resolve the full Trail from the manifest and the player's progress. Nodes are
 * returned in campaign order. Status is linear: the first uncleared level is the
 * current destination, everything before it is cleared (replayable), and
 * everything after it is locked until the level immediately preceding it clears.
 */
export function resolveTrail(
  manifest: CampaignManifest,
  meta: Record<string, LevelMeta>,
  progress: CampaignProgress,
): TrailNode[] {
  const levels = manifest.levels;
  const actTitles = actTitleMap(manifest);

  // Index of the current destination: the first level not yet cleared. -1 when
  // the whole campaign is complete.
  let currentIndex = -1;
  for (let i = 0; i < levels.length; i++) {
    if (!isCleared(progress, levels[i].id)) {
      currentIndex = i;
      break;
    }
  }

  return levels.map((level, i) => {
    const m = meta[level.id];
    const name = m?.name ?? level.id;
    const status = statusForLevel(i, currentIndex, isCleared(progress, level.id));
    const previous = i > 0 ? levels[i - 1] : null;
    const previousName = previous ? (meta[previous.id]?.name ?? previous.id) : null;

    return {
      id: level.id,
      name,
      order: i + 1,
      actId: level.act,
      actTitle: actTitles[level.act] ?? level.act,
      position: level.mapPosition,
      status,
      enterable: status !== 'locked',
      stars: progress[level.id]?.stars ?? 0,
      biome: m?.biome ?? '',
      waveCount: m?.waveCount ?? 0,
      unlocks: m?.unlocks ?? level.unlocks ?? [],
      spellUnlock: m?.spellUnlock ?? level.spellUnlock ?? null,
      bossId: m?.bossId ?? null,
      unlockRequirement: status === 'locked' ? unlockRequirementText(previousName) : null,
      stateDescription: stateDescriptionFor(status, progress[level.id]?.stars ?? 0, previousName),
    };
  });
}

function isCleared(progress: CampaignProgress, levelId: string): boolean {
  return progress[levelId]?.cleared === true;
}

function statusForLevel(index: number, currentIndex: number, cleared: boolean): TrailStatus {
  if (cleared) return 'cleared';
  if (index === currentIndex) return 'current';
  return 'locked';
}

/** Human-facing requirement naming the level that gates this one. */
export function unlockRequirementText(previousName: string | null): string | null {
  if (!previousName) return null;
  return `Clear ${previousName} to unlock this level.`;
}

function stateDescriptionFor(
  status: TrailStatus,
  stars: number,
  previousName: string | null,
): string {
  switch (status) {
    case 'cleared':
      return `Cleared. Best result: ${stars} of 3 stars. Replay available.`;
    case 'current':
      return 'Available. The next level on the Trail.';
    case 'locked':
      return previousName
        ? `Locked. Clear ${previousName} to unlock this level.`
        : 'Locked. Complete the previous level to unlock.';
  }
}
