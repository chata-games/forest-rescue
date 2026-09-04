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
