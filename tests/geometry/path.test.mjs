import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng, hashString } from "../../src/engine/rng.js";
import { PathCurve } from "../../src/level/path.js";
import { dist } from "../../src/engine/geometry.js";

test("mulberry32 is deterministic", () => {
  const a = createRng("test-seed");
  const b = createRng("test-seed");
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("hashString is stable", () => {
  assert.equal(hashString("heartwood-meadow-v1"), hashString("heartwood-meadow-v1"));
});

test("path arc length increases monotonically", () => {
  const path = new PathCurve([
    { x: 1400, y: 300 },
    { x: 1000, y: 250 },
    { x: 600, y: 450 },
    { x: 45, y: 512 },
  ]);
  for (let i = 1; i < path.arcLengths.length; i++) {
    assert.ok(path.arcLengths[i] >= path.arcLengths[i - 1]);
  }
  assert.ok(path.length > 500);
});

test("positionAt endpoints", () => {
  const path = new PathCurve([
    { x: 1400, y: 300 },
    { x: 45, y: 512 },
  ]);
  const start = path.positionAt(0);
  const end = path.positionAt(path.length);
  assert.ok(dist(start.x, start.y, 1400, 300) < 20);
  assert.ok(dist(end.x, end.y, 45, 512) < 20);
});
