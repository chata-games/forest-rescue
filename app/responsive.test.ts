import { describe, it, expect } from 'vitest';
import {
  effectiveLayout,
  fitBattlefield,
  fitBattlefieldOptions,
  frameDensity,
  frameViewport,
  loadFullscreenPreference,
  loadSidewaysPreference,
  portraitAdvice,
  serializeFullscreenPreference,
  serializeSidewaysPreference,
  shouldShowPortraitAdvice,
  sidewaysActive,
  unrotatePagePoint,
  wantsImmersiveBattle,
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

  it('marks phone-height landscape frames short for compact floating controls', () => {
    expect(frameDensity(414)).toBe('short'); // iPhone 11 sideways
    expect(frameDensity(390)).toBe('short');
    expect(frameDensity(520)).toBe('short');
    expect(frameDensity(720)).toBe('regular'); // desktop
    expect(frameDensity(896)).toBe('regular'); // portrait phone (layout is portrait anyway)
  });

  it('asks for the immersive battle only on phone-short touch screens with the preference on', () => {
    expect(wantsImmersiveBattle(true, true, 844, 390)).toBe(true);
    expect(wantsImmersiveBattle(true, true, 390, 844)).toBe(true);
    // Desktop pointer: never take over the screen uninvited.
    expect(wantsImmersiveBattle(true, false, 844, 390)).toBe(false);
    // Tablet: room enough for browser chrome.
    expect(wantsImmersiveBattle(true, true, 1024, 768)).toBe(false);
    // Guardian turned it off.
    expect(wantsImmersiveBattle(false, true, 844, 390)).toBe(false);
  });

  it('defaults the fullscreen preference to on and round-trips it', () => {
    expect(loadFullscreenPreference(null)).toBe(true);
    expect(loadFullscreenPreference('garbage')).toBe(true);
    expect(loadFullscreenPreference(serializeFullscreenPreference(false))).toBe(false);
    expect(loadFullscreenPreference(serializeFullscreenPreference(true))).toBe(true);
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


describe('battlefield camera fit', () => {
  it.each([[1920, 1080], [844, 280], [390, 700], [768, 768]])(
    'keeps the whole field inside the control insets at %sx%s', (width, height) => {
      const insets = { top: 56, right: 12, bottom: 90, left: 12 };
      const fit = fitBattlefield(width, height, 1536, 1024, insets);
      expect(fit.offsetX).toBeGreaterThanOrEqual(insets.left);
      expect(fit.offsetY).toBeGreaterThanOrEqual(insets.top);
      expect(fit.offsetX + 1536 * fit.zoom).toBeLessThanOrEqual(width - insets.right + 0.001);
      expect(fit.offsetY + 1024 * fit.zoom).toBeLessThanOrEqual(height - insets.bottom + 0.001);
      // Both corners map back to the original world, even after a resize.
      for (const [x, y] of [[0, 0], [1536, 1024], [512, 300]]) {
        expect((fit.offsetX + x * fit.zoom - fit.offsetX) / fit.zoom).toBeCloseTo(x);
        expect((fit.offsetY + y * fit.zoom - fit.offsetY) / fit.zoom).toBeCloseTo(y);
      }
    },
  );

  it('uses the new available height when browser controls open', () => {
    const insets = { top: 56, right: 12, bottom: 90, left: 12 };
    const open = fitBattlefield(844, 280, 1536, 1024, insets);
    const closed = fitBattlefield(844, 390, 1536, 1024, insets);
    expect(open.zoom).toBeLessThan(closed.zoom);
    expect(open.offsetY + 1024 * open.zoom).toBeCloseTo(190);
  });
});


describe('floating corner control fit', () => {
  it('uses the taller clear centre on a short phone without hiding field edges', () => {
    const bands = { top: 56, right: 12, bottom: 74, left: 12 };
    const corridor = { top: 56, right: 238, bottom: 8, left: 198 };
    const fit = fitBattlefieldOptions(844, 280, 1584, 1024, [bands, corridor]);
    expect(fit.zoom).toBeGreaterThan(fitBattlefield(844, 280, 1584, 1024, bands).zoom);
    expect(fit.offsetX).toBeGreaterThanOrEqual(corridor.left);
    expect(fit.offsetX + 1584 * fit.zoom).toBeLessThanOrEqual(844 - corridor.right);
    expect(fit.offsetY + 1024 * fit.zoom).toBeLessThanOrEqual(272);
  });

  it('uses the full width above controls when a large deck fills the bottom', () => {
    const bands = { top: 56, right: 12, bottom: 74, left: 12 };
    const corridor = { top: 56, right: 238, bottom: 8, left: 510 };
    expect(fitBattlefieldOptions(844, 280, 1584, 1024, [bands, corridor]))
      .toEqual(fitBattlefield(844, 280, 1584, 1024, bands));
  });
});
