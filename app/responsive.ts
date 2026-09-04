// Pure responsive + accessibility decisions for the battle shell (issue #24).
// DOM-free rules the shell applies on every viewport/override change — kept out
// of main.ts so they are unit-tested directly, like the HUD projectors.

/** The two battle layouts: Preferred landscape vs. Compact portrait. */
export type LayoutMode = 'landscape' | 'portrait';

/** An author/`?layout=` override, or 'auto' to follow the viewport aspect. */
export type LayoutOverride = 'auto' | LayoutMode;

/**
 * The effective battle layout (issue #24 AC1). A forced override (the author
 * `?layout=` param or the Layout button) wins; otherwise the viewport's aspect
 * ratio decides — square-or-wider is the Preferred landscape layout, a taller
 * viewport is the Compact portrait layout that scales the battlefield and
 * reflows the HUD.
 */
export function effectiveLayout(
  override: LayoutOverride,
  width: number,
  height: number,
): LayoutMode {
  if (override === 'portrait') return 'portrait';
  if (override === 'landscape') return 'landscape';
  // Square (width === height) counts as square-or-wider → the Preferred layout.
  return width >= height ? 'landscape' : 'portrait';
}

/** The once-per-session portrait recommendation shown at battle entry (AC2). */
export interface PortraitAdviceView {
  /** Heading line. */
  title: string;
  /** Short explanation that landscape is preferred and portrait stays usable. */
  body: string;
  /** Action that keeps portrait play and dismisses the advice for the session. */
  keepAction: string;
  /** Action that turns Sideways mode on: the frame rotates to landscape in place. */
  rotateAction: string;
}

/**
 * The "Best played sideways" recommendation offered once per session when a
 * battle is entered in portrait (issue #24 AC2). The immediately available
 * "Play in portrait" action dismisses it without leaving the battle.
 */
export function portraitAdvice(): PortraitAdviceView {
  return {
    title: 'Best played sideways',
    body:
      'Two-thumb landscape play is preferred. Rotate your device for the full battlefield, or keep playing in portrait. ' +
      'If your phone does not rotate, turn off Portrait Orientation Lock in Control Center, or let the game rotate the screen for you.',
    keepAction: 'Play in portrait',
    rotateAction: 'Rotate the screen',
  };
}

/**
 * Whether the portrait recommendation should appear (issue #24 AC2): only in the
 * Compact portrait layout and only once per session.
 */
export function shouldShowPortraitAdvice(layout: LayoutMode, shownThisSession: boolean): boolean {
  return layout === 'portrait' && !shownThisSession;
}

// --- Sideways mode (RP-eqbawv) ---------------------------------------------
// iPhone browsers never rotate while Portrait Orientation Lock is on, and WebKit
// offers no orientation lock or fullscreen for page content. Sideways mode
// answers this by rotating the battle frame 90 degrees with CSS: the browser
// stays portrait, the Guardian holds the phone sideways and sees the Preferred
// landscape layout. These are the pure rules; the shell applies them.

/** The persisted Sideways preference: the raw storage value, or nothing. */
export function loadSidewaysPreference(raw: string | null): boolean {
  return raw === '1';
}

export function serializeSidewaysPreference(on: boolean): string {
  return on ? '1' : '0';
}

/**
 * Whether the frame is rotated right now: only when the preference is on AND the
 * viewport is physically portrait. A phone that does rotate to landscape leaves
 * the frame alone, so the game is never rotated twice.
 */
export function sidewaysActive(preference: boolean, width: number, height: number): boolean {
  return preference && height > width;
}

/** The viewport as the (possibly rotated) frame sees it. */
export function frameViewport(
  sideways: boolean,
  width: number,
  height: number,
): { width: number; height: number } {
  return sideways ? { width: height, height: width } : { width, height };
}

/** How much vertical room the frame has: a phone held landscape is 'short'. */
export type FrameDensity = 'short' | 'regular';

/** Frames up to this many CSS pixels tall get the compact landscape layout. */
export const SHORT_FRAME_MAX_HEIGHT = 520;

/**
 * A landscape phone (or the Sideways frame, which is only as tall as the phone
 * is wide) leaves no room for a two-row HUD and a bottom toolbar: the compact
 * layout moves the toolbars into a side rail so the battlefield keeps the height.
 */
export function frameDensity(frameHeight: number): FrameDensity {
  return frameHeight <= SHORT_FRAME_MAX_HEIGHT ? 'short' : 'regular';
}

/** A screen-space box, as `getBoundingClientRect` reports it (page offsets applied). */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Map a screen-space page point onto the unrotated frame of a 90-degree
 * clockwise rotated element, expressed as the page point Phaser would have seen
 * without the rotation. `box` is the element's screen-space bounds, so its width
 * is the element's layout height. The element's top edge lies along the screen's
 * right edge: local x runs down the screen, local y runs from right to left.
 */
export function unrotatePagePoint(
  box: ScreenBox,
  pageX: number,
  pageY: number,
): { x: number; y: number } {
  return {
    x: box.left + (pageY - box.top),
    y: box.top + (box.left + box.width - pageX),
  };
}
