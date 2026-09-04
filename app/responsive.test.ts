import { describe, it, expect } from 'vitest';
import {
  effectiveLayout,
  frameDensity,
  frameViewport,
  loadSidewaysPreference,
  portraitAdvice,
  serializeSidewaysPreference,
  shouldShowPortraitAdvice,
  sidewaysActive,
  unrotatePagePoint,
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

  it('offers a Rotate-the-screen action and names the iPhone orientation lock (RP-eqbawv)', () => {
    const view = portraitAdvice();
    expect(view.rotateAction).toBe('Rotate the screen');
    expect(view.body).toContain('Portrait Orientation Lock');
  });

  it('shows once per session, only in the Compact portrait layout', () => {
    expect(shouldShowPortraitAdvice('portrait', false)).toBe(true);
    // Landscape never offers it.
    expect(shouldShowPortraitAdvice('landscape', false)).toBe(false);
    // Already shown this session → do not show again.
    expect(shouldShowPortraitAdvice('portrait', true)).toBe(false);
  });
});

describe('Sideways mode (RP-eqbawv)', () => {
  it('round-trips the persisted preference and defaults to off', () => {
    expect(loadSidewaysPreference(null)).toBe(false);
    expect(loadSidewaysPreference('garbage')).toBe(false);
    expect(loadSidewaysPreference(serializeSidewaysPreference(true))).toBe(true);
    expect(loadSidewaysPreference(serializeSidewaysPreference(false))).toBe(false);
  });

  it('rotates only when the preference is on and the viewport is physically portrait', () => {
    expect(sidewaysActive(true, 390, 844)).toBe(true);
    // The phone did rotate on its own: never rotate the frame a second time.
    expect(sidewaysActive(true, 844, 390)).toBe(false);
    expect(sidewaysActive(true, 800, 800)).toBe(false);
    expect(sidewaysActive(false, 390, 844)).toBe(false);
  });

  it('marks phone-height landscape frames short so the toolbars move into a rail', () => {
    expect(frameDensity(414)).toBe('short'); // iPhone 11 sideways
    expect(frameDensity(390)).toBe('short');
    expect(frameDensity(520)).toBe('short');
    expect(frameDensity(720)).toBe('regular'); // desktop
    expect(frameDensity(896)).toBe('regular'); // portrait phone (layout is portrait anyway)
  });

  it('presents the rotated frame as a landscape viewport to the layout rules', () => {
    expect(frameViewport(true, 390, 844)).toEqual({ width: 844, height: 390 });
    expect(frameViewport(false, 390, 844)).toEqual({ width: 390, height: 844 });
    expect(effectiveLayout('auto', 844, 390)).toBe('landscape');
  });

  it('maps screen taps back onto the unrotated frame', () => {
    // A 300x200 (layout) canvas rotated clockwise occupies a 200-wide, 300-tall
    // screen box at (50, 100).
    const box = { left: 50, top: 100, width: 200, height: 300 };
    // The frame's top-left corner sits at the screen box's top-right corner.
    expect(unrotatePagePoint(box, 250, 100)).toEqual({ x: 50, y: 100 });
    // The frame's top-right corner (layout x=300) sits at the screen box's bottom-right.
    expect(unrotatePagePoint(box, 250, 400)).toEqual({ x: 350, y: 100 });
    // The frame's bottom-left corner (layout y=200) sits at the screen box's top-left.
    expect(unrotatePagePoint(box, 50, 100)).toEqual({ x: 50, y: 300 });
    // The centre maps to the centre.
    expect(unrotatePagePoint(box, 150, 250)).toEqual({ x: 200, y: 200 });
  });
});
