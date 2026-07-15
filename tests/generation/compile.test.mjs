import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileIntent, intentHash, readJson, ROOT } from "../../tools/levelgen/shared.mjs";

test("same seed produces identical compiled output", () => {
  const intent = readJson(join(ROOT, "levels/intents/01-meadows-edge.json"));
  const a = compileIntent(intent, { candidates: 50 });
  const b = compileIntent(intent, { candidates: 50 });
  assert.equal(a.intentHash, intentHash(intent));
  assert.equal(a.metrics.pathLength, b.metrics.pathLength);
  assert.equal(a.rings.length, b.rings.length);
  assert.deepEqual(a.paths[0].controlPoints, b.paths[0].controlPoints);
});

test("compiled levels exist for all intents", () => {
  const intents = readdirSync(join(ROOT, "levels/intents")).filter((f) => f.endsWith(".json"));
  for (const f of intents) {
    const intent = readJson(join(ROOT, "levels/intents", f));
    const compiledPath = join(ROOT, "levels/compiled", `${intent.id}.json`);
    const compiled = JSON.parse(readFileSync(compiledPath, "utf8"));
    assert.equal(compiled.id, intent.id);
    assert.ok(compiled.paths.length >= 1);
    assert.ok(compiled.rings.length >= 3);
    assert.ok(compiled.waves.length >= 1);
  }
});

test("the versioned compiler is bit-for-bit reproducible across the whole contract", () => {
  // Same intent + seed must produce identical geometry, rings, waves,
  // decorations, metrics, source hash, and compiler version. Deep-equal the
  // entire compiled document so any non-determinism fails the lock.
  const intentFiles = readdirSync(join(ROOT, "levels/intents")).filter((f) => f.endsWith(".json"));
  for (const f of intentFiles) {
    const intent = readJson(join(ROOT, "levels/intents", f));
    const a = compileIntent(intent, { candidates: 40 });
    const b = compileIntent(intent, { candidates: 40 });
    assert.equal(a.compilerVersion, b.compilerVersion, `${intent.id}: compilerVersion stable`);
    assert.equal(a.intentHash, b.intentHash, `${intent.id}: source hash stable`);
    assert.equal(a.intentHash, intentHash(intent), `${intent.id}: hash matches intent`);
    assert.deepEqual(a, b, `${intent.id}: full compiled output is reproducible`);
    // Sanity: the locked fields are present and non-empty where required.
    assert.ok(a.paths.length >= 1 && a.paths[0].samples?.length > 1, `${intent.id}: geometry present`);
    assert.ok(a.rings.length >= 1, `${intent.id}: rings present`);
    assert.ok(a.waves.length >= 1, `${intent.id}: waves present`);
    assert.ok(typeof a.metrics.pathLength === "number", `${intent.id}: metrics present`);
    assert.ok(Array.isArray(a.decorations), `${intent.id}: decorations present`);
  }
});

