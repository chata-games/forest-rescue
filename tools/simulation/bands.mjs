/**
 * Outcome bands for battle simulation.
 *
 * A band describes an *acceptable region* of simulation results rather than a
 * single brittle scalar. Instead of asserting `winRate >= 0.45`, a band says:
 *
 *   "this strategy on this level should land in outcome X with the surviving
 *    Heartwood health inside [heartsMin, heartsMax]."
 *
 * Bands are evaluated against one deterministic simulation result (a named
 * scenario with a fixed seed). They are pure data + a pure evaluator, so they
 * have no Phaser, DOM, or engine dependency and run identically in CI, the
 * authoring CLI, and unit tests.
 */

/**
 * @typedef {"win" | "loss" | "any"} OutcomeKind
 */

/**
 * @typedef {object} OutcomeBand
 * @property {OutcomeKind} outcome  Expected win/loss outcome (`any` ignores it).
 * @property {number} [heartsMin]   Inclusive lower bound on surviving hearts.
 * @property {number} [heartsMax]   Inclusive upper bound on surviving hearts.
 * @property {string} [note]        Optional human note (e.g. why a band is loose).
 */

/**
 * @typedef {object} SimResult
 * @property {boolean} won
 * @property {number} hearts
 * @property {number} [maxHearts]
 */

/**
 * Reusable band presets. Named scenarios reference these by key so the
 * expectation and its tolerance live in exactly one place.
 */
export const OUTCOME_BANDS = {
  // A comfortable win — at most one Heart leaked.
  "clean-win": { outcome: "win", heartsMin: 4, heartsMax: 5 },
  // A win earned under pressure — the Heartwood is bloodied but holds.
  "hard-win": { outcome: "win", heartsMin: 1, heartsMax: 3 },
  // Any win, regardless of margin.
  win: { outcome: "win", heartsMin: 1, heartsMax: 5 },
  // A loss (defeat or failure to clear within the tick budget).
  loss: { outcome: "loss" },
  // Outcome-agnostic: used for levels whose balance is not yet locked so the
  // simulation still runs deterministically without asserting a target.
  any: { outcome: "any" },
};

/** Human-readable description of an observed result. */
export function outcomeLabel(result) {
  const hearts = result.hearts ?? 0;
  return result.won
    ? `win with ${hearts} heart${hearts === 1 ? "" : "s"}`
    : `loss/timed out with ${hearts} heart${hearts === 1 ? "" : "s"} left`;
}

/** Human-readable description of a band's expectation. */
export function bandLabel(band) {
  const lo = band.heartsMin;
  const hi = band.heartsMax;
  const range =
    lo != null && hi != null
      ? `between ${lo} and ${hi} heart${hi === 1 ? "" : "s"}`
      : lo != null
        ? `at least ${lo} heart${lo === 1 ? "" : "s"}`
        : hi != null
          ? `at most ${hi} heart${hi === 1 ? "" : "s"}`
          : null;
  if (band.outcome === "win") return range ? `win with ${range}` : "win";
  if (band.outcome === "loss") return range ? `loss with ${range}` : "loss";
  return range ? `any outcome with ${range}` : "any outcome";
}

function heartBounds(band, result) {
  const max = result?.maxHearts ?? 5;
  return {
    lo: band.heartsMin ?? 0,
    hi: band.heartsMax ?? max,
  };
}

/**
 * Evaluate a simulation result against an outcome band.
 *
 * @param {SimResult} result
 * @param {OutcomeBand} band
 * @returns {{ ok: boolean, actual: string, expected: string, reason?: string }}
 */
export function evaluateBand(result, band) {
  const actual = outcomeLabel(result);
  const expected = bandLabel(band);
  const hearts = result.hearts ?? 0;
  const { lo, hi } = heartBounds(band, result);

  const inHeartRange = hearts >= lo && hearts <= hi;

  if (band.outcome === "win") {
    if (!result.won) {
      return { ok: false, actual, expected, reason: `expected a win, but the strategy ${actual}` };
    }
    if (!inHeartRange) {
      return { ok: false, actual, expected, reason: `expected ${expected}, but ${hearts} heart${hearts === 1 ? "" : "s"} survived` };
    }
    return { ok: true, actual, expected };
  }

  if (band.outcome === "loss") {
    if (result.won) {
      return { ok: false, actual, expected, reason: `expected a loss, but the strategy ${actual}` };
    }
    return { ok: true, actual, expected };
  }

  // outcome === "any": gate only on the heart range, if any.
  if (!inHeartRange) {
    return { ok: false, actual, expected, reason: `expected ${expected}, but ${hearts} heart${hearts === 1 ? "" : "s"} survived` };
  }
  return { ok: true, actual, expected };
}
