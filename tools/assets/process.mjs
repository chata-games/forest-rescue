#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const catalog = JSON.parse(readFileSync(join(ROOT, "assets/catalog.json"), "utf8"));
const force = process.argv.includes("--force");

function isChromaPixel(r, g, b) {
  if (r > 160 && g < 120 && b > 160) return true;
  if (r > 160 && g < 90 && b < 90) return true;
  if (g > 160 && r < 90 && b < 90) return true;
  return false;
}

function isNeutralBackground(r, g, b) {
  if (isChromaPixel(r, g, b)) return true;
  if (g > Math.max(r, b) + 30) return false;
  if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r >= 165) return true;
  return false;
}

function chromaAlpha(r, g, b, alpha) {
  if (isNeutralBackground(r, g, b)) {
    const keys = [
      { r: 255, g: 255, b: 255 },
      { r: 192, g: 192, b: 192 },
      { r: 255, g: 0, b: 255 },
      { r: 255, g: 0, b: 0 },
    ];
    let best = Math.abs(r - g) + Math.abs(g - b);
    for (const k of keys) {
      best = Math.min(best, Math.abs(r - k.r) + Math.abs(g - k.g) + Math.abs(b - k.b));
    }
    if (best < 100) return 0;
    if (best < 160) return Math.round(alpha * (best - 100) / 60);
  }
  return alpha;
}

function findBounds(data, width, height, channels, threshold = 12) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (data[i + 3] > threshold) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return null;
  return { minX, minY, maxX, maxY };
}

async function chromaKeyAndNormalize(inputPath, outputPath, entry) {
  const sharp = (await import("sharp")).default;
  const nativeSize = entry.nativeSize || [256, 256];
  const [canvasW, canvasH] = nativeSize;
  const anchorX = entry.anchor?.[0] ?? 0.5;
  const anchorY = entry.anchor?.[1] ?? 0.82;

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    data[i + 3] = chromaAlpha(data[i], data[i + 1], data[i + 2], data[i + 3]);
  }

  const bounds = findBounds(data, info.width, info.height, 4);
  if (!bounds) throw new Error(`no visible pixels in ${inputPath}`);

  const contentW = bounds.maxX - bounds.minX + 1;
  const contentH = bounds.maxY - bounds.minY + 1;
  const margin = Math.max(12, Math.round(Math.max(contentW, contentH) * 0.04));
  const cropX = Math.max(0, bounds.minX - margin);
  const cropY = Math.max(0, bounds.minY - margin);
  const cropW = Math.min(info.width - cropX, contentW + margin * 2);
  const cropH = Math.min(info.height - cropY, contentH + margin * 2);

  const cropped = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .png()
    .toBuffer();

  const canvasPad = 0.05;
  const maxW = canvasW * (1 - canvasPad * 2);
  const maxH = canvasH * (1 - canvasPad * 2);
  let scale = Math.min(maxW / cropW, maxH / cropH);
  let w = Math.max(1, Math.round(cropW * scale));
  let h = Math.max(1, Math.round(cropH * scale));

  let left = Math.round(canvasW * anchorX - w * anchorX);
  let top = Math.round(canvasH * anchorY - h * anchorY);

  if (left < 2 || top < 2 || left + w > canvasW - 2 || top + h > canvasH - 2) {
    const fitScale = Math.min((canvasW - 4) / w, (canvasH - 4) / h, 1);
    w = Math.max(1, Math.round(w * fitScale));
    h = Math.max(1, Math.round(h * fitScale));
    left = Math.round(canvasW * anchorX - w * anchorX);
    top = Math.round(canvasH * anchorY - h * anchorY);
    left = Math.max(2, Math.min(left, canvasW - w - 2));
    top = Math.max(2, Math.min(top, canvasH - h - 2));
  }

  const resized = await sharp(cropped).resize(w, h, { fit: "fill" }).png().toBuffer();

  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(outputPath);
}

async function ingestSource(entry) {
  const outPath = join(ROOT, "assets", entry.file);
  const sourcePath = join(ROOT, "assets", "source", `${entry.id}.png`);
  mkdirSync(dirname(sourcePath), { recursive: true });

  if (!existsSync(sourcePath)) {
    if (!existsSync(outPath)) {
      if (entry.fallback && existsSync(join(ROOT, entry.fallback))) {
        copyFileSync(join(ROOT, entry.fallback), sourcePath);
      } else {
        return null;
      }
    } else {
      copyFileSync(outPath, sourcePath);
    }
  }
  return sourcePath;
}

async function processAsset(entry) {
  const outPath = join(ROOT, "assets", entry.file);
  const sourcePath = join(ROOT, "assets", "source", `${entry.id}.png`);
  const hashPath = join(ROOT, "assets", "source", `${entry.id}.hash`);
  mkdirSync(dirname(outPath), { recursive: true });

  const source = await ingestSource(entry);
  if (!source) {
    console.log(`missing ${entry.id} (${entry.file}) — run ImageGen using ${entry.promptFile}`);
    return;
  }

  const sourceHash = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 16);
  if (!force && existsSync(hashPath) && existsSync(outPath)) {
    const cached = readFileSync(hashPath, "utf8").trim();
    if (cached === sourceHash) {
      console.log(`skip processed ${entry.id}`);
      return;
    }
  }

  const tmpPath = `${outPath}.tmp.png`;
  await chromaKeyAndNormalize(source, tmpPath, entry);
  copyFileSync(tmpPath, outPath);
  try { unlinkSync(tmpPath); } catch { /* ignore */ }

  writeFileSync(hashPath, `${sourceHash}\n`);
  console.log(`processed ${entry.id}`);
}

async function renderPreviews(entry) {
  const sharp = (await import("sharp")).default;
  const srcPath = join(ROOT, "assets", entry.file);
  if (!existsSync(srcPath)) return;
  const previewDir = join(ROOT, "assets", "previews", entry.id);
  mkdirSync(previewDir, { recursive: true });
  for (const size of [64, 96]) {
    const [w, h] = entry.drawSize;
    const scale = size / Math.max(w, h);
    await sharp(srcPath)
      .resize(Math.round(w * scale), Math.round(h * scale), { fit: "inside" })
      .png()
      .toFile(join(previewDir, `${size}px.png`));
  }
}

for (const entry of catalog.assets) {
  if (!entry.file.match(/\.(png|webp)$/)) continue;
  await processAsset(entry);
  await renderPreviews(entry);
}

const manifestPath = join(ROOT, "assets/catalog.manifest.json");
const manifest = catalog.assets.map((a) => ({
  ...a,
  sourceHash: existsSync(join(ROOT, "assets", a.file))
    ? createHash("sha256").update(readFileSync(join(ROOT, "assets", a.file))).digest("hex").slice(0, 16)
    : a.sourceHash || "missing",
}));
writeFileSync(manifestPath, `${JSON.stringify({ assets: manifest }, null, 2)}\n`);
console.log(`wrote ${manifestPath}`);
