/**
 * Authoring-contract validation rules for the stable-ID campaign.
 *
 * The JSON-schema files catch structural errors; this module layers on the
 * semantic rules the schemas cannot express:
 *   - catalog-reference errors (enemies / defenders / spells / bosses exist),
 *   - forbidden authored geometry in LevelIntent (coordinates stay out),
 *   - cross-field teaching rules (learningGoal <-> modifiers <-> boss),
 *   - invalid compiled path/ring geometry,
 *   - missing or duplicate stable IDs,
 *   - manifest <-> compiled/intent consistency,
 *   - compiler convergence,
 *   - deterministic replay (compiled output reproduces from its intent),
 *   - outcome-band simulation (named strategies land in their target band).
 *
 * Every check returns an array of {@link ValidationError} objects so the CLI
 * (`validate.mjs`) and the tests can share one error shape.
 */

import { ENEMIES } from "../../src/content/enemies.js";
import { DEFENDERS } from "../../src/content/defenders.js";
import { SPELLS } from "../../src/content/spells.js";
import {
  TOPOLOGY_TEMPLATES,
  BUDGET_CURVES,
  WORLD_W,
  WORLD_H,
  compileIntent,
  buildPath,
  pathInBounds,
  pathSelfIntersects,
} from "./shared.mjs";
import { runNamedSimulations } from "../simulation/scenarios.mjs";

/**
 * @typedef {{ code: string, message: string, source?: string }} ValidationError
 */

export const KNOWN_RING_ROLES = new Set([
  "frontline",
  "chokepoint",
  "support",
  "long-range",
  "gate-defense",
]);

/** Keys that smuggle authored gameplay geometry into a coordinate-free intent. */
export const FORBIDDEN_GEOMETRY_KEYS = new Set([
  "paths",
  "path",
  "controlPoints",
  "samples",
  "waypoints",
  "nodes",
  "vertices",
  "rings",
  "fairyRings",
  "fairyRingPositions",
  "decorations",
  "hitRegions",
  "regions",
  "coordinates",
  "points",
  "segments",
  "x",
  "y",
]);

/**
 * Cross-field teaching rules. Each rule applies to an intent whose `applies`
 * predicate is true; if `violated` is true the intent fails with `message`.
 * Rules are derived from — and must remain satisfied by — the shipped content.
 */
export const TEACHING_RULES = [
  {
    code: "teaching/fire-management-requires-fire-spread",
    applies: (i) => i.learningGoal === "fire-management",
    violated: (i) => !(i.levelModifiers || []).includes("fire-spread"),
    message: "learningGoal 'fire-management' requires levelModifier 'fire-spread'",
  },
  {
    code: "teaching/light-management-requires-darkness",
    applies: (i) => i.learningGoal === "light-management",
    violated: (i) => !(i.levelModifiers || []).includes("darkness"),
    message: "learningGoal 'light-management' requires levelModifier 'darkness'",
  },
  {
    code: "teaching/boss-requires-boss-enemy",
    applies: (i) => Boolean(i.bossId),
    violated: (i, cats) => {
      const enemy = cats.enemies[i.bossId];
      if (!enemy) return true;
      return !(enemy.boss || (enemy.tags || []).some((t) => t === "boss" || t === "mini-boss"));
    },
    message: (i) => `bossId '${i.bossId}' must reference a boss or mini-boss enemy`,
  },
  {
    // Whispering River (issue #35): air coverage is taught by contrasting the
    // winding ground trail with a direct flying route, so the river-crossings
    // topology and at least one flying enemy must be present.
    code: "teaching/air-coverage-requires-river-crossings",
    applies: (i) => i.learningGoal === "air-coverage",
    violated: (i, cats) => {
      if (!(i.levelModifiers || []).includes("river-crossings")) return true;
      const hasFlying = (i.waves?.allowedEnemies || []).some((e) => cats.enemies[e]?.flying);
      return !hasFlying;
    },
    message: "learningGoal 'air-coverage' requires levelModifier 'river-crossings' and a flying enemy",
  },
];

