import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readJson, ROOT } from "../../tools/levelgen/shared.mjs";
import { runSimulation } from "../../tools/simulation/bots.mjs";

test("level 5 upgrade-first win rate is tuned for boss difficulty", () => {
  const level = readJson(join(ROOT, "levels/compiled/05-sawmill-clearing.json"));
  assert.equal(level.bossId, "the-grinder");
  assert.equal(level.spellUnlock, "root-snare");
  assert.equal(level.waves.length, 11);

  let wins = 0;
  const runs = 20;
  for (let i = 0; i < runs; i++) {
    const result = runSimulation(level, "upgrade-first", {
      seed: `${level.seed}-balance-${i}`,
      ticks: 3600 * 12,
    });
    if (result.won) wins += 1;
  }
  const winRate = wins / runs;
  assert.ok(winRate < 0.9, `boss level too easy: ${(winRate * 100).toFixed(0)}% win rate`);
  assert.ok(winRate >= 0.25, `boss level too hard: ${(winRate * 100).toFixed(0)}% win rate`);
  assert.ok(winRate <= 0.7, `boss level outside target band: ${(winRate * 100).toFixed(0)}% win rate`);
});
