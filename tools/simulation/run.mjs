#!/usr/bin/env node
import { writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { readJson, ROOT } from "../levelgen/shared.mjs";
import { runSimulation, BOTS } from "./bots.mjs";
import { NAMED_SIMULATIONS } from "./scenarios.mjs";
import { OUTCOME_BANDS, evaluateBand } from "./bands.mjs";

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const levelArg = argv.find((a) => !a.startsWith("-"));

function simulateLevel(levelPath) {
  const level = readJson(levelPath);

  // Map (levelId, bot) -> declared outcome band so each result carries the
  // expectation it is judged against, not just the raw scalar outcome.
  const bandByBot = new Map();
  for (const s of NAMED_SIMULATIONS) {
    if (s.levelId === level.id) bandByBot.set(s.bot, s.band);
  }

  const results = {};
  for (const bot of Object.keys(BOTS)) {
    const bandKey = bandByBot.get(bot);
    const result = runSimulation(level, bot, {
      seed: bandKey ? `${level.seed}-band-${bot}` : `${level.seed}-sim-${bot}`,
    });
    const entry = { ...result };
    if (bandKey) {
      const evaluation = evaluateBand(result, OUTCOME_BANDS[bandKey]);
      entry.band = bandKey;
      entry.bandEvaluation = {
        ok: evaluation.ok,
        expected: evaluation.expected,
        actual: evaluation.actual,
        ...(evaluation.reason ? { reason: evaluation.reason } : {}),
      };
    }
    results[bot] = entry;
    let verdict;
    if (!entry.bandEvaluation) verdict = "no-band";
    else if (entry.bandEvaluation.ok) verdict = "in-band";
    else verdict = "OUT OF BAND";
    console.log(`  ${bot}: won=${result.won} hearts=${result.hearts} ticks=${result.ticks} [${verdict}]`);
  }

  const outPath = levelPath.replace(".json", ".simulation.json");
  writeFileSync(outPath, `${JSON.stringify({ levelId: level.id, results }, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

if (all) {
  const compiledDir = join(ROOT, "levels/compiled");
  const files = readdirSync(compiledDir)
    .filter((f) => f.endsWith(".json") && !f.includes(".simulation") && !f.startsWith("00-"));
  for (const f of files) {
    const p = join(compiledDir, f);
    console.log(`simulating ${f}`);
    simulateLevel(p);
  }
} else {
  const levelPath = resolve(levelArg || join(ROOT, "levels/compiled/01-meadows-edge.json"));
  simulateLevel(levelPath);
}

