export function setupCanvas(canvas, wrap) {
  let width = 1;
  let height = 1;
  let dpr = 1;
  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = wrap.getBoundingClientRect();
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    width = Math.max(320, Math.floor(rect.width));
    height = Math.max(220, Math.floor(rect.height));
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
