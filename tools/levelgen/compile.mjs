#!/usr/bin/env node
import { resolve, join } from "node:path";
import { readdirSync, existsSync } from "node:fs";
import { ROOT, compileIntent, writeCompiled, readJson } from "./shared.mjs";

const args = process.argv.slice(2);
const all = args.includes("--all");
const intentPaths = all
  ? readdirSync(join(ROOT, "levels/intents")).filter((f) => f.endsWith(".json")).map((f) => join(ROOT, "levels/intents", f))
  : args.filter((a) => !a.startsWith("-")).map((a) => resolve(a));

if (!intentPaths.length) {
  console.error("Usage: node compile.mjs <intent.json> | --all");
  process.exit(1);
}

for (const intentPath of intentPaths) {
  const intent = readJson(intentPath);
  const compiled = compileIntent(intent);
  const outPath = join(ROOT, "levels/compiled", `${intent.id}.json`);
  writeCompiled(compiled, outPath);
  console.log(`compiled ${intent.id} -> ${outPath}`);
  console.log(`  pathLength=${compiled.metrics.pathLength} rings=${compiled.metrics.ringCount} difficulty=${compiled.metrics.estimatedDifficulty}`);
}
