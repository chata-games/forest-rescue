// Engine-independent story delivery (issue #33).
//
// The campaign tells its story through optional pre- and post-battle narrative
// beats. Each beat is a short, readable panel that never interrupts active
// defense: the pre beat appears before a battle, the post beat after a victory,
// and both are skippable (once per session) and replayable from the campaign
// detail surface. A level without an authored beat simply has no panel — story
// is always optional.
//
// Nothing here depends on Phaser, the DOM, or any renderer: it is the pure
// boundary the shell and its vitest suite drive, mirroring the campaign and
// Loadout contracts. The seen-state is an opaque record the shell owns (and may
// persist); the rules for what that state means live here.

/** Which side of a battle a beat bookends. */
export type StoryKind = 'pre' | 'post';

/** One readable story panel for a level's pre- or post-battle moment. */
export interface StoryBeat {
  levelId: string;
  kind: StoryKind;
  title: string;
  /** Readable paragraphs, rendered in order. */
  lines: string[];
}

/** Stable key for a beat: `${levelId}:${kind}`. */
export function storyBeatKey(levelId: string, kind: StoryKind): string {
  return `${levelId}:${kind}`;
}

/**
 * The authored story catalogue, keyed by beat key. Authored for every shipped
 * campaign level so the pre/post panels are available on each (optional, not
 * mandatory). Keep beats short and age-appropriate (≈8–14); they orient, they do
 * not gate.
 */
export const STORY_BEATS: Record<string, StoryBeat> = beatMap([
  // --- Act 1: First Sprouts -------------------------------------------------
  {
    levelId: '01-meadows-edge',
    kind: 'pre',
    title: 'The Guardian Wakes',
    lines: [
      'You are the Guardian of the Heartwood — the living heart of the old forest.',
      'ChopCo Industries has sent its first logging crew to the Meadow’s Edge. Plant your defenders on the fairy rings and hold the line.',
    ],
  },
  {
    levelId: '01-meadows-edge',
    kind: 'post',
    title: 'First Light',
    lines: [
      'The meadow is safe for now. The Sprig Sentinel and Thornvine Bramble will stand with you on the trail ahead.',
    ],
  },
  {
    levelId: '02-old-stump-crossroads',
    kind: 'pre',
    title: 'Where the Road Forks',
    lines: [
      'The logging road splits at the old stump. Two paths mean two ways in — watch both.',
    ],
  },
  {
    levelId: '02-old-stump-crossroads',
    kind: 'post',
    title: 'Crossroads Held',
    lines: ['The crews fall back. A Wisp Willow answers the forest’s call to join you.'],
  },
  {
    levelId: '03-whispering-river',
    kind: 'pre',
    title: 'The Whispering River',
    lines: [
      'The river carries the loggers’ rafts toward the Heartwood. Slow them on the banks before they cross.',
    ],
  },
  {
    levelId: '03-whispering-river',
    kind: 'post',
    title: 'Currents Calm',
    lines: ['The river runs quiet again. New allies stir in the shallows.'],
  },

  // --- Act 2: Deepening Shadow ---------------------------------------------
  {
    levelId: '04-mushroom-hollow',
    kind: 'pre',
    title: 'Into the Hollow',
    lines: [
      'The hollow grows dark and close. The crews press deeper, and the shadows move with them.',
    ],
  },
  {
    levelId: '04-mushroom-hollow',
    kind: 'post',
    title: 'Light in the Hollow',
    lines: ['The hollow breathes again. A Firefly Beacon and Mushroom Shaman join your guard.'],
  },
  {
    levelId: '05-sawmill-clearing',
    kind: 'pre',
    title: 'The Sawmill',
    lines: [
      'ChopCo’s sawmill thunders in the clearing. Shut it down before its machines reach the Heartwood.',
    ],
  },
  {
    levelId: '05-sawmill-clearing',
    kind: 'post',
    title: 'Machines Silenced',
    lines: ['The sawmill falls quiet. You have learned the Root Snare — bind your enemies where they stand.'],
  },

  // --- Act 3: Heartwood Stand ----------------------------------------------
  {
    levelId: '06-ashfall-scar',
    kind: 'pre',
    title: 'Ashfall',
    lines: [
      'Fire and machinery scar the land. This is no longer a raid — ChopCo means to end the Heartwood.',
    ],
  },
  {
    levelId: '06-ashfall-scar',
    kind: 'post',
    title: 'Embers Doused',
    lines: ['The scar cools. Hold firm — the final stand waits at the gate.'],
  },
  {
    levelId: '07-boulder-pass',
    kind: 'pre',
    title: 'The Heartwood Gate',
    lines: [
      'One pass remains between ChopCo and the Heartwood. Everything you have learned comes to this.',
    ],
  },
  {
    levelId: '07-boulder-pass',
    kind: 'post',
    title: 'The Heartwood Endures',
    lines: [
      'The Heartwood stands. The forest remembers its Guardian — and so will you.',
      'Replay any level to chase a higher star result; the campaign is yours.',
    ],
  },
]);

/** Resolve the pre- or post-battle story beat for a level, or null when none. */
export function storyForLevel(levelId: string, kind: StoryKind): StoryBeat | null {
  return STORY_BEATS[storyBeatKey(levelId, kind)] ?? null;
}

// --- Seen-state ------------------------------------------------------------

/** Opaque per-session record of which beats have been shown (and so should not
 *  auto-repeat). The shell owns persistence; these rules define its meaning. */
export type StorySeen = Record<string, true>;

/** Whether the beat should auto-appear: only when it exists and is unseen. */
export function shouldShowStory(seen: StorySeen, levelId: string, kind: StoryKind): boolean {
  if (!storyForLevel(levelId, kind)) return false;
  return seen[storyBeatKey(levelId, kind)] !== true;
}

/** Mark a beat seen so it does not auto-repeat this session. Pure. */
export function markStorySeen(seen: StorySeen, levelId: string, kind: StoryKind): StorySeen {
  return { ...seen, [storyBeatKey(levelId, kind)]: true as const };
}

/** Clear all seen beats so every panel replays (the replay-from-surface reset). */
export function resetStory(_seen: StorySeen): StorySeen {
  return {};
}

// --- Projection ------------------------------------------------------------

/** The plain data the shell renders for a story panel. */
export interface StoryPanelView {
  title: string;
  /** Lines joined into readable paragraphs (the shell may also render them as a list). */
  body: string;
  /** Primary action: "Begin"/"Enter" (pre) or "Continue"/"Return" (post). */
  primaryAction: string;
  /** Dismiss-without-reading action. */
  skipAction: string;
}

/**
 * Project a beat into the panel data the shell renders. The primary action is
 * contextual — "Begin" before a battle, "Continue" after — and a Skip action is
 * always present so the panel is skippable (AC1).
 */
export function buildStoryPanel(beat: StoryBeat): StoryPanelView {
  return {
    title: beat.title,
    body: beat.lines.join('\n\n'),
    primaryAction: beat.kind === 'pre' ? 'Begin' : 'Continue',
    skipAction: 'Skip',
  };
}

// --- Helpers ---------------------------------------------------------------

/** Key a flat list of beats into the catalogue record by `${levelId}:${kind}`. */
function beatMap(beats: StoryBeat[]): Record<string, StoryBeat> {
  const out: Record<string, StoryBeat> = {};
  for (const beat of beats) out[storyBeatKey(beat.levelId, beat.kind)] = beat;
  return out;
}
