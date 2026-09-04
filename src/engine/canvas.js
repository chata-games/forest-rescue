/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} wrap
 * @param {object} [sideways] Sideways-mode controller (RP-eqbawv): while the frame
 *   is rotated, screen-space measurements have their axes swapped and this maps
 *   them back. Omit for an unrotated page.
 */
export function setupCanvas(canvas, wrap, sideways = null) {
  let width = 1;
  let height = 1;
  let dpr = 1;
  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const frame = sideways ? sideways.frameSize(rect) : { width: rect.width, height: rect.height };
    const viewport = sideways
      ? sideways.viewportSize()
      : { width: window.innerWidth, height: window.innerHeight };
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    // Clamp to the viewport: an upstream layout bug must never push the
    // playfield (spawn rings, pause, mute) off-screen.
    width = Math.max(320, Math.min(Math.floor(frame.width), viewport.width));
    height = Math.max(220, Math.min(Math.floor(frame.height), viewport.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, dpr };
  }

  return {
    canvas,
    ctx,
    get width() { return width; },
    get height() { return height; },
    get dpr() { return dpr; },
    resize,
  };
}

/** Clear every backing-store pixel without depending on the active DPI transform. */
export function clearCanvasFrame(ctx) {
  ctx.save();
  ctx.resetTransform();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export function isInsideWorld(point) {
  return point.x >= 0 && point.x <= WORLD_W && point.y >= 0 && point.y <= WORLD_H;
}

export const WORLD_W = 1536;
export const WORLD_H = 1024;

export function worldToScreen(x, y, viewW, viewH) {
  const scale = Math.min(viewW / WORLD_W, viewH / WORLD_H);
  const ox = (viewW - WORLD_W * scale) / 2;
  const oy = (viewH - WORLD_H * scale) / 2;
  return { x: ox + x * scale, y: oy + y * scale, scale, ox, oy };
}

export function screenToWorld(sx, sy, viewW, viewH) {
  const { scale, ox, oy } = worldToScreen(0, 0, viewW, viewH);
  return { x: (sx - ox) / scale, y: (sy - oy) / scale, scale };
}