export function loadCatalogs() {
  return {
    enemies: ENEMIES,
    defenders: DEFENDERS,
    spells: SPELLS,
    topologies: TOPOLOGY_TEMPLATES,
    budgetCurves: BUDGET_CURVES,
    ringRoles: KNOWN_RING_ROLES,
  };
}

/** Recursively collect dotted paths of any forbidden geometry keys in `value`. */
export function findForbiddenGeometry(value, prefix = "") {
  const hits = [];
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...findForbiddenGeometry(item, `${prefix}[${i}]`)));
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (FORBIDDEN_GEOMETRY_KEYS.has(key)) hits.push(path);
    hits.push(...findForbiddenGeometry(child, path));
  }
  return hits;
}

function ref(catalog, id) {
  return Boolean(catalog[id]);
}

/**
 * Semantic checks for a single LevelIntent: catalog references, topology /
 * budget-curve / ring-role validity, forbidden geometry, and teaching rules.
 * @param {object} intent
 * @param {object} catalogs
 * @param {string} [source]
 * @returns {ValidationError[]}
 */
export function validateIntentRules(intent, catalogs, source) {
  const errors = [];
  const at = (code, message) => errors.push({ code, message, source });

  if (!intent || typeof intent !== "object") return errors;

  for (const id of intent.waves?.allowedEnemies || []) {
    if (!ref(catalogs.enemies, id)) at("ref/enemy", `waves.allowedEnemies references unknown enemy '${id}'`);
  }
  for (const override of intent.waveOverrides || []) {
    for (const entry of override.enemies || []) {
      if (!ref(catalogs.enemies, entry.type)) {
        at("ref/enemy", `waveOverrides references unknown enemy '${entry.type}'`);
      }
    }
  }
  if (intent.bossId && !ref(catalogs.enemies, intent.bossId)) {
    at("ref/enemy", `bossId references unknown enemy '${intent.bossId}'`);
  }
  if (intent.spellUnlock && !ref(catalogs.spells, intent.spellUnlock)) {
    at("ref/spell", `spellUnlock references unknown spell '${intent.spellUnlock}'`);
  }
  for (const id of intent.unlocks || []) {
    if (!ref(catalogs.defenders, id)) at("ref/defender", `unlocks references unknown defender '${id}'`);
  }
  for (const id of intent.placementRules?.onPathDefenders || []) {
    if (!ref(catalogs.defenders, id)) {
      at("ref/defender", `placementRules.onPathDefenders references unknown defender '${id}'`);
    }
  }
  if (intent.topology?.archetype && !catalogs.topologies[intent.topology.archetype]) {
    at("ref/topology", `topology.archetype references unknown archetype '${intent.topology.archetype}'`);
  }
  if (intent.waves?.budgetCurve && !catalogs.budgetCurves[intent.waves.budgetCurve]) {
    at("ref/budget-curve", `waves.budgetCurve references unknown curve '${intent.waves.budgetCurve}'`);
  }
  for (const role of intent.ringRoles || []) {
    if (!catalogs.ringRoles.has(role)) at("ref/ring-role", `ringRoles references unknown role '${role}'`);
  }

  for (const keyPath of findForbiddenGeometry(intent)) {
    at("geometry/forbidden-in-intent", `LevelIntent must remain coordinate-free; found geometry key '${keyPath}'`);
  }

  for (const rule of TEACHING_RULES) {
    if (!rule.applies(intent)) continue;
    const message = typeof rule.message === "function" ? rule.message(intent) : rule.message;
    if (rule.violated(intent, catalogs)) at(rule.code, message);
  }

  return errors;
}

/**
 * Geometry + reference checks for a compiled level's generated output.
 * @returns {ValidationError[]}
 */
