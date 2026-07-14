import {
  BUDGET_CURVES,
  ENEMY_THREAT,
  TOPOLOGY_TEMPLATES,
  WORLD_H,
  WORLD_W,
  compileIntent,
} from "../../tools/levelgen/shared.mjs";
import { BOTS, runSimulation } from "../../tools/simulation/bots.mjs";

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "id",
  "name",
  "seed",
  "biome",
  "learningGoal",
  "topology",
  "targets",
  "constraints",
  "waves",
  "landmarks",
  "acceptance",
]);

const REQUIRED_KEYS = [
  "schemaVersion",
  "id",
  "name",
  "seed",
  "biome",
  "learningGoal",
  "topology",
  "targets",
  "constraints",
  "waves",
  "acceptance",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addRangeError(errors, label, value, min, max) {
  if (typeof value !== "number" || value < min || value > max) {
    errors.push(`${label} must be between ${min} and ${max}`);
  }
}

function findForbiddenGeometry(value, path = "intent") {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findForbiddenGeometry(entry, `${path}[${index}]`));
  }
  if (!isObject(value)) return [];

  const forbidden = new Set(["x", "y", "points", "samples", "paths", "rings"]);
  const errors = [];
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) errors.push(`${path}.${key} is compiler-owned geometry`);
    errors.push(...findForbiddenGeometry(child, `${path}.${key}`));
  }
  return errors;
}

function validateMetricBand(errors, name, band) {
  if (!isObject(band) || typeof band.min !== "number" || typeof band.max !== "number") {
    errors.push(`acceptance.metrics.${name} needs numeric min and max`);
    return;
  }
  if (band.min > band.max) errors.push(`acceptance.metrics.${name} min exceeds max`);
}

export function validateSources(intent, campaign) {
  const errors = [];
  const warnings = [];

  if (!isObject(intent)) return { errors: ["LevelIntent must be an object"], warnings };
  if (!isObject(campaign)) return { errors: ["Campaign manifest must be an object"], warnings };

  for (const key of REQUIRED_KEYS) {
    if (!(key in intent)) errors.push(`intent.${key} is required`);
  }
  for (const key of Object.keys(intent)) {
    if (!TOP_LEVEL_KEYS.has(key)) errors.push(`intent.${key} is not part of the author-owned model`);
  }

  if (intent.schemaVersion !== 1) errors.push("intent.schemaVersion must be 1");
  if (campaign.schemaVersion !== 1) errors.push("campaign.schemaVersion must be 1");
  if (!/^[a-z][a-z0-9-]*$/.test(intent.id ?? "")) {
    errors.push("intent.id must be a stable semantic kebab-case ID");
  }
  if (/^\d/.test(intent.id ?? "")) errors.push("intent.id must not encode campaign position");
  if (!Array.isArray(campaign.levelIds)) errors.push("campaign.levelIds must be an array");
  if ("totalLevels" in campaign) errors.push("campaign.totalLevels is forbidden; derive levelIds.length");

  if (Array.isArray(campaign.levelIds)) {
    const unique = new Set(campaign.levelIds);
    if (unique.size !== campaign.levelIds.length) errors.push("campaign.levelIds must be unique");
    const occurrences = campaign.levelIds.filter((id) => id === intent.id).length;
    if (occurrences !== 1) errors.push(`campaign.levelIds must contain ${intent.id} exactly once`);
  }

  if (!TOPOLOGY_TEMPLATES[intent.topology?.archetype]) {
    errors.push(`topology.archetype is unknown: ${intent.topology?.archetype ?? "missing"}`);
  }
  if (!BUDGET_CURVES[intent.waves?.budgetCurve]) {
    errors.push(`waves.budgetCurve is unknown: ${intent.waves?.budgetCurve ?? "missing"}`);
  }
  if (!Array.isArray(intent.waves?.allowedEnemies) || intent.waves.allowedEnemies.length === 0) {
    errors.push("waves.allowedEnemies needs at least one catalog ID");
  } else {
    for (const enemy of intent.waves.allowedEnemies) {
      if (!(enemy in ENEMY_THREAT)) errors.push(`waves.allowedEnemies references unknown enemy ${enemy}`);
    }
  }

  addRangeError(errors, "targets.pathLength", intent.targets?.pathLength, 400, 4000);
  addRangeError(errors, "targets.pathDensity", intent.targets?.pathDensity, 0, 1);
  addRangeError(errors, "targets.ringCount", intent.targets?.ringCount, 3, 20);
  addRangeError(errors, "targets.difficulty", intent.targets?.difficulty, 0, 2);
  addRangeError(errors, "targets.durationMinutes", intent.targets?.durationMinutes, 3, 20);
  addRangeError(errors, "waves.count", intent.waves?.count, 1, 24);

  const metricBands = intent.acceptance?.metrics;
  if (!isObject(metricBands)) {
    errors.push("acceptance.metrics is required");
  } else {
    for (const metric of ["pathLength", "ringCount", "estimatedDifficulty"]) {
      validateMetricBand(errors, metric, metricBands[metric]);
    }
  }

  const scenarios = intent.acceptance?.simulationScenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    errors.push("acceptance.simulationScenarios needs at least one scenario");
  } else {
    const scenarioIds = new Set();
    for (const scenario of scenarios) {
      if (!scenario?.id || scenarioIds.has(scenario.id)) errors.push("simulation scenario IDs must be present and unique");
      scenarioIds.add(scenario?.id);
      if (!BOTS[scenario?.bot]) errors.push(`simulation scenario ${scenario?.id} uses unknown bot ${scenario?.bot}`);
      if (!Array.isArray(scenario?.availableDefenders) || scenario.availableDefenders.length === 0) {
        errors.push(`simulation scenario ${scenario?.id} needs availableDefenders`);
      }
      if (typeof scenario?.expect?.won !== "boolean") {
        errors.push(`simulation scenario ${scenario?.id} needs expect.won`);
      }
      if (scenario?.expect?.minHearts !== undefined && typeof scenario.expect.minHearts !== "number") {
        errors.push(`simulation scenario ${scenario?.id} expect.minHearts must be numeric`);
      }
      if (scenario?.expect?.maxHearts !== undefined && typeof scenario.expect.maxHearts !== "number") {
        errors.push(`simulation scenario ${scenario?.id} expect.maxHearts must be numeric`);
      }
      if (
        typeof scenario?.expect?.minHearts === "number"
        && typeof scenario?.expect?.maxHearts === "number"
        && scenario.expect.minHearts > scenario.expect.maxHearts
      ) {
        errors.push(`simulation scenario ${scenario?.id} minHearts exceeds maxHearts`);
      }
    }
  }

  errors.push(...findForbiddenGeometry(intent));

  if (intent.learningGoal === "air-coverage" && !intent.waves?.allowedEnemies?.includes("buzzsaw-drone")) {
    errors.push("air-coverage needs buzzsaw-drone in waves.allowedEnemies");
  }
  if ((intent.landmarks?.length ?? 0) > 4) warnings.push("More than four landmarks may reduce phone-scale readability");

  return { errors, warnings };
}

