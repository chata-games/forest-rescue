import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLOWER_LIFETIME,
  FLOWER_RADIUS,
  FLOWER_TAP_RADIUS,
  ManaFlower,
  drawManaFlower,
  flowerAt,
} from "../../src/level/flowers.js";
import { WORLD_H, WORLD_W } from "../../src/engine/canvas.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILED_DIR = join(HERE, "../../levels/compiled");

/** Deterministic rng stub yielding the given values in order, then repeating the last. */
function stubRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test("tap hitbox is at least 1.8x the visual radius (RP-a7h9z5)", () => {
  assert.ok(FLOWER_TAP_RADIUS >= FLOWER_RADIUS * 1.8, `tap radius ${FLOWER_TAP_RADIUS} < 1.8 * ${FLOWER_RADIUS}`);
});

test("scripted taps at flower centers land for every spawn position", () => {
  const corners = [0, 0.25, 0.5, 0.75, 1].flatMap((fy) => [0, 0.5, 1].map((fx) => [fx, fy]));
  for (const [fx, fy] of corners) {
    const f = new ManaFlower({ rng: stubRng([fx, fy, fx]) });
    assert.equal(flowerAt([f], f.x, f.y), f, `center tap misses at rng (${fx}, ${fy})`);
    // A tap one pixel inside the generous hitbox edge must still land...
    assert.equal(flowerAt([f], f.x + FLOWER_TAP_RADIUS - 1, f.y), f, `edge tap misses at rng (${fx}, ${fy})`);
    // ...while a tap clearly outside misses (and must not plant or cast instead).
    assert.equal(flowerAt([f], f.x + FLOWER_TAP_RADIUS + 4, f.y), null, `far tap hits at rng (${fx}, ${fy})`);
  }
});

test("flower lifetimes tick down toward despawn", () => {
  const f = new ManaFlower({ rng: stubRng([0.5, 0.5, 0.5]) });
  assert.equal(f.life, FLOWER_LIFETIME);
  f.update(1);
  assert.equal(f.life, FLOWER_LIFETIME - 1);
});

test("RP-a7h9z5 audit: spawn box stays inside the world for every rng draw", () => {
  for (let i = 0; i < 500; i++) {
    const f = new ManaFlower({ rng: () => (i % 1000) / 1000 });
    assert.ok(f.x >= 0 && f.x <= WORLD_W, `x ${f.x} outside world ${WORLD_W}`);
    assert.ok(f.y >= 0 && f.y <= WORLD_H, `y ${f.y} outside world ${WORLD_H}`);
  }
});

test("RP-a7h9z5 audit: every compiled level shares the one runtime flower (no per-level flower data)", () => {
  const files = readdirSync(COMPILED_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".simulation.json"));
  assert.ok(files.length >= 8, "expected the full campaign to be compiled");
  for (const file of files) {
    const level = JSON.parse(readFileSync(join(COMPILED_DIR, file), "utf8"));
    const topLevelFlowerKeys = Object.keys(level).filter((k) => /flower/i.test(k));
    assert.deepEqual(topLevelFlowerKeys, [], `${file}: unexpected flower spawn data at top level`);
    // Flowers are runtime spawns from flowers.js; the only legal "flower" data
    // is background art in decorations.
    const flowerWaves = JSON.stringify(level.waves || []).match(/flower/gi) || [];
    assert.equal(flowerWaves.length, 0, `${file}: flower data leaked into waves`);
  }
});

test("flower sprite renderer draws without touching the transform", () => {
  const calls = [];
  const ctx = new Proxy(
    { save() { calls.push("save"); }, restore() { calls.push("restore"); },
      drawImage(...args) { calls.push(["drawImage", ...args]); } },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        calls.push(prop);
        return 1;
      },
      set(target, prop, value) {
        calls.push(`set:${String(prop)}`);
        return true;
      },
    },
  );
  const f = new ManaFlower({ rng: stubRng([0.5, 0.5, 0]) });
  f.update(0.5);
  const img = {};
  assert.doesNotThrow(() => drawManaFlower(ctx, f, 10, 20, 0.5, {
    "mana-flower": { ready: true, img },
  }));
  assert.ok(calls.includes("set:globalAlpha"), "sprite must restore-capable alpha management");
  assert.equal(calls[0], "save");
  assert.equal(calls.at(-1), "restore");
  const draw = calls.find(call => Array.isArray(call));
  assert.equal(draw[1], img);
  assert.equal(draw[2] + draw[4] / 2, 10 + f.x * 0.5);
  assert.equal(draw[3] + draw[5] / 2, 20 + f.y * 0.5);
});
