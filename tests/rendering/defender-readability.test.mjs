import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFENDERS } from "../../src/content/defenders.js";
import { DefenderEntity, PLANT_FLASH } from "../../src/entities/defender.js";
import * as battlefield from "../../src/rendering/battlefield.js";

test("every defender type carries a distinct accent for its persistent outline (RP-k0e3xc)", () => {
  const accents = Object.values(DEFENDERS).map((d) => d.accent);
  for (const d of Object.values(DEFENDERS)) {
    assert.match(d.accent, /^#[0-9a-f]{6}$/i, `${d.id} accent must be an rgb hex color`);
    assert.ok(d.sprite, `${d.id} must declare a sprite silhouette`);
  }
  assert.equal(new Set(accents).size, accents.length, "accents must be unique per type");
});

test("placement flash is a one-shot seeded on construction and decays to spent (RP-k0e3xc)", () => {
  const stats = DEFENDERS["sprig-sentinel"];
  const d = new DefenderEntity("ring-x", "sprig-sentinel", { id: "ring-x", x: 10, y: 20 }, stats);
  assert.equal(d.plantFlash, PLANT_FLASH);
  assert.ok(PLANT_FLASH > 0 && PLANT_FLASH < 1, "flash must be a brief one-shot");
  d.update(PLANT_FLASH / 2, { defenders: [], enemies: [] });
  assert.ok(d.plantFlash > 0, "flash still live at half life");
  d.update(PLANT_FLASH, { defenders: [], enemies: [] });
  assert.equal(d.plantFlash, 0, "flash fully spent after its window");
});

test("battlefield renderer exposes the defender draw used by the game (RP-k0e3xc)", () => {
  assert.equal(typeof battlefield.drawDefenderEntity, "function");
  assert.equal(typeof battlefield.drawDarknessOverlay, "function");
});
