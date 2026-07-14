import { pathsFromLevel } from "../level/path.js";

export function drawDebugOverlay(ctx, level, paths, options = {}) {
  const { showCoverage = true, showChokepoints = true } = options;
  ctx.save();
  for (const path of paths) {
    ctx.strokeStyle = "rgba(255,255,100,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let s = 0; s <= path.length; s += 20) {
      const p = path.positionAt(s);
      if (s === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (showCoverage) {
    for (const ring of level.rings || []) {
      ctx.strokeStyle = "rgba(100,220,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 160, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (showChokepoints && level.metrics?.chokepoints) {
    ctx.fillStyle = "rgba(255,100,100,0.8)";
    for (const ring of (level.rings || []).filter((r) => r.role === "chokepoint")) {
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function isDebugMode() {
  return new URLSearchParams(window.location.search).has("debug");
}
