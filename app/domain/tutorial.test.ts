import { describe, it, expect } from 'vitest';
import {
  TUTORIAL_CONCEPTS,
  tutorialConceptsFor,
  tutorialStepsFor,
  currentTutorialStep,
  dismissTutorial,
  dismissAllTutorials,
  resetTutorials,
  buildTutorialView,
  type TutorialDismissed,
  type TutorialInput,
} from './tutorial';

// Engine-independent tutorial delivery rules (issue #33). Tutorials teach one
// concept at a time, can be skipped or replayed, and never appear as mandatory
// overlays during active defense — the shell surfaces them in the planning phase
// only. These pure rules are driven by the shell and this vitest suite.

function level1(): TutorialInput {
  // Meadow's Edge: the opening tutorial level.
  return { learningGoal: 'placement-and-chopping', levelModifiers: ['tutorial-chopping'] };
}

describe('tutorial concepts per level (issue #33 AC2)', () => {
  it('resolves ordered concepts from a level learning goal + modifiers', () => {
    expect(tutorialConceptsFor(level1())).toEqual(['placement', 'blocking']);
  });

  it('dedupes a concept that appears in both the goal and a modifier', () => {
    // 'placement-and-chopping' → placement, blocking; 'tutorial-chopping' → blocking again.
    const concepts = tutorialConceptsFor(level1());
    expect(concepts.filter((c) => c === 'blocking')).toHaveLength(1);
  });

  it('every resolved concept has exactly one step in the catalogue', () => {
    for (const concept of tutorialConceptsFor(level1())) {
      const step = TUTORIAL_CONCEPTS[concept];
      expect(step).toBeDefined();
      expect(step.concept).toBe(concept);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('tutorialStepsFor returns one step per resolved concept, in order', () => {
    const steps = tutorialStepsFor(level1());
    expect(steps.map((s) => s.concept)).toEqual(['placement', 'blocking']);
  });

  it('a level with an unknown learning goal gets no tutorial (optional)', () => {
    expect(tutorialStepsFor({ learningGoal: 'something-new', levelModifiers: [] })).toEqual([]);
    expect(tutorialStepsFor({})).toEqual([]);
  });

  it('recognizes mana and spell concepts from later levels', () => {
    const mana = tutorialConceptsFor({ learningGoal: 'mana-collection' });
    expect(mana).toContain('mana');
    const spells = tutorialConceptsFor({ learningGoal: 'spell-targeting', levelModifiers: ['tutorial-spells'] });
    expect(spells).toContain('spells');
  });

  it('teaches air coverage for the Whispering River level (issue #35 AC4)', () => {
    // Whispering River's authored learning goal; air-coverage must resolve to a
    // tutorial concept so the level teaches air coverage (not just story).
    const concepts = tutorialConceptsFor({ learningGoal: 'air-coverage', levelModifiers: ['river-crossings'] });
    expect(concepts).toContain('air-coverage');
    const steps = tutorialStepsFor({ learningGoal: 'air-coverage', levelModifiers: ['river-crossings'] });
    expect(steps.map((s) => s.concept)).toContain('air-coverage');
    // Dedup: 'air' and 'coverage' both map to the one air-coverage concept.
    expect(concepts.filter((c) => c === 'air-coverage')).toHaveLength(1);
  });

  it('resolves the split-pressure concept for Old Stump Crossroads (issue #34 AC4)', () => {
    // Level 02 (two-path-merge) teaches divided attention. Story alone does not
    // satisfy "teach split pressure", so the learning goal must resolve to a tip.
    const concepts = tutorialConceptsFor({ learningGoal: 'split-pressure', levelModifiers: [] });
    expect(concepts).toContain('split-pressure');
    const step = TUTORIAL_CONCEPTS['split-pressure'];
    expect(step).toBeDefined();
    expect(step.concept).toBe('split-pressure');
    expect(step.title.length).toBeGreaterThan(0);
    expect(step.body.length).toBeGreaterThan(0);
  });

  it('teaches light management for the Mushroom Hollow learning goal (issue #36 AC4)', () => {
    const concepts = tutorialConceptsFor({ learningGoal: 'light-management', levelModifiers: ['darkness'] });
    expect(concepts).toContain('light');
    const steps = tutorialStepsFor({ learningGoal: 'light-management', levelModifiers: ['darkness'] });
    expect(steps.map((s) => s.concept)).toEqual(['light']);
  });
});

describe('tutorial one-concept-at-a-time sequencing (issue #33 AC2)', () => {
  it('the current step is the first not-yet-dismissed concept', () => {
    const steps = tutorialStepsFor(level1());
    expect(currentTutorialStep(steps, {})?.concept).toBe('placement');
    const afterFirst = dismissTutorial({}, 'placement');
    expect(currentTutorialStep(steps, afterFirst)?.concept).toBe('blocking');
  });

  it('returns null once every concept is dismissed', () => {
    const steps = tutorialStepsFor(level1());
    let dismissed: TutorialDismissed = {};
    for (const step of steps) dismissed = dismissTutorial(dismissed, step.concept);
    expect(currentTutorialStep(steps, dismissed)).toBeNull();
  });

  it('dismissTutorial is pure (input untouched)', () => {
    const before: TutorialDismissed = {};
    const after = dismissTutorial(before, 'placement');
    expect(before).toEqual({});
    expect(after).toEqual({ placement: true });
  });

  it('dismissAllTutorials dismisses every concept in a level at once', () => {
    const steps = tutorialStepsFor(level1());
    const dismissed = dismissAllTutorials(steps, {});
    expect(currentTutorialStep(steps, dismissed)).toBeNull();
    // Only this level's concepts are touched — concept independence.
    expect(dismissed).toEqual({ placement: true, blocking: true });
  });

  it('resetTutorials clears dismissal so every concept replays', () => {
    const steps = tutorialStepsFor(level1());
    let dismissed = dismissAllTutorials(steps, {});
    dismissed = resetTutorials(dismissed);
    expect(currentTutorialStep(steps, dismissed)?.concept).toBe('placement');
  });
});

describe('tutorial panel projection (issue #33 AC2)', () => {
  it('projects a one-concept panel with an advance and a skip-all action', () => {
    const steps = tutorialStepsFor(level1());
    const view = buildTutorialView(steps[0]!, { isLast: false });
    expect(view.title.length).toBeGreaterThan(0);
    expect(view.body.length).toBeGreaterThan(0);
    expect(view.advanceAction.length).toBeGreaterThan(0);
    expect(view.skipAllAction.length).toBeGreaterThan(0);
  });

  it('the advance action differs when more concepts remain vs. the last one', () => {
    const steps = tutorialStepsFor(level1());
    const first = buildTutorialView(steps[0]!, { isLast: false });
    const last = buildTutorialView(steps[steps.length - 1]!, { isLast: true });
    // The first step's advance invites the next concept; the last one closes out.
    expect(first.advanceAction).toBe('Next tip');
    expect(last.advanceAction).toBe('Got it');
  });
});
