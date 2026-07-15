// Engine-independent tutorial delivery (issue #33).
//
// Tutorials teach one concept at a time. A level's tutorial is the ordered set
// of concepts derived from its learning goal and level modifiers; the shell
// surfaces one concept at a time as a dismissible prompt in the planning phase
// only — never as a mandatory overlay during active defense. Each prompt can be
// advanced ("Got it" → next concept) or skipped wholesale ("Skip tutorials"),
// and the whole set can be replayed from the campaign surface.
//
// Nothing here depends on Phaser, the DOM, or any renderer: it is the pure
// boundary the shell and its vitest suite drive. Concept ids are stable strings
// (not display names) so dismissed-state survives content rewording.

/** One teachable concept, projected one at a time. */
export interface TutorialStep {
  /** Stable concept id, e.g. 'placement', 'blocking'. */
  concept: string;
  title: string;
  body: string;
}

/** The authored concept catalogue, keyed by stable concept id. */
export const TUTORIAL_CONCEPTS: Record<string, TutorialStep> = {
  placement: {
    concept: 'placement',
    title: 'Plant a Defender',
    body: 'Tap a glowing fairy ring beside the trail to plant your chosen Defender. Defenders attack enemies in range.',
  },
  blocking: {
    concept: 'blocking',
    title: 'Block the Loggers',
    body: 'Some Defenders plant on the path itself and block enemies, making them stop and fight. Use one to slow a rush.',
  },
  mana: {
    concept: 'mana',
    title: 'Collect Mana',
    body: 'Mana flowers bloom on the battlefield. Tap one to collect bonus mana for more Defenders and spells.',
  },
  spells: {
    concept: 'spells',
    title: 'Cast a Spell',
    body: 'Tap a spell to arm it, then tap the battlefield to cast it where it lands. Press Esc to cancel.',
  },
  planning: {
    concept: 'planning',
    title: 'Pause to Plan',
    body: 'Press Pause to freeze the battle. You can still plant, inspect, upgrade, and remove Defenders while planning.',
  },
};

/**
 * Map a learning-goal / modifier keyword to a concept id. 'chopping' (the act of
 * stopping loggers) maps to the 'blocking' concept; other keywords map directly.
 */
const KEYWORD_TO_CONCEPT: Record<string, string> = {
  placement: 'placement',
  placing: 'placement',
  chopping: 'blocking',
  block: 'blocking',
  blocking: 'blocking',
  mana: 'mana',
  collection: 'mana',
  collecting: 'mana',
  spell: 'spells',
  spells: 'spells',
  targeting: 'spells',
  planning: 'planning',
  pause: 'planning',
};

/** What a level carries that the tutorial resolves against. */
export interface TutorialInput {
  /** Authored learning goal, e.g. 'placement-and-chopping'. */
  learningGoal?: string;
  /** Authored level modifiers, e.g. ['tutorial-chopping']. */
  levelModifiers?: string[];
}

/** Tokens that split a learning-goal string into keywords. */
function keywords(phrase: string | undefined): string[] {
  if (!phrase) return [];
  return phrase.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 0 && t !== 'and');
}

/** The stable concept id for a modifier, stripping a leading 'tutorial-' prefix. */
function modifierConcept(modifier: string): string | null {
  const stripped = modifier.toLowerCase().replace(/^tutorial-/, '');
  return KEYWORD_TO_CONCEPT[stripped] ?? null;
}

/**
 * The ordered, deduped concept ids a level teaches (issue #33 AC2). Concepts come
 * from the learning goal first, then the modifiers; each appears once. Keywords
 * without a known concept are ignored, so an unfamiliar goal yields no tutorial.
 */
export function tutorialConceptsFor(input: TutorialInput): string[] {
  const ordered: string[] = [];
  const push = (concept: string): void => {
    if (TUTORIAL_CONCEPTS[concept] && !ordered.includes(concept)) ordered.push(concept);
  };
  for (const kw of keywords(input.learningGoal)) {
    const concept = KEYWORD_TO_CONCEPT[kw];
    if (concept) push(concept);
  }
  for (const modifier of input.levelModifiers ?? []) {
    const concept = modifierConcept(modifier);
    if (concept) push(concept);
  }
  return ordered;
}

/** The ordered tutorial steps for a level (one per resolved concept). */
export function tutorialStepsFor(input: TutorialInput): TutorialStep[] {
  return tutorialConceptsFor(input).map((concept) => TUTORIAL_CONCEPTS[concept]!);
}

// --- Dismissed-state -------------------------------------------------------

/** Opaque per-session record of which concepts the Guardian has dismissed. */
export type TutorialDismissed = Record<string, true>;

/**
 * The first step the Guardian has not yet dismissed — the single concept to show
 * next (AC2: one concept at a time). Null when every concept is dismissed or the
 * level has no tutorial.
 */
export function currentTutorialStep(
  steps: TutorialStep[],
  dismissed: TutorialDismissed,
): TutorialStep | null {
  return steps.find((step) => dismissed[step.concept] !== true) ?? null;
}

/** Dismiss one concept so the next may show. Pure. */
export function dismissTutorial(dismissed: TutorialDismissed, concept: string): TutorialDismissed {
  return { ...dismissed, [concept]: true as const };
}

/** Dismiss every concept in a level at once ("Skip tutorials"). Pure. */
export function dismissAllTutorials(steps: TutorialStep[], dismissed: TutorialDismissed): TutorialDismissed {
  const next = { ...dismissed };
  for (const step of steps) next[step.concept] = true as const;
  return next;
}

/** Clear all dismissal so every concept replays (the replay-from-surface reset). */
export function resetTutorials(_dismissed: TutorialDismissed): TutorialDismissed {
  return {};
}

// --- Projection ------------------------------------------------------------

/** The plain data the shell renders for one tutorial prompt. */
export interface TutorialPanelView {
  title: string;
  body: string;
  /** Advance to the next concept, or close out when this is the last one. */
  advanceAction: string;
  /** Skip every remaining tutorial concept for this level. */
  skipAllAction: string;
}

/** Options that shape a tutorial prompt from its position in the level's set. */
export interface TutorialViewOptions {
  /** True when this is the last concept the level teaches. */
  isLast: boolean;
}

/**
 * Project a single step into the prompt data the shell renders. The advance
 * action reads "Next tip" while concepts remain and "Got it" on the final one,
 * so the Guardian always knows whether another concept is coming (AC2).
 */
export function buildTutorialView(step: TutorialStep, opts: TutorialViewOptions): TutorialPanelView {
  return {
    title: step.title,
    body: step.body,
    advanceAction: opts.isLast ? 'Got it' : 'Next tip',
    skipAllAction: 'Skip tutorials',
  };
}
