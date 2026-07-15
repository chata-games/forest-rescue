import { describe, it, expect } from 'vitest';
import {
  effectiveLayout,
  portraitAdvice,
  shouldShowPortraitAdvice,
} from './responsive';

// The battle shell's responsive + accessible decisions (issue #24). These are the
// pure, DOM-free rules the shell applies to each viewport/override change — kept
// out of main.ts so they are unit-tested directly, like the HUD projectors.

describe('effective layout (issue #24 AC1)', () => {
  it('uses the forced override when one is set', () => {
    expect(effectiveLayout('portrait', 400, 800)).toBe('portrait');
    expect(effectiveLayout('landscape', 400, 800)).toBe('landscape');
    expect(effectiveLayout('portrait', 1280, 720)).toBe('portrait');
  });

  it('picks the Preferred landscape layout for square-or-wider viewports in auto', () => {
    expect(effectiveLayout('auto', 1280, 720)).toBe('landscape');
    // Exactly square counts as square-or-wider (Preferred) not portrait.
    expect(effectiveLayout('auto', 768, 768)).toBe('landscape');
  });

  it('picks the Compact portrait layout for taller viewports in auto', () => {
    expect(effectiveLayout('auto', 390, 844)).toBe('portrait');
    expect(effectiveLayout('auto', 600, 901)).toBe('portrait');
  });

  it('an explicit override beats the aspect ratio', () => {
    // A tall phone forced to landscape stays landscape (the Layout toggle).
    expect(effectiveLayout('landscape', 390, 844)).toBe('landscape');
    // A wide desktop forced to portrait stays portrait.
    expect(effectiveLayout('portrait', 1280, 720)).toBe('portrait');
  });
});

describe('portrait recommendation (issue #24 AC2)', () => {
  it('offers a Best played sideways title with an immediate Play in portrait action', () => {
    const view = portraitAdvice();
    expect(view.title).toBe('Best played sideways');
    expect(view.keepAction).toBe('Play in portrait');
    expect(view.body.length).toBeGreaterThan(0);
  });

  it('shows once per session, only in the Compact portrait layout', () => {
    expect(shouldShowPortraitAdvice('portrait', false)).toBe(true);
    // Landscape never offers it.
    expect(shouldShowPortraitAdvice('landscape', false)).toBe(false);
    // Already shown this session → do not show again.
    expect(shouldShowPortraitAdvice('portrait', true)).toBe(false);
  });
});
