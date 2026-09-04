import { WORLD_W, WORLD_H } from "../engine/canvas.js";
import { getBiome } from "../content/biomes.js";
import { pathsFromLevel } from "../level/path.js";
import { glowSources } from "../level/light.js";
import { isRingBurning } from "../level/fire.js";
import { drawHp } from "./draw-utils.js";
import { drawAtlasSprite, catalogAsset } from "./sprites.js";
import { PLANT_FLASH } from "../entities/defender.js";

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
    drawHeartwoodGate(sctx, catalog, images);
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
    const asset = catalogAsset(catalog, grassId) || catalogAsset(catalog, "material-grass");
    if (asset?.renderMode === "cover") {
      ctx.drawImage(grass.img, 0, 0, WORLD_W, WORLD_H);
    } else {
      ctx.fillStyle = ctx.createPattern(grass.img, "repeat");
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
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
  "clearance-notice": "landmark-broken-fence",
  "glow-mushroom-cluster": "landmark-glow-mushroom",
  "sawmill-debris": "landmark-sawmill-debris",
};

const DECORATION_SPRITES = {
  stump: { id: "decoration-stump", scale: 5 },
  flower: { id: "decoration-meadow-flowers", scale: 2.5 },
  mushroom: { id: "decoration-meadow-mushroom", scale: 2.5 },
  fence: { id: "landmark-broken-fence", scale: 6 },
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
  const sprite = DECORATION_SPRITES[dec.type];
  const size = dec.size && sprite ? [dec.size * sprite.scale, dec.size * sprite.scale] : null;
  if (drawCatalogProp(ctx, sprite?.id, dec.x, dec.y, catalog, images, size)) return;
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

// RP-k0e3xc: placed defenders must stay findable. Each type gets a persistent
// ground pad plus a tinted silhouette outline in its accent color, and a
// one-shot ring flash confirms planting. Deliberately dim and static — this
// must NOT read as a selection highlight (no selection UI exists).
const silhouetteCache = new Map();

function defenderAccent(d) {
  return d.stats?.accent || "#eaf7d8";
}

function defenderPadRadius(catalog, d) {
  const asset = catalogAsset(catalog, d.stats?.sprite);
  return ((asset?.drawSize?.[0]) || 64) * 0.42;
}

// Tinted copy of the atlas frame in the type's accent color, cached per
// sprite+color. Never cache a miss: the atlas may still be loading.
function tintedSilhouette(atlas, spriteId, accent) {
  const key = `${spriteId}|${accent}`;
  if (silhouetteCache.has(key)) return silhouetteCache.get(key);
  const frame = atlas?.frames?.[spriteId];
  if (!atlas?.ready || !frame) return null;
  const cv = document.createElement("canvas");
  cv.width = frame.w;
  cv.height = frame.h;
  const cctx = cv.getContext("2d");
  cctx.drawImage(atlas.img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  cctx.globalCompositeOperation = "source-in";
  cctx.fillStyle = accent;
  cctx.fillRect(0, 0, frame.w, frame.h);
  silhouetteCache.set(key, cv);
  return cv;
}

function stampSilhouetteOutline(ctx, d, catalog, atlas, accent, yOff) {
  const spriteId = d.stats?.sprite;
  const tinted = tintedSilhouette(atlas, spriteId, accent);
  const asset = catalogAsset(catalog, spriteId);
  if (!tinted || !asset) return;
  const [w, h] = asset.drawSize;
  const [ax, ay] = asset.anchor;
  const dx = d.x - w * ax;
  const dy = d.y + yOff - h * ay;
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    ctx.drawImage(tinted, dx + Math.cos(a) * 2.6, dy + Math.sin(a) * 2.6, w, h);
  }
  ctx.restore();
}

function drawDefenderPad(ctx, d, catalog, accent) {
  ctx.save();
  const rx = Math.round(defenderPadRadius(catalog, d));
  const ry = Math.round(rx * 0.45);
  ctx.fillStyle = "rgba(10,18,12,0.4)";
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + 6, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + 6, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// One-shot on plant: an expanding accent ring + soft glow that spends
// plantFlash (decayed by DefenderEntity.update).
function drawPlacementFlash(ctx, d, catalog, accent) {
  const t = 1 - d.plantFlash / PLANT_FLASH; // 0 fresh → 1 spent
  const r = Math.round(defenderPadRadius(catalog, d) * (0.7 + t * 1.5));
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = (1 - t) * 0.32;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(d.x, d.y + 4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = (1 - t) * 0.9;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1 + 3 * (1 - t);
  ctx.beginPath();
  ctx.arc(d.x, d.y + 4, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawDefenderEntity(ctx, d, catalog, bob = 0, atlas = null) {
  const accent = defenderAccent(d);
  const yOff = Math.sin(bob) * 3;
  drawDefenderPad(ctx, d, catalog, accent);
  stampSilhouetteOutline(ctx, d, catalog, atlas, accent, yOff);
  const spriteId = d.stats?.sprite;
  const drewSprite = spriteId && drawEntitySprite(ctx, spriteId, d.x, d.y, catalog, atlas, bob, d.flash);
  if (!drewSprite) {
    const size = 64;
    ctx.fillStyle = d.flash > 0 ? "#fff7ab" : "#2ccb5a";
    ctx.beginPath();
    ctx.arc(d.x, d.y + yOff - 10, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.hp < d.maxHp) drawHp(ctx, d.x - 28, d.y + 20, 56, d.hp / d.maxHp, "#58e36d");
}

export function drawEnemyEntity(ctx, e, catalog, bob = 0, atlas = null) {
  const yOff = e.flying ? Math.sin(bob * 2) * 5 : Math.sin(bob) * 3;
  if (e.burrowTime > 0) {
    const w = e.stats.width;
    ctx.fillStyle = "rgba(70,55,40,0.55)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 6, w * 0.45, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(180,150,110,0.45)";
    for (let i = 0; i < 4; i++) {
      const fx = e.x + Math.cos(bob * 3 + i * 1.6) * (w * 0.25);
      const fy = e.y - 6 - Math.abs(Math.sin(bob * 4 + i)) * 10;
      ctx.beginPath();
      ctx.arc(fx, fy, 3 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  let spriteId = e.stats?.sprite;
  if (e.stats?.damagedSprite && e.hp < e.maxHp * 0.5) {
    spriteId = e.stats.damagedSprite;
  }
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

export function drawHeartwoodGate(ctx, catalog = null, images = {}) {
  if (drawCatalogProp(ctx, "landmark-heartwood-gate", 42, 660, catalog, images)) return;
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
  // RP-k0e3xc: every placed defender keeps a small pool of light so units stay
  // findable in dark levels (the old 2–3px-in-ring-glow failure). Visual only —
  // glowSources (and thus enemy targeting) is untouched.
  for (const d of defenders || []) {
    if (d.dead) continue;
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 60);
    g.addColorStop(0, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFireOverlay(ctx, rings, fireState, phase = 0) {
  if (!fireState) return;
  for (const ring of rings) {
    if (!isRingBurning(ring.id, fireState)) continue;
    const pulse = Math.sin(phase * 6 + ring.x * 0.01) * 4;
    const r = (ring.buildRadius || 42) + pulse;
    const g = ctx.createRadialGradient(ring.x, ring.y, 0, ring.x, ring.y, r + 18);
    g.addColorStop(0, "rgba(255,200,80,0.55)");
    g.addColorStop(0.45, "rgba(255,120,40,0.35)");
    g.addColorStop(1, "rgba(255,60,20,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, r + 18, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = phase * 8 + i * 1.3;
      const fx = ring.x + Math.cos(a) * (r * 0.5);
      const fy = ring.y - 12 - Math.abs(Math.sin(a * 1.7)) * 22;
      ctx.fillStyle = `rgba(255,${140 + i * 20},40,${0.5 + Math.sin(phase * 10 + i) * 0.2})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 4 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
