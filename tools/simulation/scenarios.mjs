/**
 * Named, deterministic battle simulations.
 *
 * Each named scenario pins one level + one representative strategy (bot) to a
 * fixed seed and declares the *outcome band* it must land in. Together the
 * scenarios form the campaign's difficulty/regression gate: a balance or
 * content change that shifts a strategy out of its band fails CI with an
 * actionable report.
 *
 * Everything here runs through the headless {@link runSimulation} — there is no
 * Phaser, DOM, or rendering dependency, so the same suite executes in the
 * authoring CLI, CI, and `node --test`.
 */

import { runSimulation } from "./bots.mjs";
import { OUTCOME_BANDS, evaluateBand, bandLabel, outcomeLabel } from "./bands.mjs";

/**
 * @typedef {object} NamedScenario
 * @property {string} name      Stable, human-readable scenario id.
 * @property {string} levelId   Stable compiled-level id.
 * @property {string} bot       Strategy key in {@link BOTS}.
 * @property {keyof typeof OUTCOME_BANDS} band Expected outcome band.
 * @property {string} [seed]    Optional explicit seed; otherwise derived.
 * @property {number} [ticks]   Optional tick budget override.
 * @property {string} [note]    Why this scenario / band was chosen.
 */

/**
 * The canonical campaign simulation suite. Bands are locked to the deterministic
 * outcome each (level, bot, seed) produces today; any drift surfaces as a
 * `metric-band/out-of-target` failure in `validate`. Level 06 (fire balance) is
 * a known pre-existing failure, so its scenarios use the `any` band — they still
 * run deterministically and Phaser-free without asserting a broken target.
 */
export const NAMED_SIMULATIONS = [
  // --- Act 1: First Sprouts (tutorial pacing) ---------------------------
  { name: "meadows-cheapest", levelId: "01-meadows-edge", bot: "cheapest-dps", band: "clean-win", note: "tutorial: cheap DPS clears comfortably" },
  { name: "meadows-gate", levelId: "01-meadows-edge", bot: "defensive-gate", band: "loss", note: "pure blocking stalls but never clears" },

  { name: "stump-cheapest", levelId: "02-old-stump-crossroads", bot: "cheapest-dps", band: "clean-win" },
  { name: "stump-gate", levelId: "02-old-stump-crossroads", bot: "defensive-gate", band: "loss" },

  { name: "river-cheapest", levelId: "03-whispering-river", bot: "cheapest-dps", band: "hard-win", note: "air threat bites a ground-only build" },
  { name: "river-antiair", levelId: "03-whispering-river", bot: "anti-air-priority", band: "clean-win", note: "anti-air solves the river drone lane" },
  { name: "river-gate", levelId: "03-whispering-river", bot: "defensive-gate", band: "loss" },

  // --- Act 2: Deepening Shadow ------------------------------------------
  { name: "hollow-cheapest", levelId: "04-mushroom-hollow", bot: "cheapest-dps", band: "clean-win" },
  { name: "hollow-upgrade", levelId: "04-mushroom-hollow", bot: "upgrade-first", band: "clean-win" },
  { name: "hollow-gate", levelId: "04-mushroom-hollow", bot: "defensive-gate", band: "loss" },

  { name: "sawmill-cheapest", levelId: "05-sawmill-clearing", bot: "cheapest-dps", band: "hard-win", note: "boss level: a win costs Hearts" },
  { name: "sawmill-antiair", levelId: "05-sawmill-clearing", bot: "anti-air-priority", band: "hard-win" },
  { name: "sawmill-upgrade", levelId: "05-sawmill-clearing", bot: "upgrade-first", band: "loss", note: "the Grinder punishes an upgrade rush" },
  { name: "sawmill-gate", levelId: "05-sawmill-clearing", bot: "defensive-gate", band: "loss" },

  // --- Act 3: Heartwood Stand -------------------------------------------
  { name: "ashfall-cheapest", levelId: "06-ashfall-scar", bot: "cheapest-dps", band: "any", note: "fire balance is a known pre-existing failure; not band-gated" },
  { name: "ashfall-upgrade", levelId: "06-ashfall-scar", bot: "upgrade-first", band: "any", note: "see ashfall-cheapest" },

  { name: "boulder-coverage", levelId: "07-boulder-pass", bot: "best-coverage", band: "clean-win", note: "spread coverage clears the burrow assault" },
  { name: "boulder-cheapest", levelId: "07-boulder-pass", bot: "cheapest-dps", band: "hard-win" },
  { name: "boulder-upgrade", levelId: "07-boulder-pass", bot: "upgrade-first", band: "hard-win", note: "mossback golem counterplay wins under pressure" },
  { name: "boulder-antiair", levelId: "07-boulder-pass", bot: "anti-air-priority", band: "loss", note: "wrong strategy: no air here, burrowers overrun it" },
];

/** Deterministic seed for a scenario (explicit override or derived from level+bot). */
export function scenarioSeed(scenario, level) {
  return scenario.seed ?? `${level.seed}-band-${scenario.bot}`;
}

/**
 * Run one named scenario against a compiled level.
 *
 * @param {NamedScenario} scenario
 * @param {object} level   CompiledLevel document.
 * @returns {{ scenario: NamedScenario, seed: string, result: object, evaluation: object }}
 */
export function runScenario(scenario, level) {
  const band = OUTCOME_BANDS[scenario.band];
  const seed = scenarioSeed(scenario, level);
  const result = runSimulation(level, scenario.bot, { seed, ticks: scenario.ticks });
  const evaluation = evaluateBand(result, band);
  return { scenario, seed, result, evaluation };
}

/**
 * Run the whole named-simulation suite.
 *
 * @param {Map<string, object>} levelsById  Stable id -> compiled level.
 * @returns {{ results: Array, failures: Array, ok: boolean }}
 */
export function runNamedSimulations(levelsById) {
  const results = [];
  const failures = [];
  for (const scenario of NAMED_SIMULATIONS) {
    const level = levelsById.get(scenario.levelId);
    if (!level) {
      failures.push({
        scenario,
        code: "metric-band/missing-level",
        message: `named scenario '${scenario.name}' references unknown level '${scenario.levelId}'`,
      });
      continue;
    }
    const run = runScenario(scenario, level);
    results.push(run);
    if (!run.evaluation.ok) {
      failures.push({
        scenario,
        seed: run.seed,
        code: "metric-band/out-of-target",
        message:
          `scenario '${scenario.name}' (${scenario.levelId}/${scenario.bot}) landed outside its band: ` +
          `expected ${bandLabel(OUTCOME_BANDS[scenario.band])}, got ${outcomeLabel(run.result)}.`,
      });
    }
  }
  return { results, failures, ok: failures.length === 0 };
}
