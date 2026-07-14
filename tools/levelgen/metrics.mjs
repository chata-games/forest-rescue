#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson, ROOT } from "./shared.mjs";

const compiledDir = join(ROOT, "levels/compiled");
const files = readdirSync(compiledDir).filter((f) => f.endsWith(".json") && !f.includes(".simulation"));

console.log("Level metrics summary\n");
for (const f of files) {
  const level = readJson(join(compiledDir, f));
  const m = level.metrics || {};
  console.log(`${level.id}: path=${m.pathLength} rings=${m.ringCount} coverage=${m.averageRingCoverage} choke=${m.chokepoints} diff=${m.estimatedDifficulty}`);
}
