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
