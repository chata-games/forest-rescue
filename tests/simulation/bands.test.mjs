import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME_BANDS,
  evaluateBand,
  bandLabel,
  outcomeLabel,
} from "../../tools/simulation/bands.mjs";

/** A sim result carries at least `won`, `hearts`, and `maxHearts`. */
function result(won, hearts, maxHearts = 5) {
  return { won, hearts, maxHearts, mana: 0, ticks: 1, defendersPlaced: 0 };
}

test("a win result inside the heart range passes the clean-win band", () => {
  const evald = evaluateBand(result(true, 5), OUTCOME_BANDS["clean-win"]);
  assert.equal(evald.ok, true);
  assert.equal(evald.actual, "win with 5 hearts");
});

test("a win with hearts below the band floor fails with an actionable reason", () => {
  const evald = evaluateBand(result(true, 2), OUTCOME_BANDS["clean-win"]);
  assert.equal(evald.ok, false);
  assert.match(evald.reason, /heart/i);
  assert.match(evald.reason, /4.*5|between/i);
});

test("a loss fails a win band even when hearts remain in range", () => {
  const evald = evaluateBand(result(false, 5), OUTCOME_BANDS["clean-win"]);
  assert.equal(evald.ok, false);
  assert.match(evald.reason, /win/i);
});

test("a loss band accepts a non-winning result (loss or timeout)", () => {
  assert.equal(evaluateBand(result(false, 0), OUTCOME_BANDS.loss).ok, true);
  // A timeout leaves hearts on the board but `won` is still false -> still a loss.
  assert.equal(evaluateBand(result(false, 5), OUTCOME_BANDS.loss).ok, true);
});

test("a loss band rejects a win", () => {
  const evald = evaluateBand(result(true, 1), OUTCOME_BANDS.loss);
  assert.equal(evald.ok, false);
  assert.match(evald.reason, /loss/i);
});

test("the hard-win band accepts a scraped win but rejects a clean win", () => {
  assert.equal(evaluateBand(result(true, 1), OUTCOME_BANDS["hard-win"]).ok, true);
  assert.equal(evaluateBand(result(true, 3), OUTCOME_BANDS["hard-win"]).ok, true);
  // 4 hearts is outside the [1,3] hard-win band even though the battle was won.
  assert.equal(evaluateBand(result(true, 4), OUTCOME_BANDS["hard-win"]).ok, false);
});

test("the any band gates only on the heart range and ignores win/loss", () => {
  assert.equal(evaluateBand(result(true, 5), OUTCOME_BANDS.any).ok, true);
  assert.equal(evaluateBand(result(false, 0), OUTCOME_BANDS.any).ok, true);
  assert.equal(evaluateBand(result(false, 3), OUTCOME_BANDS.any).ok, true);
});

test("bandLabel and outcomeLabel render human-readable expectations", () => {
  assert.equal(outcomeLabel(result(true, 4)), "win with 4 hearts");
  assert.equal(outcomeLabel(result(false, 5)), "loss/timed out with 5 hearts left");
  assert.match(bandLabel(OUTCOME_BANDS["clean-win"]), /win.*4.*5/);
  assert.match(bandLabel(OUTCOME_BANDS.loss), /loss/);
});
