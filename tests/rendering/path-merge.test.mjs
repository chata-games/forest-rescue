import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createBattlefieldRenderer } from "../../src/rendering/battlefield.js";
import { getBiome } from "../../src/content/biomes.js";

for (const reverse of [false, true]) {
  test(`merged path interiors contain no border, reverse=${reverse}`, async () => {
    const paths = [
      { controlPoints: [[0, 100], [200, 100]], width: 60 },
      { controlPoints: [[100, 0], [100, 200]], width: 40 },
    ];
    if (reverse) paths.reverse();
    const strokes = [];
    let points = [];
    const ctx = new Proxy({
      beginPath() { points = []; },
      moveTo(x, y) { points.push(`${x},${y}`); },
      lineTo(x, y) { points.push(`${x},${y}`); },
      stroke() {
        strokes.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
      },
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
    try {
      createBattlefieldRenderer({ biome: "meadow-edge", paths }, { assets: [] }).render(ctx, 1536, 1024);
    } finally {
      globalThis.document = previousDocument;
    }
    const { data, info } = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">${strokes.join("")}</svg>`
    )).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3)];
    const sand = getBiome("meadow-edge").pathColor.match(/\w\w/g).map(v => parseInt(v, 16));
    for (const [x, y] of [[76, 100], [124, 100], [100, 66], [100, 134], [100, 100]]) {
      assert.deepEqual(pixel(x, y), sand, `interior at ${x},${y} must be sand`);
    }
    assert.notDeepEqual(pixel(124, 40), sand, "outside border remains visible");
  });
}
