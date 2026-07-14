import { test } from "node:test";
import assert from "node:assert/strict";

test("legacy lane module exports initLegacyLane", async () => {
  const mod = await import("../../src/legacy-lane.js");
  assert.equal(typeof mod.initLegacyLane, "function");
});
