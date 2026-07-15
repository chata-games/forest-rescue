import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJson } from "../../tools/levelgen/shared.mjs";
import {
  loadCatalogs,
  validateAll,
  validateIntentRules,
  validateCompiledRules,
  validateManifest,
  validateStableIds,
  validateConvergence,
  findForbiddenGeometry,
} from "../../tools/levelgen/rules.mjs";

function loadCorpus() {
  const catalogs = loadCatalogs();
  const intentDir = join(ROOT, "levels/intents");
  const compiledDir = join(ROOT, "levels/compiled");
  const intents = readdirSync(intentDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const intent = readJson(join(intentDir, f));
      return { id: intent.id, intent, source: `intent:${intent.id}` };
    });
  const compiled = readdirSync(compiledDir)
    .filter((f) => f.endsWith(".json") && !f.includes(".simulation"))
    .map((f) => {
      const level = readJson(join(compiledDir, f));
      return { id: level.id, level, source: `compiled:${level.id}` };
    });
  const manifest = readJson(join(ROOT, "levels/campaign.json"));
  return { catalogs, intents, compiled, manifest };
}

test("the shipped campaign corpus passes every semantic rule", () => {
  const errors = validateAll(loadCorpus());
  assert.deepEqual(errors, [], errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
});

test("schema-reject path: intent rules flag an unknown enemy reference", () => {
  const catalogs = loadCatalogs();
  const intent = readJson(join(ROOT, "levels/intents/01-meadows-edge.json"));
  intent.waves.allowedEnemies = ["logger", "does-not-exist"];
  const errors = validateIntentRules(intent, catalogs, "intent:01");
  assert.ok(errors.some((e) => e.code === "ref/enemy" && e.message.includes("does-not-exist")));
});

test("catalog-reference: unknown defender, spell, and boss are flagged", () => {
  const catalogs = loadCatalogs();
  const intent = readJson(join(ROOT, "levels/intents/01-meadows-edge.json"));
  intent.unlocks = ["ghost-defender"];
  intent.spellUnlock = "phantom-spell";
  intent.bossId = "not-a-boss";
  const codes = validateIntentRules(intent, catalogs).map((e) => e.code);
  assert.ok(codes.includes("ref/defender"));
  assert.ok(codes.includes("ref/spell"));
  assert.ok(codes.includes("teaching/boss-requires-boss-enemy"));
});

test("catalog-reference: non-boss enemy rejected as bossId", () => {
  const catalogs = loadCatalogs();
  const intent = readJson(join(ROOT, "levels/intents/05-sawmill-clearing.json"));
  intent.bossId = "logger"; // a real enemy, but not a boss
  const errors = validateIntentRules(intent, catalogs);
  assert.ok(errors.some((e) => e.code === "teaching/boss-requires-boss-enemy"));
});

test("catalog-reference: unknown topology and budget curve are flagged", () => {
  const catalogs = loadCatalogs();
  const intent = readJson(join(ROOT, "levels/intents/01-meadows-edge.json"));
  intent.topology.archetype = "pretzel";
  intent.waves.budgetCurve = "ludicrous";
  const codes = validateIntentRules(intent, catalogs).map((e) => e.code);
  assert.ok(codes.includes("ref/topology"));
  assert.ok(codes.includes("ref/budget-curve"));
});

test("forbidden geometry: authored coordinates are rejected in LevelIntent", () => {
  const intent = readJson(join(ROOT, "levels/intents/01-meadows-edge.json"));
  intent.rings = [{ x: 100, y: 200 }];
  intent.paths = [{ controlPoints: [{ x: 1, y: 2 }] }];
  const hits = findForbiddenGeometry(intent);
  assert.ok(hits.some((h) => h.startsWith("rings")));
  assert.ok(hits.some((h) => h.startsWith("paths")));
  const errors = validateIntentRules(intent, loadCatalogs());
  assert.ok(errors.every((e) => e.code === "geometry/forbidden-in-intent"));
  assert.ok(errors.length >= 2);
});

test("teaching rule: fire-management requires the fire-spread modifier", () => {
  const catalogs = loadCatalogs();
  const intent = readJson(join(ROOT, "levels/intents/06-ashfall-scar.json"));
  intent.levelModifiers = []; // strip the required modifier
  const errors = validateIntentRules(intent, catalogs);
  assert.ok(errors.some((e) => e.code === "teaching/fire-management-requires-fire-spread"));
});

test("teaching rule: light-management requires the darkness modifier", () => {
  const catalogs = loadCatalogs();
  const intent = readJson(join(ROOT, "levels/intents/04-mushroom-hollow.json"));
  intent.levelModifiers = [];
  const errors = validateIntentRules(intent, catalogs);
  assert.ok(errors.some((e) => e.code === "teaching/light-management-requires-darkness"));
});

test("invalid compiled geometry: out-of-bounds path and ring are flagged", () => {
  const catalogs = loadCatalogs();
  const level = readJson(join(ROOT, "levels/compiled/01-meadows-edge.json"));
  // Push a control point off the battlefield.
  level.paths[0].controlPoints[0] = { x: -9999, y: -9999 };
  level.rings[0] = { ...level.rings[0], x: -500, y: -500 };
  const errors = validateCompiledRules(level, catalogs);
  const codes = errors.map((e) => e.code);
  assert.ok(codes.includes("geometry/path-out-of-bounds"));
  assert.ok(codes.includes("geometry/ring-out-of-bounds"));
});

test("invalid compiled geometry: a self-intersecting path is flagged", () => {
  const catalogs = loadCatalogs();
  const level = readJson(join(ROOT, "levels/compiled/01-meadows-edge.json"));
  // A bowtie control-point ordering forces the curve to cross itself.
  level.paths[0].controlPoints = [
    { x: 100, y: 100 }, { x: 1400, y: 900 },
    { x: 100, y: 900 }, { x: 1400, y: 100 }, { x: 45, y: 512 },
  ];
  const errors = validateCompiledRules(level, catalogs);
  assert.ok(errors.some((e) => e.code === "geometry/path-self-intersects"));
});

test("stable IDs: duplicate intent and compiled IDs are flagged", () => {
  const intents = [
    { id: "01-meadows-edge", intent: {}, source: "a" },
    { id: "01-meadows-edge", intent: {}, source: "b" },
  ];
  const compiled = [
    { id: "02-old-stump-crossroads", level: {} },
    { id: "02-old-stump-crossroads", level: {} },
  ];
  const errors = validateStableIds({ intents, compiled, manifest: { levels: [] } });
  const codes = errors.map((e) => e.code);
  assert.ok(codes.includes("ids/duplicate-intent"));
  assert.ok(codes.includes("ids/duplicate-compiled"));
});

test("stable IDs: a manifest level missing compiled output is flagged", () => {
  const { catalogs, intents } = loadCorpus();
  const manifest = readJson(join(ROOT, "levels/campaign.json"));
  // Drop the compiled map so the manifest's first level cannot resolve.
  const errors = validateManifest(manifest, catalogs, {
    intentIds: new Set(intents.map((i) => i.id)),
    compiledLevels: new Map(),
  });
  assert.ok(errors.some((e) => e.code === "ids/missing-compiled"));
});

test("manifest consistency: unlock drift between manifest and compiled is flagged", () => {
  const { catalogs, intents, compiled } = loadCorpus();
  const manifest = readJson(join(ROOT, "levels/campaign.json"));
  manifest.levels[0].unlocks = ["mossback-golem"]; // disagrees with compiled
  const compiledLevels = new Map(compiled.map((c) => [c.id, c.level]));
  const errors = validateManifest(manifest, catalogs, {
    intentIds: new Set(intents.map((i) => i.id)),
    compiledLevels,
  });
  assert.ok(errors.some((e) => e.code === "manifest/unlock-drift"));
});

test("manifest consistency: act roll-call must match level act membership", () => {
  const { catalogs, intents, compiled } = loadCorpus();
  const manifest = readJson(join(ROOT, "levels/campaign.json"));
  // Move a level into a different act on the level entry only.
  manifest.levels[0].act = manifest.acts[1].id;
  const compiledLevels = new Map(compiled.map((c) => [c.id, c.level]));
  const errors = validateManifest(manifest, catalogs, {
    intentIds: new Set(intents.map((i) => i.id)),
    compiledLevels,
  });
  assert.ok(errors.some((e) => e.code === "manifest/act-roll-call-drift"));
});

test("compiler convergence: a non-converging intent is reported", () => {
  const intents = [
    { id: "broken", intent: { id: "broken", seed: "x", topology: { archetype: "no-such-template" } } },
  ];
  const errors = validateConvergence(intents);
  assert.ok(errors.some((e) => e.code === "compiler/no-convergence"));
});
