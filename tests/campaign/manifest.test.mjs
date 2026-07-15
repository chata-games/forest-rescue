import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../tools/levelgen/shared.mjs";
import {
  campaignLevels,
  cumulativeUnlocks,
  cumulativeSpellUnlock,
  actOf,
} from "../../src/campaign-data.js";

const MANIFEST_PATH = join(ROOT, "levels/campaign.json");

function readManifest() {
  assert.ok(existsSync(MANIFEST_PATH), "levels/campaign.json manifest must exist");
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

test("campaign manifest owns the ordered stable level IDs", () => {
  const manifest = readManifest();
  const levels = campaignLevels(manifest);
  assert.ok(Array.isArray(levels) && levels.length >= 7, "campaign has at least the v1 levels");
  const ids = levels.map((l) => l.id);
  // Stable IDs follow the NN-slug contract.
  for (const id of ids) assert.match(id, /^[0-9]{2}-[a-z0-9-]+$/);
  // Ordered by stable ID prefix with no duplicates.
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted, "manifest levels are ordered by stable ID");
  assert.equal(new Set(ids).size, ids.length, "stable IDs are unique");
});

test("manifest declares three acts and every level belongs to a declared act", () => {
  const manifest = readManifest();
  const acts = new Set((manifest.acts || []).map((a) => a.id));
  assert.ok(acts.size >= 3, "campaign is split into acts");
  for (const level of campaignLevels(manifest)) {
    const act = actOf(manifest, level.id);
    assert.ok(act, `level ${level.id} has act membership`);
    assert.ok(acts.has(act), `level ${level.id} references a declared act`);
  }
});

test("manifest map positions are normalized landmarks in [0,1]", () => {
  const manifest = readManifest();
  for (const level of campaignLevels(manifest)) {
    const pos = level.mapPosition;
    assert.ok(pos, `level ${level.id} has a normalized mapPosition`);
    assert.ok(pos.x >= 0 && pos.x <= 1, `${level.id} mapPosition.x normalized`);
    assert.ok(pos.y >= 0 && pos.y <= 1, `${level.id} mapPosition.y normalized`);
  }
});

test("every manifest level has a compiled level and an intent", () => {
  const manifest = readManifest();
  const compiled = new Set(readdirSync(join(ROOT, "levels/compiled")).filter((f) => f.endsWith(".json") && !f.includes(".simulation")).map((f) => f.replace(/\.json$/, "")));
  const intents = new Set(readdirSync(join(ROOT, "levels/intents")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
  for (const level of campaignLevels(manifest)) {
    assert.ok(compiled.has(level.id), `compiled level exists for ${level.id}`);
    assert.ok(intents.has(level.id), `intent exists for ${level.id}`);
  }
});

test("cumulative unlocks are deduped and match the hand-tuned campaign ladder", () => {
  const manifest = readManifest();
  assert.deepEqual(cumulativeUnlocks(manifest, "01-meadows-edge"), ["sprig-sentinel", "thornvine-bramble"]);
  assert.deepEqual(cumulativeUnlocks(manifest, "03-whispering-river"), [
    "sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph",
  ]);
  assert.deepEqual(cumulativeUnlocks(manifest, "04-mushroom-hollow"), [
    "sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph", "firefly-beacon", "mushroom-shaman",
  ]);
  assert.deepEqual(cumulativeUnlocks(manifest, "07-boulder-pass"), [
    "sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph", "firefly-beacon", "mushroom-shaman", "mossback-golem",
  ]);
  assert.equal(cumulativeUnlocks(manifest, "does-not-exist").length, 0);
});

test("cumulative spell unlock resolves the most recent spell up to a level", () => {
  const manifest = readManifest();
  assert.equal(cumulativeSpellUnlock(manifest, "05-sawmill-clearing"), "root-snare");
  assert.equal(cumulativeSpellUnlock(manifest, "06-ashfall-scar"), "cleansing-rain");
  assert.equal(cumulativeSpellUnlock(manifest, "07-boulder-pass"), "cleansing-rain");
  assert.equal(cumulativeSpellUnlock(manifest, "01-meadows-edge"), null);
});
