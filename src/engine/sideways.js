// Sideways mode (RP-eqbawv).
//
// iPhone browsers never rotate while Portrait Orientation Lock is on, and WebKit
// gives a page no orientation lock, no fullscreen for page content, and ignores
// the manifest orientation. When the player asks for it and the viewport is
// physically portrait, body[data-sideways="true"] rotates the whole .app frame 90
// degrees clockwise (styles.css): the browser stays portrait, the player holds
// the phone with its top to the left and sees a landscape game.
//
// DOM controls hit-test correctly under the transform on their own. Canvas code
// measures itself and reads pointer positions in screen space, which the rotation
// swaps, so it asks this module for frame sizes and frame-local pointer points.
// The helpers below are pure so they can be unit-tested in Node; createSideways
// binds them to a document + window.

const KEY = "forest-rescue-sideways";

/** Layout size of an element from its screen-space rect. */
export function frameSizeFor(active, rect) {
  return active
    ? { width: rect.height, height: rect.width }
    : { width: rect.width, height: rect.height };
}

/**
 * Frame-local point (as the unrotated layout sees it) of a screen-space client
 * point, for an element with screen-space rect `rect`. The frame's top edge runs
 * along the screen's right edge: local x runs down the screen, local y runs from
 * right to left.
 */
export function localPointFor(active, rect, clientX, clientY) {
  if (!active) return { x: clientX - rect.left, y: clientY - rect.top };
  return { x: clientY - rect.top, y: rect.left + rect.width - clientX };
}

/** Rotate only when the preference is on AND the viewport is physically portrait. */
export function isSidewaysActive(enabled, innerWidth, innerHeight) {
  return Boolean(enabled) && innerHeight > innerWidth;
}

export function createSideways(dom, win) {
  let enabled = read();

  function read() {
    try {
      return win.localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  }

  function write() {
    try {
      win.localStorage.setItem(KEY, enabled ? "1" : "0");
    } catch {
      /* localStorage may be unavailable — the preference stays in-memory. */
    }
  }

  function active() {
    return isSidewaysActive(enabled, win.innerWidth, win.innerHeight);
  }

  function apply() {
    dom.body.dataset.sideways = active() ? "true" : "false";
  }

  function set(on) {
    enabled = Boolean(on);
    write();
    apply();
    // The frame changed size without the window resizing: every canvas listens
    // to resize to re-measure, so fire one.
    win.dispatchEvent(new Event("resize"));
  }

  win.addEventListener("resize", apply);
  apply();

  return {
    get enabled() {
      return enabled;
    },
    active,
    set,
    toggle: () => set(!enabled),
    frameSize: (rect) => frameSizeFor(active(), rect),
    viewportSize: () =>
      active()
        ? { width: win.innerHeight, height: win.innerWidth }
        : { width: win.innerWidth, height: win.innerHeight },
    localPoint: (rect, clientX, clientY) => localPointFor(active(), rect, clientX, clientY),
  };
}

let shared = null;

/** The page-wide Sideways controller (one per document). */
export function getSideways(dom, win) {
  if (!shared) shared = createSideways(dom, win ?? dom.defaultView);
  return shared;
}
