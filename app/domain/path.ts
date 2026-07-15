// Arc-length-parametrised trail built directly from a CompiledPath.
// We consume the compiler's pre-computed samples/arcLengths verbatim so that
// the production stack never re-derives geometry and stays bit-identical to the
// validated CompiledLevel.

import type { CompiledPath, Vec2 } from './types';
import { clamp, lerp } from './geometry';

export class PathCurve {
  readonly id: string;
  readonly width: number;
  readonly samples: ReadonlyArray<Vec2>;
  readonly arcLengths: ReadonlyArray<number>;
  readonly length: number;

  constructor(data: CompiledPath) {
    this.id = data.id;
    this.width = data.width;
    this.samples = data.samples;
    this.arcLengths = data.arcLengths;
    this.length = data.length || this.arcLengths[this.arcLengths.length - 1] || 0;
  }

  /** World position at arc-length s along the trail. */
  positionAt(s: number): Vec2 {
    const samples = this.samples;
    if (samples.length === 0) return { x: 0, y: 0 };
    if (s <= 0) return { ...samples[0] };
    if (s >= this.length) return { ...samples[samples.length - 1] };

    const arcs = this.arcLengths;
    let lo = 0;
    let hi = arcs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = samples[i - 1];
    const b = samples[i];
    const segStart = arcs[i - 1];
    const segLen = arcs[i] - segStart;
    const t = segLen > 0 ? (s - segStart) / segLen : 0;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  /** Unit tangent direction at arc-length s. */
  tangentAt(s: number): Vec2 {
    const eps = 4;
    const p1 = this.positionAt(Math.max(0, s - eps));
    const p2 = this.positionAt(Math.min(this.length, s + eps));
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  /** Nearest arc-length to a world point, with the perpendicular distance. */
  distanceAlong(px: number, py: number): { distance: number; s: number } {
    let best = Infinity;
    let bestS = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
      t = clamp(t, 0, 1);
      const qx = a.x + t * dx;
      const qy = a.y + t * dy;
      const d = Math.hypot(px - qx, py - qy);
      if (d < best) {
        best = d;
        bestS = this.arcLengths[i - 1] + t * (this.arcLengths[i] - this.arcLengths[i - 1]);
      }
    }
    return { distance: best, s: bestS };
  }
}
