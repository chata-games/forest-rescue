import { dist, lerp, normalize, perpLeft } from "../engine/geometry.js";

const SAMPLE_SPACING = 8;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export class PathCurve {
  constructor(controlPoints, options = {}) {
    this.id = options.id || "main";
    this.controlPoints = controlPoints.map((p) => ({ x: p.x ?? p[0], y: p.y ?? p[1] }));
    this.width = options.width || 92;
    this.samples = [];
    this.arcLengths = [];
    this.length = 0;
    this._build();
  }

  _build() {
    const cps = this.controlPoints;
    if (cps.length < 2) return;

    const dense = [];
    const segments = cps.length - 1;
    for (let i = 0; i < segments; i++) {
      const p0 = cps[Math.max(0, i - 1)];
      const p1 = cps[i];
      const p2 = cps[i + 1];
      const p3 = cps[Math.min(cps.length - 1, i + 2)];
      const steps = Math.max(4, Math.ceil(dist(p1.x, p1.y, p2.x, p2.y) / 4));
      for (let s = 0; s < steps; s++) {
        dense.push(catmullRom(p0, p1, p2, p3, s / steps));
      }
    }
    dense.push({ ...cps[cps.length - 1] });

    this.samples = [dense[0]];
    this.arcLengths = [0];
    let total = 0;
    for (let i = 1; i < dense.length; i++) {
      const d = dist(dense[i - 1].x, dense[i - 1].y, dense[i].x, dense[i].y);
      if (d < 0.5) continue;
      total += d;
      this.samples.push(dense[i]);
      this.arcLengths.push(total);
    }
    this.length = total;

    if (this.samples.length < 2) return;
    const resampled = [this.samples[0]];
    const arcs = [0];
    let acc = 0;
    let si = 1;
    while (si < this.samples.length) {
      const target = acc + SAMPLE_SPACING;
      while (si < this.samples.length && this.arcLengths[si] < target) si++;
      if (si >= this.samples.length) break;
      const a = this.samples[si - 1];
      const b = this.samples[si];
      const segLen = this.arcLengths[si] - this.arcLengths[si - 1];
      const t = segLen > 0 ? (target - this.arcLengths[si - 1]) / segLen : 0;
      resampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      acc = target;
    }
    const last = this.samples[this.samples.length - 1];
    if (dist(resampled[resampled.length - 1].x, resampled[resampled.length - 1].y, last.x, last.y) > 1) {
      resampled.push({ ...last });
    }
    this.samples = resampled;
    this.arcLengths = [];
    acc = 0;
    this.arcLengths.push(0);
    for (let i = 1; i < this.samples.length; i++) {
      acc += dist(this.samples[i - 1].x, this.samples[i - 1].y, this.samples[i].x, this.samples[i].y);
      this.arcLengths.push(acc);
    }
    this.length = acc;
  }

  positionAt(s) {
    if (!this.samples.length) return { x: 0, y: 0 };
    if (s <= 0) return { ...this.samples[0] };
    if (s >= this.length) return { ...this.samples[this.samples.length - 1] };
    let lo = 0;
    let hi = this.arcLengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.arcLengths[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = this.samples[i - 1];
    const b = this.samples[i];
    const segStart = this.arcLengths[i - 1];
    const segLen = this.arcLengths[i] - segStart;
    const t = segLen > 0 ? (s - segStart) / segLen : 0;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  tangentAt(s) {
    const eps = 4;
    const p1 = this.positionAt(Math.max(0, s - eps));
    const p2 = this.positionAt(Math.min(this.length, s + eps));
    return normalize(p2.x - p1.x, p2.y - p1.y);
  }

  normalAt(s, side = "left") {
    const t = this.tangentAt(s);
    const n = perpLeft(t.x, t.y);
    return side === "right" ? { x: -n.x, y: -n.y } : n;
  }

  distanceAlong(px, py) {
    let best = Infinity;
    let bestS = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + t * dx;
      const qy = a.y + t * dy;
      const d = dist(px, py, qx, qy);
      if (d < best) {
        best = d;
        bestS = this.arcLengths[i - 1] + t * (this.arcLengths[i] - this.arcLengths[i - 1]);
      }
    }
    return { distance: best, s: bestS };
  }

  coverageInRadius(cx, cy, radius, step = 12) {
    let covered = 0;
    let total = this.length;
    for (let s = 0; s <= this.length; s += step) {
      const p = this.positionAt(s);
      if (dist(cx, cy, p.x, p.y) <= radius) covered += step;
    }
    return total > 0 ? Math.min(1, covered / total) : 0;
  }

  toJSON() {
    return {
      id: this.id,
      controlPoints: this.controlPoints,
      samples: this.samples,
      arcLengths: this.arcLengths,
      width: this.width,
      length: this.length,
    };
  }

  static fromJSON(data) {
    const path = new PathCurve(data.controlPoints, { id: data.id, width: data.width });
    if (data.samples?.length && data.arcLengths?.length) {
      path.samples = data.samples;
      path.arcLengths = data.arcLengths;
      path.length = data.arcLengths[data.arcLengths.length - 1] || 0;
    }
    return path;
  }
}

export function pathsFromLevel(level) {
  return (level.paths || []).map((p) => PathCurve.fromJSON(p));
}