export function validateCompiledRules(compiled, catalogs, source) {
  const errors = [];
  const at = (code, message) => errors.push({ code, message, source });
  if (!compiled || typeof compiled !== "object") return errors;

  for (const pathJson of compiled.paths || []) {
    if (!Array.isArray(pathJson.controlPoints) || pathJson.controlPoints.length < 2) {
      at("geometry/path-shape", `path '${pathJson.id || "main"}' is missing controlPoints`);
      continue;
    }
    const path = buildPath(pathJson.controlPoints, pathJson.width || 92);
    if (!pathInBounds(path)) {
      at("geometry/path-out-of-bounds", `path '${pathJson.id || "main"}' leaves the battlefield`);
    }
    if (pathSelfIntersects(path)) {
      at("geometry/path-self-intersects", `path '${pathJson.id || "main"}' self-intersects`);
    }
  }

  for (const ring of compiled.rings || []) {
    if (ring.x == null || ring.y == null) {
      at("geometry/ring-position", `ring '${ring.id}' is missing x/y`);
      continue;
    }
    if (ring.x < 0 || ring.x > WORLD_W || ring.y < 0 || ring.y > WORLD_H) {
      at("geometry/ring-out-of-bounds", `ring '${ring.id}' leaves the battlefield`);
    }
    if (ring.role && !catalogs.ringRoles.has(ring.role)) {
      at("ref/ring-role", `ring '${ring.id}' has unknown role '${ring.role}'`);
    }
  }

  for (const wave of compiled.waves || []) {
    for (const entry of wave.enemies || []) {
      if (!ref(catalogs.enemies, entry.type)) {
        at("ref/enemy", `compiled wave references unknown enemy '${entry.type}'`);
      }
    }
  }

  // River-crossings hazard geometry (issue #35): the ground path the air lane
  // cuts across, projected via its arc length.
  const groundPath =
    Array.isArray(compiled.paths) && compiled.paths[0]?.controlPoints?.length >= 2
      ? buildPath(compiled.paths[0].controlPoints, compiled.paths[0].width || 92)
      : null;

  for (const mask of compiled.waterMasks || []) {
    if (mask.x == null || mask.y == null || mask.rx == null || mask.ry == null) {
      at("geometry/water-mask-shape", "a water mask is missing x/y/rx/ry");
      continue;
    }
    if (
      mask.x - mask.rx < 0 || mask.x + mask.rx > WORLD_W ||
      mask.y - mask.ry < 0 || mask.y + mask.ry > WORLD_H
    ) {
      at("geometry/water-mask-out-of-bounds", "a water mask leaves the battlefield");
    }
  }

  for (const lane of compiled.airLanes || []) {
    const foe = catalogs.enemies[lane.forEnemy];
    if (!foe) {
      at("ref/enemy", `air lane references unknown enemy '${lane.forEnemy}'`);
    } else if (!foe.flying) {
      at("geometry/air-lane-enemy", `air lane forEnemy '${lane.forEnemy}' is not a flying enemy`);
    }
    const { from, to } = lane;
    if (!from || !to || from.x == null || from.y == null || to.x == null || to.y == null) {
      at("geometry/air-lane-shape", `air lane for '${lane.forEnemy}' is missing from/to endpoints`);
      continue;
    }
    if (
      from.x < 0 || from.x > WORLD_W || from.y < 0 || from.y > WORLD_H ||
      to.x < 0 || to.x > WORLD_W || to.y < 0 || to.y > WORLD_H
    ) {
      at("geometry/air-lane-out-of-bounds", `air lane for '${lane.forEnemy}' leaves the battlefield`);
    }
    // The air lane must actually "cut across" the winding ground trail: its
    // straight length is shorter than the ground arc between the two points the
    // lane endpoints project onto (a real shortcut across the bends).
    if (groundPath) {
      const airDist = Math.hypot(to.x - from.x, to.y - from.y);
      const sFrom = groundPath.distanceAlong(from.x, from.y).s;
      const sTo = groundPath.distanceAlong(to.x, to.y).s;
      const groundArc = Math.abs(sTo - sFrom);
      if (!(airDist > 0) || airDist >= groundArc) {
        at(
          "geometry/air-lane-not-shortcut",
          `air lane for '${lane.forEnemy}' does not cut across the ground trail (air ${airDist.toFixed(0)} >= ground ${groundArc.toFixed(0)})`,
        );
      }
    }
  }

  return errors;
}

