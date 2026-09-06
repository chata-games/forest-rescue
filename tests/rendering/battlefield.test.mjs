import { test } from "node:test";
import assert from "node:assert/strict";

import { clearCanvasFrame, isInsideWorld } from "../../src/engine/canvas.js";

test("battlefield renderer module loads", async () => {
  const battlefield = await import("../../src/rendering/battlefield.js");

  assert.equal(typeof battlefield.drawEnemyEntity, "function");
});

test("each frame clears the complete high-DPI canvas before drawing", () => {
  const calls = [];
  const ctx = {
    canvas: { width: 2400, height: 1200 },
    save: () => calls.push(["save"]),
    resetTransform: () => calls.push(["resetTransform"]),
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    restore: () => calls.push(["restore"]),
  };

  clearCanvasFrame(ctx);

  assert.deepEqual(calls, [
    ["save"],
    ["resetTransform"],
    ["clearRect", 0, 0, 2400, 1200],
    ["restore"],
  ]);
});

test("range previews stay inside the scaled battlefield", () => {
  assert.equal(isInsideWorld({ x: 0, y: 0 }), true);
  assert.equal(isInsideWorld({ x: 1536, y: 1024 }), true);
  assert.equal(isInsideWorld({ x: -1, y: 512 }), false);
  assert.equal(isInsideWorld({ x: 1537, y: 512 }), false);
});

test("extended forest covers the visible world and entrances continue beyond it", async () => {
  const { createBattlefieldRenderer } = await import("../../src/rendering/battlefield.js");
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => key in target ? target[key] : (...args) => calls.push([key, ...args]),
  });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  try {
    const renderer = createBattlefieldRenderer({
      biome: "meadow-edge",
      paths: [{ controlPoints: [[1456, 512], [45, 512]], width: 60 }],
    }, { assets: [] });
    const bounds = { x: -3000, y: -1000, width: 7500, height: 3000 };
    renderer.renderRegion(ctx, 1500, 600, bounds);
    assert.ok(calls.some(([name, ...args]) => name === "fillRect" && args.join() === "-3000,-1000,7500,3000"));
    assert.ok(calls.some(([name, x, y]) => name === "translate" && x === 3000 && y === 1000));
    assert.ok(calls.some(([name, x]) => name === "moveTo" && x > bounds.x + bounds.width));
    assert.ok(calls.some(([name, x, y]) => name === "lineTo" && x === 45 && y === 512));
  } finally {
    globalThis.document = previousDocument;
  }
});
