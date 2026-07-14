import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson, ROOT } from "../../tools/levelgen/shared.mjs";
import { join } from "node:path";
import { runSimulation } from "../../tools/simulation/bots.mjs";

test("simulation smoke run on level 1", () => {
  const level = readJson(join(ROOT, "levels/compiled/01-meadows-edge.json"));
  const result = runSimulation(level, "cheapest-dps", { ticks: 3600 });
  assert.ok(result.ticks > 0);
  assert.ok(typeof result.won === "boolean");
});