/**
 * Manifest checks beyond the JSON schema: act references, map positions,
 * unlock catalog references, and consistency between manifest and the
 * compiled/intent sets.
 * @returns {ValidationError[]}
 */
export function validateManifest(manifest, catalogs, { intentIds, compiledLevels }) {
  const errors = [];
  const at = (code, message) => errors.push({ code, message, source: "levels/campaign.json" });
  if (!manifest || typeof manifest !== "object") return errors;

  const acts = new Map((manifest.acts || []).map((a) => [a.id, a]));
  const levelsByAct = new Map();
  const seenIds = new Set();

  for (const level of manifest.levels || []) {
    if (seenIds.has(level.id)) {
      at("ids/duplicate-manifest-id", `manifest lists stable ID '${level.id}' more than once`);
    }
    seenIds.add(level.id);

    if (!acts.has(level.act)) {
      at("manifest/unknown-act", `level '${level.id}' references undeclared act '${level.act}'`);
    } else {
      const bucket = levelsByAct.get(level.act) || [];
      bucket.push(level.id);
      levelsByAct.set(level.act, bucket);
    }
    if (!intentIds.has(level.id)) {
      at("ids/missing-intent", `manifest references level '${level.id}' with no intent`);
    }
    const compiled = compiledLevels.get(level.id);
    if (!compiled) {
      at("ids/missing-compiled", `manifest references level '${level.id}' with no compiled output`);
    } else {
      const manifestUnlocks = [...(level.unlocks || [])].sort();
      const compiledUnlocks = [...(compiled.unlocks || [])].sort();
      if (JSON.stringify(manifestUnlocks) !== JSON.stringify(compiledUnlocks)) {
        at("manifest/unlock-drift", `level '${level.id}' manifest unlocks do not match compiled unlocks`);
      }
      if ((level.spellUnlock || null) !== (compiled.spellUnlock || null)) {
        at("manifest/spell-drift", `level '${level.id}' manifest spellUnlock does not match compiled spellUnlock`);
      }
    }
    for (const id of level.unlocks || []) {
      if (!ref(catalogs.defenders, id)) at("ref/defender", `manifest level '${level.id}' unlocks unknown defender '${id}'`);
    }
    if (level.spellUnlock && !ref(catalogs.spells, level.spellUnlock)) {
      at("ref/spell", `manifest level '${level.id}' unlocks unknown spell '${level.spellUnlock}'`);
    }
  }

  // The act roll-call and each level's `act` field are redundant; they must agree.
  for (const [actId, act] of acts) {
    const declared = [...(act.levels || [])].sort();
    const declaredByLevel = [...(levelsByAct.get(actId) || [])].sort();
    if (JSON.stringify(declared) !== JSON.stringify(declaredByLevel)) {
      at("manifest/act-roll-call-drift", `act '${actId}' level roll-call does not match level act membership`);
    }
  }

  return errors;
}

/**
 * Stable-ID integrity across the whole corpus: intents and compiled files must
 * each have unique IDs, and every manifest level must resolve to both.
 * @returns {ValidationError[]}
 */
