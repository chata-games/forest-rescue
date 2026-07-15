import { describe, it, expect } from 'vitest';
import {
  STORY_BEATS,
  storyForLevel,
  storyBeatKey,
  shouldShowStory,
  markStorySeen,
  resetStory,
  buildStoryPanel,
  type StorySeen,
  type StoryKind,
} from './story';

// Engine-independent story delivery rules (issue #33). Story is optional: a level
// may carry pre- and post-battle narrative beats that are readable, skippable, and
// replayable from the campaign surface. These are the pure rules the shell and its
// vitest suite drive; the panels themselves are DOM in app/main.ts.

describe('story beats (issue #33 AC1)', () => {
  it('every shipped campaign level has a pre- and post-battle beat', () => {
    // Story is authored for the shipped campaign levels; both kinds always exist
    // so the pre/post panels are available on every level (optional, not mandatory).
    const SHIPPED = [
      '01-meadows-edge',
      '02-old-stump-crossroads',
      '03-whispering-river',
      '04-mushroom-hollow',
      '05-sawmill-clearing',
      '06-ashfall-scar',
      '07-boulder-pass',
    ];
    for (const levelId of SHIPPED) {
      expect(storyForLevel(levelId, 'pre')).not.toBeNull();
      expect(storyForLevel(levelId, 'post')).not.toBeNull();
    }
  });

  it('a beat carries a title and at least one readable line', () => {
    const beat = storyForLevel('01-meadows-edge', 'pre');
    expect(beat).not.toBeNull();
    expect(beat!.title.length).toBeGreaterThan(0);
    expect(beat!.lines.length).toBeGreaterThan(0);
    for (const line of beat!.lines) expect(line.length).toBeGreaterThan(0);
  });

  it('the pre beat of the first level names the Guardian and the threat', () => {
    const beat = storyForLevel('01-meadows-edge', 'pre');
    const text = `${beat!.title} ${beat!.lines.join(' ')}`.toLowerCase();
    // The opening beat orients a new player to who they are and what they face.
    expect(text).toMatch(/guardian/);
    expect(text).toMatch(/heartwood/);
  });

  it('an unknown level id has no story (story is optional)', () => {
    expect(storyForLevel('does-not-exist', 'pre')).toBeNull();
    expect(storyForLevel('does-not-exist', 'post')).toBeNull();
  });

  it('the STORY_BEATS catalogue is keyed by beat key', () => {
    const key = storyBeatKey('01-meadows-edge', 'pre');
    expect(STORY_BEATS[key]).toBeDefined();
    expect(STORY_BEATS[key].levelId).toBe('01-meadows-edge');
    expect(STORY_BEATS[key].kind).toBe('pre');
  });
});

describe('story seen-state (issue #33 AC1: skippable + replayable)', () => {
  it('a beat shows when it has not been seen this session', () => {
    expect(shouldShowStory({}, '01-meadows-edge', 'pre')).toBe(true);
  });

  it('a beat does not repeat after it is skipped/seen this session', () => {
    const seen = markStorySeen({}, '01-meadows-edge', 'pre');
    expect(shouldShowStory(seen, '01-meadows-edge', 'pre')).toBe(false);
    // Other kinds/levels are unaffected.
    expect(shouldShowStory(seen, '01-meadows-edge', 'post')).toBe(true);
    expect(shouldShowStory(seen, '02-old-stump-crossroads', 'pre')).toBe(true);
  });

  it('markStorySeen is pure (returns a new record, input untouched)', () => {
    const before: StorySeen = {};
    const after = markStorySeen(before, '05-sawmill-clearing', 'post');
    expect(after).not.toBe(before);
    expect(before).toEqual({});
    expect(shouldShowStory(after, '05-sawmill-clearing', 'post')).toBe(false);
  });

  it('resetStory clears all seen beats so every panel replays', () => {
    let seen: StorySeen = markStorySeen({}, '01-meadows-edge', 'pre');
    seen = markStorySeen(seen, '01-meadows-edge', 'post');
    const reset = resetStory(seen);
    expect(shouldShowStory(reset, '01-meadows-edge', 'pre')).toBe(true);
    expect(shouldShowStory(reset, '01-meadows-edge', 'post')).toBe(true);
  });

  it('a level with no story never shows (even unseen)', () => {
    expect(shouldShowStory({}, 'no-such-level', 'pre')).toBe(false);
  });
});

describe('story panel projection (issue #33 AC1)', () => {
  it('projects a readable panel with a primary and a skip action', () => {
    const view = buildStoryPanel(storyForLevel('01-meadows-edge', 'pre')!);
    expect(view.title.length).toBeGreaterThan(0);
    expect(view.body.length).toBeGreaterThan(0);
    expect(view.primaryAction.length).toBeGreaterThan(0);
    expect(view.skipAction.length).toBeGreaterThan(0);
  });

  it('the post-battle panel primary action reads as onward/return, not begin', () => {
    const pre = buildStoryPanel(storyForLevel('01-meadows-edge', 'pre')!);
    const post = buildStoryPanel(storyForLevel('01-meadows-edge', 'post')!);
    expect(pre.primaryAction.toLowerCase()).toMatch(/begin|start|enter/);
    expect(post.primaryAction.toLowerCase()).toMatch(/continue|onward|return/);
  });
});

// Type-level sanity: the kind union is exactly the two beat kinds.
describe('storyBeatKey', () => {
  it('joins level id and kind into a stable key', () => {
    const pre: StoryKind = 'pre';
    const post: StoryKind = 'post';
    expect(storyBeatKey('05-sawmill-clearing', pre)).toBe('05-sawmill-clearing:pre');
    expect(storyBeatKey('05-sawmill-clearing', post)).toBe('05-sawmill-clearing:post');
  });
});
