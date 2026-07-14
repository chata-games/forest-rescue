import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readJson, ROOT } from "../../tools/levelgen/shared.mjs";
import { runSimulation } from "../../tools/simulation/bots.mjs";
import { getEnemy } from "../../src/content/enemies.js";
import { getDefender } from "../../src/content/defenders.js";

test("level 7 wires burrow enemies, armored excavator, and mossback counterplay", () => {
  const level = readJson(join(ROOT, "levels/compiled/07-boulder-pass.json"));
  assert.equal(level.bossId, "excavator");
  assert.equal(level.biome, "boulder-pass");
  assert.ok(level.unlocks?.includes("mossback-golem"));
  assert.equal(level.waves.length, 10);

  const borer = getEnemy("tunnel-borer");
  assert.ok(borer.burrow?.jumpDistance > 0);
  const excavator = getEnemy("excavator");
  assert.equal(excavator.armor, 3);
  const golem = getDefender("mossback-golem");
  assert.equal(golem.armorPierce, 3);
});

test("level 7 upgrade-first clears with mossback golem counterplay", () => {
  const level = readJson(join(ROOT, "levels/compiled/07-boulder-pass.json"));

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
  assert.ok(winRate >= 0.45, `mossback counterplay too weak: ${(winRate * 100).toFixed(0)}% upgrade win rate`);
});
