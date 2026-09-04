import { test } from "node:test";
import assert from "node:assert/strict";
import { createBattlefieldRenderer } from "../../src/rendering/battlefield.js";

test("on-path build spots keep a solid dark border against the sand", () => {
  const strokes = [];
  let circle;
  const ctx = new Proxy({
    arc: (x, y, radius) => { circle = { x, y, radius }; },
    stroke() { strokes.push({ ...circle, color: this.strokeStyle, width: this.lineWidth }); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  try {
    createBattlefieldRenderer({ biome: "meadow-edge", paths: [], rings: [
      { id: "blocker", x: 813, y: 386, placement: "on-path", buildRadius: 38 },
    ] }, { assets: [] }).render(ctx, 1536, 1024);
    assert.ok(strokes.some(s => s.x === 813 && s.y === 386 && s.width >= 6 && /^#[0-9a-f]{6}$/i.test(s.color)),
      "blocker needs an opaque border wide enough to remain visible after scaling");
  } finally {
    globalThis.document = previousDocument;
  }
});
