import { WORLD_W, WORLD_H } from "../engine/canvas.js";
import { getBiome } from "../content/biomes.js";
import { pathsFromLevel } from "../level/path.js";
import { drawHp } from "./draw-utils.js";

export function createBattlefieldRenderer(level, catalog, options = {}) {
  const biome = getBiome(level.biome);
  const paths = pathsFromLevel(level);
  const debug = options.debug || false;
  const staticCanvas = document.createElement("canvas");
  staticCanvas.width = WORLD_W;
  staticCanvas.height = WORLD_H;
  const sctx = staticCanvas.getContext("2d");
  let built = false;

  function buildStatic() {
    sctx.fillStyle = biome.baseColor;
    sctx.fillRect(0, 0, WORLD_W, WORLD_H);
    drawNoise(sctx, biome);
    drawWaterMasks(sctx, level, biome);
    for (const path of paths) drawPath(sctx, path, biome);
    for (const lm of level.landmarks || []) drawLandmark(sctx, lm, catalog);
    for (const dec of level.decorations || []) drawDecoration(sctx, dec, biome);
    for (const ring of level.rings || []) drawRingSpot(sctx, ring);
    built = true;
  }

  function render(ctx, viewW, viewH, transform) {
    if (!built) buildStatic();
    const scale = Math.min(viewW / WORLD_W, viewH / WORLD_H);
    const ox = (viewW - WORLD_W * scale) / 2;
    const oy = (viewH - WORLD_H * scale) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.drawImage(staticCanvas, 0, 0);

    if (debug) drawDebug(ctx, level, paths);
    if (transform) transform(ctx, scale);
    ctx.restore();

    return { scale, ox, oy };
  }

  function worldToScreen(x, y, viewW, viewH) {
    const scale = Math.min(viewW / WORLD_W, viewH / WORLD_H);
    const ox = (viewW - WORLD_W * scale) / 2;
    const oy = (viewH - WORLD_H * scale) / 2;
    return { x: ox + x * scale, y: oy + y * scale, scale };
  }

  return { render, worldToScreen, rebuild: () => { built = false; } };
}

function drawNoise(ctx, biome) {
  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % WORLD_W;
    const y = (i * 89) % WORLD_H;
    ctx.fillStyle = biome.noiseTint;
    ctx.beginPath();
    ctx.ellipse(x, y, 30 + (i % 7) * 8, 18 + (i % 5) * 6, i * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWaterMasks(ctx, level, biome) {
  if (!biome.waterColor) return;
  for (const mask of level.waterMasks || []) {
    ctx.fillStyle = biome.waterColor;
    ctx.beginPath();
    ctx.ellipse(mask.x, mask.y, mask.rx, mask.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPath(ctx, path, biome) {
  if (path.samples.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = biome.pathEdgeColor;
  ctx.lineWidth = path.width + 16;
  ctx.beginPath();
  ctx.moveTo(path.samples[0].x, path.samples[0].y);
  for (let i = 1; i < path.samples.length; i++) ctx.lineTo(path.samples[i].x, path.samples[i].y);
  ctx.stroke();
  ctx.strokeStyle = biome.pathColor;
  ctx.lineWidth = path.width;
  ctx.stroke();
}

function drawRingSpot(ctx, ring) {
  ctx.strokeStyle = "rgba(180,255,160,0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, ring.buildRadius || 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLandmark(ctx, lm, catalog) {
  const colors = { "broken-fence": "#8b6914", "clearance-notice": "#d4c4a0" };
  ctx.fillStyle = colors[lm.type] || "#888";
  ctx.fillRect(lm.x - 20, lm.y - 30, 40, 60);
}

function drawDecoration(ctx, dec, biome) {
  const colors = { stump: "#5c4030", flower: "#ff88cc", mushroom: "#cc88ff", fence: "#8b6914" };
  ctx.fillStyle = colors[dec.type] || biome.accentColor;
  ctx.beginPath();
  ctx.arc(dec.x, dec.y, dec.size || 14, 0, Math.PI * 2);
  ctx.fill();
}

function drawDebug(ctx, level, paths) {
  for (const path of paths) {
    ctx.strokeStyle = "rgba(255,255,0,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const cp of path.controlPoints) {
      ctx.rect(cp.x - 4, cp.y - 4, 8, 8);
    }
    ctx.stroke();
  }
  for (const ring of level.rings || []) {
    ctx.strokeStyle = "rgba(0,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, 160, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawDefenderEntity(ctx, d, catalog, bob = 0) {
  const size = 64;
  const yOff = Math.sin(bob) * 3;
  ctx.fillStyle = d.flash > 0 ? "#fff7ab" : "#2ccb5a";
  ctx.beginPath();
  ctx.arc(d.x, d.y + yOff - 10, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  if (d.hp < d.maxHp) drawHp(ctx, d.x - 28, d.y + 20, 56, d.hp / d.maxHp, "#58e36d");
}

export function drawEnemyEntity(ctx, e, bob = 0) {
  const w = e.stats.width;
  const h = e.stats.height;
  const yOff = e.flying ? Math.sin(bob * 2) * 5 : 0;
  ctx.fillStyle = e.flash > 0 ? "#fff0aa" : (e.stats.tags.includes("machine") ? "#d9b85f" : "#cf8b52");
  ctx.fillRect(e.x - w / 2, e.y - h / 2 + yOff, w, h);
  if (e.hp < e.maxHp) drawHp(ctx, e.x - w / 2, e.y - h / 2 - 10 + yOff, w, e.hp / e.maxHp, "#ff7056");
}

export function drawProjectileEntity(ctx, p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawHeartwoodGate(ctx) {
  ctx.fillStyle = "rgba(255,105,77,0.35)";
  ctx.fillRect(0, 200, 90, 624);
  ctx.fillStyle = "#ffd765";
  ctx.font = "bold 28px system-ui";
  ctx.fillText("♥", 28, 520);
}
