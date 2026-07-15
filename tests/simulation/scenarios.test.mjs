import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NAMED_SIMULATIONS,
  runScenario,
  runNamedSimulations,
  scenarioSeed,
} from "../../tools/simulation/scenarios.mjs";
import { OUTCOME_BANDS } from "../../tools/simulation/bands.mjs";

function levelsById() {
  const dir = join(process.cwd(), "levels/compiled");
  const map = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.includes(".simulation"))) {
    const level = JSON.parse(readFileSync(join(dir, f), "utf8"));
    map.set(level.id, level);
  }
  return map;
}

test("the named suite covers every campaign level with at least one scenario", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "levels/campaign.json"), "utf8"));
  const covered = new Set(NAMED_SIMULATIONS.map((s) => s.levelId));
  for (const level of manifest.levels) {
    assert.ok(covered.has(level.id), `campaign level ${level.id} has no named simulation`);
  }
});

test("every scenario references a real level, bot, and known band", () => {
  const ids = levelsById();
  for (const s of NAMED_SIMULATIONS) {
    assert.ok(ids.has(s.levelId), `${s.name}: unknown level ${s.levelId}`);
    assert.ok(Object.prototype.hasOwnProperty.call(OUTCOME_BANDS, s.band), `${s.name}: unknown band ${s.band}`);
    assert.ok(typeof s.bot === "string" && s.bot.length, `${s.name}: missing bot`);
  }
});

test("named simulations are deterministic: the same scenario replays identically", () => {
  const levels = levelsById();
  const scenario = NAMED_SIMULATIONS.find((s) => s.name === "meadows-cheapest");
  const level = levels.get(scenario.levelId);
  const a = runScenario(scenario, level);
  const b = runScenario(scenario, level);
  assert.deepEqual(a.result, b.result);
  assert.equal(a.seed, b.seed);
});

test("the scenario seed is derived deterministically from level + bot", () => {
  const level = levelsById().get("01-meadows-edge");
  const scenario = NAMED_SIMULATIONS.find((s) => s.name === "meadows-gate");
  assert.equal(scenarioSeed(scenario, level), `${level.seed}-band-${scenario.bot}`);
});

test("the whole named suite lands inside its outcome bands", () => {
  const report = runNamedSimulations(levelsById());
  assert.equal(report.ok, true, report.failures.map((f) => `${f.code}: ${f.message}`).join("\n"));
  assert.equal(report.failures.length, 0);
  assert.ok(report.results.length === NAMED_SIMULATIONS.length);
});

test("a band miss is reported with an actionable, human-readable message", () => {
  const levels = levelsById();
  // Forcibly move a clean-win scenario into the loss band to provoke a miss.
  const scenario = { ...NAMED_SIMULATIONS.find((s) => s.name === "meadows-cheapest"), band: "loss" };
  const level = levels.get(scenario.levelId);
  const run = runScenario(scenario, level);
  assert.equal(run.evaluation.ok, false);
  assert.match(run.evaluation.reason, /loss/i);
});
