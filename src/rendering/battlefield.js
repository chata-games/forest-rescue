import { WORLD_W, WORLD_H } from "../engine/canvas.js";
import { getBiome } from "../content/biomes.js";
import { pathsFromLevel } from "../level/path.js";
import { glowSources } from "../level/light.js";
import { drawHp } from "./draw-utils.js";
import { drawAtlasSprite, catalogAsset } from "./sprites.js";

export function createBattlefieldRenderer(level, catalog, options = {}) {
  const biome = getBiome(level.biome);
  const paths = pathsFromLevel(level);
  const debug = options.debug || false;
  const atlas = options.atlas || null;
  const images = options.images || {};
  const staticCanvas = document.createElement("canvas");
  staticCanvas.width = WORLD_W;
  staticCanvas.height = WORLD_H;
  const sctx = staticCanvas.getContext("2d");
  let built = false;

  function buildStatic() {
    drawGround(sctx, biome, catalog, images);
    drawWaterMasks(sctx, level, biome);
    for (const path of paths) drawPath(sctx, path, biome, images);
    for (const lm of level.landmarks || []) drawLandmark(sctx, lm, catalog, images);
    for (const dec of level.decorations || []) drawDecoration(sctx, dec, biome, catalog, images);
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

function drawGround(ctx, biome, catalog, images) {
  const grassId = biome.grassMaterial || "material-grass";
  const grass = images[grassId] || images["material-grass"];
  if (grass?.ready) {
    ctx.fillStyle = ctx.createPattern(grass.img, "repeat");
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    if (biome.darkness) {
      ctx.fillStyle = "rgba(8,12,28,0.35)";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    return;
  }
  ctx.fillStyle = biome.baseColor;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  drawNoise(ctx, biome);
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

function drawPath(ctx, path, biome, images) {
  if (path.samples.length < 2) return;
  const interior = images["material-path-interior"];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(path.samples[0].x, path.samples[0].y);
  for (let i = 1; i < path.samples.length; i++) ctx.lineTo(path.samples[i].x, path.samples[i].y);

  ctx.strokeStyle = biome.pathEdgeColor;
  ctx.lineWidth = path.width + 16;
  ctx.stroke();

  ctx.strokeStyle = interior?.ready
    ? ctx.createPattern(interior.img, "repeat")
    : biome.pathColor;
  ctx.lineWidth = path.width;
  ctx.stroke();
}

function drawRingSpot(ctx, ring) {
  const onPath = ring.placement === "on-path";
  ctx.strokeStyle = onPath ? "rgba(255,180,80,0.45)" : "rgba(180,255,160,0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash(onPath ? [4, 4] : [6, 6]);
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, ring.buildRadius || 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

const LANDMARK_SPRITES = {
  "broken-fence": "landmark-broken-fence",
  "glow-mushroom-cluster": "landmark-glow-mushroom",
  "sawmill-debris": "landmark-sawmill-debris",
};

const DECORATION_SPRITES = {
  stump: "decoration-stump",
};

function drawCatalogProp(ctx, spriteId, x, y, catalog, images, sizeOverride) {
  const asset = catalogAsset(catalog, spriteId);
  const img = images[spriteId];
  if (!asset || !img?.ready) return false;
  const [w, h] = sizeOverride || asset.drawSize;
  const [ax, ay] = asset.anchor;
  drawSpriteProp(ctx, img, x - w * ax, y - h * ay, w, h);
  return true;
}

function drawSpriteProp(ctx, img, x, y, w, h) {
  ctx.drawImage(img.img, x, y, w, h);
}

function drawLandmark(ctx, lm, catalog, images) {
  const spriteId = LANDMARK_SPRITES[lm.type];
  if (drawCatalogProp(ctx, spriteId, lm.x, lm.y, catalog, images)) return;
  const colors = {
    "broken-fence": "#8b6914",
    "clearance-notice": "#d4c4a0",
    "glow-mushroom-cluster": "#88ffcc",
    "sawmill-debris": "#a07040",
  };
  ctx.fillStyle = colors[lm.type] || "#888";
  if (lm.type === "glow-mushroom-cluster") {
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(180,255,220,0.25)";
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, 55, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillRect(lm.x - 20, lm.y - 30, 40, 60);
}

function drawDecoration(ctx, dec, biome, catalog, images) {
  const spriteId = DECORATION_SPRITES[dec.type];
  const size = dec.size ? [dec.size * 2, dec.size * 2] : null;
  if (drawCatalogProp(ctx, spriteId, dec.x, dec.y, catalog, images, size)) return;
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

function drawEntitySprite(ctx, spriteId, x, y, catalog, atlas, bob = 0, flash = 0) {
  const asset = catalogAsset(catalog, spriteId);
  const frame = atlas?.frames?.[spriteId];
  if (!asset || !frame) return false;

  const [w, h] = asset.drawSize;
  const [ax, ay] = asset.anchor;
  const yOff = Math.sin(bob) * 3;
  const drawX = x - w * ax;
  const drawY = y + yOff - h * ay;

  if (asset.shadowRadius) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + 6, asset.shadowRadius, asset.shadowRadius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const drawn = drawAtlasSprite(ctx, atlas, frame, drawX, drawY, w, h);
  if (drawn && flash > 0) {
    ctx.fillStyle = "rgba(255,247,171,0.45)";
    ctx.fillRect(drawX, drawY, w, h);
  }
  return drawn;
}

export function drawDefenderEntity(ctx, d, catalog, bob = 0, atlas = null) {
  const spriteId = d.stats?.sprite;
  if (spriteId && drawEntitySprite(ctx, spriteId, d.x, d.y, catalog, atlas, bob, d.flash)) {
    if (d.hp < d.maxHp) drawHp(ctx, d.x - 28, d.y + 20, 56, d.hp / d.maxHp, "#58e36d");
    return;
  }
  const size = 64;
  const yOff = Math.sin(bob) * 3;
  ctx.fillStyle = d.flash > 0 ? "#fff7ab" : "#2ccb5a";
  ctx.beginPath();
  ctx.arc(d.x, d.y + yOff - 10, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  if (d.hp < d.maxHp) drawHp(ctx, d.x - 28, d.y + 20, 56, d.hp / d.maxHp, "#58e36d");
}

export function drawEnemyEntity(ctx, e, catalog, bob = 0, atlas = null) {
  let spriteId = e.stats?.sprite;
  if (e.stats?.damagedSprite && e.hp < e.maxHp * 0.5) {
    spriteId = e.stats.damagedSprite;
  }
  const yOff = e.flying ? Math.sin(bob * 2) * 5 : Math.sin(bob) * 3;
  if (spriteId && drawEntitySprite(ctx, spriteId, e.x, e.y + (e.flying ? yOff : 0), catalog, atlas, bob, e.flash)) {
    const w = e.stats.width;
    if (e.hp < e.maxHp) drawHp(ctx, e.x - w / 2, e.y - e.stats.height / 2 - 10 + yOff, w, e.hp / e.maxHp, "#ff7056");
    return;
  }
  const w = e.stats.width;
  const h = e.stats.height;
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

export function drawDarknessOverlay(ctx, level, defenders) {
  ctx.save();
  ctx.fillStyle = "rgba(4,8,18,0.72)";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.globalCompositeOperation = "destination-out";
  for (const src of glowSources(level, defenders)) {
    const g = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, src.r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.55, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(src.x, src.y, src.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
