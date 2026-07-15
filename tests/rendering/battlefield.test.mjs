import { test } from "node:test";
import assert from "node:assert/strict";

test("battlefield renderer module loads", async () => {
  const battlefield = await import("../../src/rendering/battlefield.js");

  assert.equal(typeof battlefield.drawEnemyEntity, "function");
});
