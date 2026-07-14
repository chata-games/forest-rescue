#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(join(ROOT, "assets/catalog.json"), "utf8"));

async function main() {
  const sharp = (await import("sharp")).default;
  const sprites = catalog.assets.filter((a) => a.file.startsWith("sprites/") && existsSync(join(ROOT, "assets", a.file)));
  const seen = new Set();
  const unique = sprites.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  if (!unique.length) {
    console.log("no sprites to pack — run process.mjs first");
    return;
  }

  const cols = 4;
  const cell = 128;
  const rows = Math.ceil(unique.length / cols);
  const atlasW = cols * cell;
  const atlasH = rows * cell;
  const composites = [];
  const frames = {};

  for (let i = 0; i < unique.length; i++) {
    const s = unique[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cell;
    const y = row * cell;
    const input = join(ROOT, "assets", s.file);
    const resized = await sharp(input).resize(cell, cell, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    composites.push({ input: resized, left: x, top: y });
    frames[s.id] = { x, y, w: cell, h: cell };
  }

  mkdirSync(join(ROOT, "assets/atlases"), { recursive: true });
  const atlasPath = join(ROOT, "assets/atlases/units.png");
  await sharp({ create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toFile(atlasPath);

  writeFileSync(join(ROOT, "assets/atlases/units.json"), `${JSON.stringify({ image: "atlases/units.png", frames }, null, 2)}\n`);
  console.log(`atlas -> ${atlasPath} (${unique.length} sprites)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
