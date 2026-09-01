import { test } from "node:test";
import assert from "node:assert/strict";
import { plantRejectionReason } from "../../src/combat/plant-rules.js";
import { getDefender } from "../../src/content/defenders.js";

const besideRing = { id: "r-beside", placement: "beside-path" };
const onPathRing = { id: "r-onpath", placement: "on-path" };
const ctx = (over = {}) => ({ mana: 500, occupied: false, ringBurning: false, ...over });

test("a beside-path defender on an on-path ring needs a beside-path ring", () => {
  const reason = plantRejectionReason(onPathRing, getDefender("sprig-sentinel"), ctx());
  assert.equal(reason, "Needs a beside-path ring");
});

test("an on-path blocker on an ordinary ring needs an open-path ring", () => {
  const reason = plantRejectionReason(besideRing, getDefender("thornvine-bramble"), ctx());
  assert.equal(reason, "Needs an open-path ring");
});

test("a plant you cannot afford is rejected with the mana reason", () => {
  const reason = plantRejectionReason(besideRing, getDefender("sprig-sentinel"), ctx({ mana: 49 }));
  assert.equal(reason, "Not enough mana");
});

test("exactly-affordable mana plants", () => {
  const reason = plantRejectionReason(besideRing, getDefender("sprig-sentinel"), ctx({ mana: 50 }));
  assert.equal(reason, null);
});

test("an occupied ring says so", () => {
  const reason = plantRejectionReason(besideRing, getDefender("sprig-sentinel"), ctx({ occupied: true }));
  assert.equal(reason, "Ring occupied");
});

test("a burning ring says so", () => {
  const reason = plantRejectionReason(besideRing, getDefender("sprig-sentinel"), ctx({ ringBurning: true }));
  assert.equal(reason, "Ring is burning");
});

test("a legal plant has no reason", () => {
  assert.equal(plantRejectionReason(besideRing, getDefender("sprig-sentinel"), ctx()), null);
  assert.equal(plantRejectionReason(onPathRing, getDefender("thornvine-bramble"), ctx()), null);
});

test("a miss (no ring under the tap) points at the fairy rings", () => {
  const reason = plantRejectionReason(null, getDefender("sprig-sentinel"), ctx());
  assert.equal(reason, "Tap a fairy ring to plant");
});
