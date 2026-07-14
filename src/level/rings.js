import { dist } from "../engine/geometry.js";
import { PathCurve } from "./path.js";

export function ringAt(x, y, options = {}) {
  return {
    id: options.id || `ring-${Math.round(x)}-${Math.round(y)}`,
    x,
    y,
    role: options.role || "support",
    placement: options.placement || "beside-path",
    radius: options.radius || 48,
    buildRadius: options.buildRadius || 42,
  };
}

export function hitTestRing(rings, wx, wy) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    if (dist(wx, wy, r.x, r.y) <= r.buildRadius) return r;
  }
  return null;
}

export function ringsOverlap(a, b, margin = 8) {
  return dist(a.x, a.y, b.x, b.y) < (a.buildRadius + b.buildRadius + margin);
}

export function pathCoverageForRing(path, ring, defenderRange) {
  return path.coverageInRadius(ring.x, ring.y, defenderRange);
}

export function generateRingCandidates(path, rng, options = {}) {
  const {
    sampleSpacing = 85,
    offsets = [70, 110, 150],
    minSeparation = 95,
    maxRings = 12,
    roles = ["frontline", "chokepoint", "support", "long-range", "gate-defense"],
  } = options;

  const candidates = [];
  for (let s = 40; s < path.length - 40; s += sampleSpacing) {
    const pos = path.positionAt(s);
    const n = path.normalAt(s, "left");
    for (const off of offsets) {
      for (const side of ["left", "right"]) {
        const nn = side === "left" ? n : { x: -n.x, y: -n.y };
        const x = pos.x + nn.x * off;
        const y = pos.y + nn.y * off;
        if (x < 80 || y < 80 || x > 1456 || y > 944) continue;
        const coverage = path.coverageInRadius(x, y, 160);
        let role = "support";
        if (s < path.length * 0.25) role = "frontline";
        else if (s > path.length * 0.85) role = "gate-defense";
        else if (coverage > 0.18) role = "chokepoint";
        else if (off >= 130) role = "long-range";
        candidates.push(ringAt(x, y, { role, placement: "beside-path" }));
      }
    }
  }

  const selected = [];
  const shuffled = candidates.sort(() => rng() - 0.5);
  for (const c of shuffled) {
    if (selected.some((r) => ringsOverlap(r, c, minSeparation))) continue;
    const onPath = path.distanceAlong(c.x, c.y).distance < path.width * 0.6;
    if (onPath) continue;
    selected.push(c);
    if (selected.length >= maxRings) break;
  }

  const roleCounts = {};
  for (const r of selected) {
    roleCounts[r.role] = (roleCounts[r.role] || 0) + 1;
  }
  return { rings: selected, roleCounts };
}

export function ringsFromLevel(level) {
  return (level.rings || []).map((r) => ringAt(r.x, r.y, r));
}
