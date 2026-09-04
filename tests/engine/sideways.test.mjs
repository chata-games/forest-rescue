import { test } from "node:test";
import assert from "node:assert/strict";
import { frameSizeFor, isSidewaysActive, localPointFor } from "../../src/engine/sideways.js";

// Sideways mode (RP-eqbawv): the pure mapping between the rotated frame and the
// screen, used by every canvas that measures itself or reads pointer positions.

test("rotates only when enabled and the viewport is physically portrait", () => {
  assert.equal(isSidewaysActive(true, 390, 844), true);
  // The phone did rotate on its own: never rotate the frame a second time.
  assert.equal(isSidewaysActive(true, 844, 390), false);
  assert.equal(isSidewaysActive(true, 800, 800), false);
  assert.equal(isSidewaysActive(false, 390, 844), false);
});

test("frame size swaps the screen rect's axes while rotated", () => {
  const rect = { width: 200, height: 300 };
  assert.deepEqual(frameSizeFor(true, rect), { width: 300, height: 200 });
  assert.deepEqual(frameSizeFor(false, rect), { width: 200, height: 300 });
});

test("local point maps screen taps back onto the unrotated frame", () => {
  // A 300x200 (layout) canvas rotated clockwise occupies a 200-wide, 300-tall
  // screen box at (50, 100).
  const rect = { left: 50, top: 100, width: 200, height: 300 };
  // Frame top-left sits at the screen box's top-right corner.
  assert.deepEqual(localPointFor(true, rect, 250, 100), { x: 0, y: 0 });
  // Frame top-right (layout x=300) sits at the screen box's bottom-right.
  assert.deepEqual(localPointFor(true, rect, 250, 400), { x: 300, y: 0 });
  // Frame bottom-left (layout y=200) sits at the screen box's top-left.
  assert.deepEqual(localPointFor(true, rect, 50, 100), { x: 0, y: 200 });
  // Centre maps to centre.
  assert.deepEqual(localPointFor(true, rect, 150, 250), { x: 150, y: 100 });
  // Unrotated: plain offset.
  assert.deepEqual(localPointFor(false, rect, 60, 130), { x: 10, y: 30 });
});
