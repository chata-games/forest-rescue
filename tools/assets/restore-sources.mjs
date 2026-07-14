#!/usr/bin/env node
/** Restore assets/source/ from full-resolution originals (ImageGen or legacy fallbacks). */
import { copyFileSync, mkdirSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_DIR = join(ROOT, "assets/source");

const ORIGINALS = {
  "sprig-sentinel-idle": join(ROOT, "assets/tree.png"),
  "logger-idle": join(ROOT, "assets/logger.png"),
  "bulldozer-idle": join(ROOT, "assets/dozer.png"),
  "thornvine-bramble-idle": "/home/vfeenstr/.codex/generated_images/019f601f-2f49-7471-a156-16d735deffad/exec-9f5ac875-d56e-48fc-bcaf-2a4cf963eecf.png",
  "wisp-willow-idle": "/home/vfeenstr/.codex/generated_images/019f602e-6ede-76d2-bade-ded518ddda29/exec-8a731547-dbf2-4056-bcff-b559d22503c7.png",
  "dewdrop-nymph-idle": "/home/vfeenstr/.codex/generated_images/019f6024-f987-7ba0-b7a5-a331184b6c9f/exec-24d7a875-fd21-4325-9d9d-4983cf6f8314.png",
  "buzzsaw-drone-idle": "/home/vfeenstr/.codex/generated_images/019f6021-2ae1-7370-b09b-3529b272aa10/exec-4fd306e1-d08d-4ae5-b969-fda208c2f581.png",
};

mkdirSync(SOURCE_DIR, { recursive: true });

for (const [id, src] of Object.entries(ORIGINALS)) {
  if (!existsSync(src)) {
    console.error(`missing original for ${id}: ${src}`);
    continue;
  }
  copyFileSync(src, join(SOURCE_DIR, `${id}.png`));
  const hashPath = join(SOURCE_DIR, `${id}.hash`);
  if (existsSync(hashPath)) unlinkSync(hashPath);
  console.log(`restored ${id}`);
}
