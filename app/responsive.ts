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
}

/**
 * The "Best played sideways" recommendation offered once per session when a
 * battle is entered in portrait (issue #24 AC2). The immediately available
 * "Play in portrait" action dismisses it without leaving the battle.
 */
export function portraitAdvice(): PortraitAdviceView {
  return {
    title: 'Best played sideways',
    body: 'Two-thumb landscape play is preferred. Rotate your device for the full battlefield, or keep playing in portrait.',
    keepAction: 'Play in portrait',
  };
}

/**
 * Whether the portrait recommendation should appear (issue #24 AC2): only in the
 * Compact portrait layout and only once per session.
 */
export function shouldShowPortraitAdvice(layout: LayoutMode, shownThisSession: boolean): boolean {
  return layout === 'portrait' && !shownThisSession;
}
