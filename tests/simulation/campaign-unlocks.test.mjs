import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../tools/levelgen/shared.mjs";
import { cumulativeUnlocks } from "../../src/campaign-data.js";
import { campaignUnlocksFor } from "../../tools/simulation/bots.mjs";

const manifest = JSON.parse(readFileSync(join(ROOT, "levels/campaign.json"), "utf8"));

test("battle simulation derives cumulative unlocks from the campaign manifest", () => {
  for (const level of manifest.levels) {
    const expected = cumulativeUnlocks(manifest, level.id);
    assert.deepEqual(
      campaignUnlocksFor(level.id),
      expected,
      `sim unlocks for ${level.id} must match the manifest-derived ladder`,
    );
  }
});

test("simulation falls back to a starter unlock for unknown campaign levels", () => {
  assert.deepEqual(campaignUnlocksFor("not-a-real-level"), ["sprig-sentinel"]);
});
