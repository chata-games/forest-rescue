#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { readJson, ROOT } from "../levelgen/shared.mjs";
import { runSimulation, BOTS } from "./bots.mjs";

const levelPath = resolve(process.argv[2] || join(ROOT, "levels/compiled/01-meadows-edge.json"));
const level = readJson(levelPath);
const results = {};

for (const bot of Object.keys(BOTS)) {
  results[bot] = runSimulation(level, bot);
  console.log(`${bot}: won=${results[bot].won} hearts=${results[bot].hearts} ticks=${results[bot].ticks}`);
}

const outPath = levelPath.replace(".json", ".simulation.json");
writeFileSync(outPath, `${JSON.stringify({ levelId: level.id, results }, null, 2)}\n`);
console.log(`wrote ${outPath}`);