export function validateStableIds({ intents, compiled, manifest }) {
  const errors = [];
  const at = (code, message) => errors.push({ code, message });

  const intentCount = new Map();
  for (const { id } of intents) intentCount.set(id, (intentCount.get(id) || 0) + 1);
  for (const [id, count] of intentCount) {
    if (count > 1) at("ids/duplicate-intent", `intent stable ID '${id}' appears ${count} times`);
  }

  const compiledCount = new Map();
  for (const { id } of compiled) compiledCount.set(id, (compiledCount.get(id) || 0) + 1);
  for (const [id, count] of compiledCount) {
    if (count > 1) at("ids/duplicate-compiled", `compiled stable ID '${id}' appears ${count} times`);
  }

  const manifestIds = new Set((manifest?.levels || []).map((l) => l.id));
  for (const { id, source } of intents) {
    if (!manifestIds.has(id) && !id.startsWith("00-")) {
      at("ids/orphan-intent", `intent '${id}' (${source}) is not in the campaign manifest`);
    }
  }

  return errors;
}

/**
 * Compiler convergence: every intent must compile without throwing.
 * @param {{id: string, intent: object}[]} intents
 * @param {number} [candidates]
 * @returns {ValidationError[]}
 */
export function validateConvergence(intents, candidates = 40) {
  const errors = [];
  for (const { id, intent } of intents) {
    try {
      compileIntent(intent, { candidates });
    } catch (err) {
      errors.push({
        code: "compiler/no-convergence",
        message: `compiler failed to converge for '${id}': ${err.message}`,
      });
    }
  }
  return errors;
}

/**
 * Deterministic replay: recompile every intent that ships a compiled file and
 * assert the output is bit-for-bit identical. Catches compiled/intent drift
 * (the "deterministic replay" failure category) using the same default
 * candidate budget the production `compile --all` uses.
 * @returns {ValidationError[]}
 */
export function validateReplay({ intents, compiled }) {
  const errors = [];
  const at = (code, message, source) => errors.push({ code, message, source });
  const shipped = new Map(compiled.map((c) => [c.id, c.level]));
  for (const { id, intent, source } of intents) {
    const level = shipped.get(id);
    if (!level) continue; // missing compiled output is reported by the manifest check
    try {
      const replay = compileIntent(intent);
      if (JSON.stringify(replay) !== JSON.stringify(level)) {
        at("compiler/output-drift", `compiled output for '${id}' no longer reproduces from its intent`, source || `replay:${id}`);
      }
    } catch (err) {
      at("compiler/output-drift", `replay failed to recompile '${id}': ${err.message}`, source || `replay:${id}`);
    }
  }
  return errors;
}

/**
 * Outcome-band simulation gate: run the named strategy scenarios and report any
 * that land outside their declared band. This is the "metric-band" failure
 * category — it rejects out-of-target difficulty with an actionable report
 * before content is accepted.
 * @param {Map<string, object>} levelsById
 * @returns {ValidationError[]}
 */
export function validateOutcomeBands(levelsById) {
  const { failures } = runNamedSimulations(levelsById);
  return failures.map((f) => ({
    code: f.code,
    message: f.message,
    source: `scenario:${f.scenario.name}`,
  }));
}

/**
 * Run every semantic check across the corpus and return the combined errors.
 * @param {{intents: Array, compiled: Array, manifest: object, catalogs: object}} input
 * @returns {ValidationError[]}
 */
export function validateAll({ intents, compiled, manifest, catalogs }) {
  const errors = [];
  const levelsById = new Map(compiled.map((c) => [c.id, c.level]));
  for (const { id, intent, source } of intents) {
    errors.push(...validateIntentRules(intent, catalogs, source || `intent:${id}`));
  }
  for (const { id, level, source } of compiled) {
    errors.push(...validateCompiledRules(level, catalogs, source || `compiled:${id}`));
  }
  if (manifest) {
    const intentIds = new Set(intents.map((i) => i.id));
    errors.push(...validateManifest(manifest, catalogs, { intentIds, compiledLevels: levelsById }));
  }
  errors.push(...validateStableIds({ intents, compiled, manifest }));
  errors.push(...validateConvergence(intents.map(({ id, intent }) => ({ id, intent }))));
  errors.push(...validateReplay({ intents, compiled }));
  errors.push(...validateOutcomeBands(levelsById));
  return errors;
}