function compilerIntent(intent) {
  return {
    schemaVersion: 1,
    id: intent.id,
    name: intent.name,
    seed: intent.seed,
    biome: intent.biome,
    learningGoal: intent.learningGoal,
    topology: intent.topology,
    targets: intent.targets,
    constraints: intent.constraints,
    waves: intent.waves,
    landmarks: intent.landmarks ?? [],
  };
}

function checkMetrics(compiled, metricBands) {
  return Object.entries(metricBands).map(([metric, band]) => {
    const actual = compiled.metrics[metric];
    return {
      metric,
      actual,
      min: band.min,
      max: band.max,
      passed: typeof actual === "number" && actual >= band.min && actual <= band.max,
    };
  });
}

export function evaluateAuthoringState(intent, campaign) {
  const validation = validateSources(intent, campaign);
  if (validation.errors.length > 0) return { ...validation, compiled: null, metricChecks: [] };

  try {
    const input = compilerIntent(intent);
    const compiled = compileIntent(input, { candidates: 80 });
    const replay = compileIntent(input, { candidates: 80 });
    if (JSON.stringify(compiled) !== JSON.stringify(replay)) {
      return {
        ...validation,
        errors: ["compiler output is not deterministic", ...validation.errors],
        compiled: null,
        metricChecks: [],
      };
    }

    const metricChecks = checkMetrics(compiled, intent.acceptance.metrics);
    const failedMetrics = metricChecks.filter((check) => !check.passed);
    return {
      ...validation,
      errors: failedMetrics.map((check) => `${check.metric} ${check.actual} is outside ${check.min}..${check.max}`),
      compiled,
      metricChecks,
      campaign: {
        id: campaign.id,
        position: campaign.levelIds.indexOf(intent.id) + 1,
        total: campaign.levelIds.length,
      },
    };
  } catch (error) {
    return {
      ...validation,
      errors: [`compiler failed: ${error.message}`],
      compiled: null,
      metricChecks: [],
    };
  }
}

export function runAcceptanceSimulations(intent, compiled) {
  return intent.acceptance.simulationScenarios.map((scenario) => {
    const result = runSimulation(compiled, scenario.bot, {
      unlocks: scenario.availableDefenders,
      seed: `${intent.seed}-${scenario.id}`,
    });
    const outcomePassed = result.won === scenario.expect.won;
    const heartsPassed = scenario.expect.minHearts === undefined || result.hearts >= scenario.expect.minHearts;
    const ceilingPassed = scenario.expect.maxHearts === undefined || result.hearts <= scenario.expect.maxHearts;
    return {
      id: scenario.id,
      bot: scenario.bot,
      result,
      expected: scenario.expect,
      passed: outcomePassed && heartsPassed && ceilingPassed,
    };
  });
}

export function renderAsciiPreview(compiled, width = 62, height = 15) {
  const grid = Array.from({ length: height }, () => Array(width).fill(" "));
  const project = ({ x, y }) => ({
    x: Math.max(0, Math.min(width - 1, Math.round((x / WORLD_W) * (width - 1)))),
    y: Math.max(0, Math.min(height - 1, Math.round((y / WORLD_H) * (height - 1)))),
  });
  const put = (point, char) => {
    const cell = project(point);
    grid[cell.y][cell.x] = char;
  };

  for (const path of compiled.paths ?? []) {
    for (const sample of path.samples ?? []) put(sample, "·");
  }
  for (const ring of compiled.rings ?? []) put(ring, "○");

  const samples = compiled.paths?.[0]?.samples ?? [];
  if (samples.length > 0) {
    put(samples[0], "S");
    put(samples.at(-1), "H");
  }

  return grid.map((row) => `│${row.join("")}│`).join("\n");
}
