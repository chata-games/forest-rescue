#!/usr/bin/env node
import { resolve, join } from "node:path";
import { readJson, ROOT } from "./shared.mjs";

const levelPath = resolve(process.argv[2] || join(ROOT, "levels/compiled/01-meadows-edge.json"));
const level = readJson(levelPath);
const outPath = levelPath.replace(".json", "-preview.png");

const W = 1536;
const H = 1024;

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("sharp not installed; run npm install in forest-rescue");
    process.exit(1);
  }

  const pixels = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    pixels[i * 4] = 42;
    pixels[i * 4 + 1] = 107;
    pixels[i * 4 + 2] = 58;
    pixels[i * 4 + 3] = 255;
  }

  const path = level.paths[0];
  if (path?.samples) {
    for (const s of path.samples) {
      const px = Math.round(s.x);
      const py = Math.round(s.y);
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const idx = (y * W + x) * 4;
          pixels[idx] = 196;
          pixels[idx + 1] = 168;
          pixels[idx + 2] = 106;
        }
      }
    }
  }

  for (const ring of level.rings || []) {
    for (let dy = -42; dy <= 42; dy++) {
      for (let dx = -42; dx <= 42; dx++) {
        if (dx * dx + dy * dy > 42 * 42) continue;
        const x = Math.round(ring.x + dx);
        const y = Math.round(ring.y + dy);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const idx = (y * W + x) * 4;
        pixels[idx] = 100;
        pixels[idx + 1] = 220;
        pixels[idx + 2] = 160;
      }
    }
  }

  await sharp(pixels, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(outPath);
  console.log(`preview -> ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
