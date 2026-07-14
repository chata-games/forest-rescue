import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readJson, ROOT } from "../../tools/levelgen/shared.mjs";
import { runSimulation } from "../../tools/simulation/bots.mjs";

test("level 6 fire spread punishes cheap builds but upgrade-first can clear", () => {
  const level = readJson(join(ROOT, "levels/compiled/06-ashfall-scar.json"));
  assert.equal(level.spellUnlock, "cleansing-rain");
  assert.ok(level.levelModifiers?.includes("fire-spread"));
  assert.equal(level.waves.length, 10);

  let cheapWins = 0;
  let upgradeWins = 0;
  const runs = 20;
  for (let i = 0; i < runs; i++) {
    const seed = `${level.seed}-balance-${i}`;
    if (runSimulation(level, "cheapest-dps", { seed, ticks: 3600 * 12 }).won) cheapWins += 1;
    if (runSimulation(level, "upgrade-first", { seed, ticks: 3600 * 12 }).won) upgradeWins += 1;
  }
  const cheapRate = cheapWins / runs;
  const upgradeRate = upgradeWins / runs;
  assert.ok(cheapRate <= 0.35, `fire level too forgiving without tools: ${(cheapRate * 100).toFixed(0)}% cheap win rate`);
  assert.ok(upgradeRate >= 0.6, `fire tools too weak: ${(upgradeRate * 100).toFixed(0)}% upgrade win rate`);
});
