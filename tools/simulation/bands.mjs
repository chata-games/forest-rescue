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

/** Plural suffix for a count: "s" unless exactly one. */
function plural(n) {
  return n === 1 ? "" : "s";
}

/** Human-readable description of an observed result. */
export function outcomeLabel(result) {
  const hearts = result.hearts ?? 0;
  return result.won
    ? `win with ${hearts} heart${plural(hearts)}`
    : `loss/timed out with ${hearts} heart${plural(hearts)} left`;
}

/** Human-readable description of a band's heart-count window, or null when unset. */
function heartRangeLabel(band) {
  const { heartsMin: lo, heartsMax: hi } = band;
  if (lo != null && hi != null) return `between ${lo} and ${hi} heart${plural(hi)}`;
  if (lo != null) return `at least ${lo} heart${plural(lo)}`;
  if (hi != null) return `at most ${hi} heart${plural(hi)}`;
  return null;
}

/** Human-readable description of a band's expectation. */
export function bandLabel(band) {
  const range = heartRangeLabel(band);
  const head = band.outcome === "any" ? "any outcome" : band.outcome;
  return range ? `${head} with ${range}` : head;
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
      return { ok: false, actual, expected, reason: `expected ${expected}, but ${hearts} heart${plural(hearts)} survived` };
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
    return { ok: false, actual, expected, reason: `expected ${expected}, but ${hearts} heart${plural(hearts)} survived` };
  }
  return { ok: true, actual, expected };
}
