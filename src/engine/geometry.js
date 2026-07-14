export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function distPointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

export function perpLeft(x, y) {
  return { x: -y, y: x };
}

export function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function segmentsIntersect(a1, a2, b1, b2) {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

export function poissonDisk(rng, bounds, minDist, maxAttempts = 30) {
  const points = [];
  const cell = minDist / Math.SQRT2;
  const cols = Math.ceil(bounds.w / cell);
  const rows = Math.ceil(bounds.h / cell);
  const grid = new Array(cols * rows).fill(null);

  function gridIndex(x, y) {
    return Math.floor((y - bounds.y) / cell) * cols + Math.floor((x - bounds.x) / cell);
  }

  function farEnough(x, y) {
    const gi = gridIndex(x, y);
    const cx = gi % cols;
    const cy = Math.floor(gi / cols);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const p = grid[ny * cols + nx];
        if (p && dist(x, y, p.x, p.y) < minDist) return false;
      }
    }
    return true;
  }

  const first = {
    x: bounds.x + rng() * bounds.w,
    y: bounds.y + rng() * bounds.h,
  };
  points.push(first);
  grid[gridIndex(first.x, first.y)] = first;
  const active = [first];

  while (active.length && points.length < 500) {
    const idx = Math.floor(rng() * active.length);
    const center = active[idx];
    let placed = false;
    for (let a = 0; a < maxAttempts; a++) {
      const angle = rng() * Math.PI * 2;
      const radius = minDist + rng() * minDist;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (x < bounds.x || y < bounds.y || x > bounds.x + bounds.w || y > bounds.y + bounds.h) continue;
      if (!farEnough(x, y)) continue;
      const p = { x, y };
      points.push(p);
      grid[gridIndex(x, y)] = p;
      active.push(p);
      placed = true;
      break;
    }
    if (!placed) active.splice(idx, 1);
  }
  return points;
}
