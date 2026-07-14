#!/usr/bin/env node
import { readFileSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  evaluateAuthoringState,
  renderAsciiPreview,
  runAcceptanceSimulations,
} from "./model.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const LEVEL_PATH = join(ROOT, "canopy-crossing.level.json");
const CAMPAIGN_PATH = join(ROOT, "heartwood-v1.campaign.json");
const once = process.argv.includes("--once");
const simulateImmediately = process.argv.includes("--simulate");
const ansi = process.stdout.isTTY;
const BOLD = ansi ? "\x1b[1m" : "";
const DIM = ansi ? "\x1b[2m" : "";
const RESET = ansi ? "\x1b[0m" : "";

let current = null;
let simulations = null;
let lastError = null;
let debounce = null;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function load() {
  try {
    const intent = readJson(LEVEL_PATH);
    const campaign = readJson(CAMPAIGN_PATH);
    current = { intent, campaign, evaluation: evaluateAuthoringState(intent, campaign) };
    simulations = null;
    lastError = null;
  } catch (error) {
    current = null;
    simulations = null;
    lastError = error.message;
  }
}

function statusMark(passed) {
  return passed ? "✓" : "✗";
}

function render() {
  if (!once) console.clear();
  const lines = [
    `${BOLD}PROTOTYPE — Forest Rescue level authoring loop${RESET}`,
    `${DIM}Edit either JSON file; every save reruns the fast feedback tier.${RESET}`,
    "",
  ];

  if (lastError) {
    lines.push(`${BOLD}SOURCE ERROR${RESET}`, `  ✗ ${lastError}`);
  } else if (current) {
    const { intent, evaluation } = current;
    lines.push(
      `${BOLD}Intent${RESET}`,
      `  id=${intent.id}  name=${intent.name}  seed=${intent.seed}`,
      `  biome=${intent.biome}  lesson=${intent.learningGoal}`,
      `  topology=${intent.topology.archetype}  rings=${intent.targets.ringCount}  waves=${intent.waves.count}`,
      `  enemies=${intent.waves.allowedEnemies.join(", ")}`,
      "",
      `${BOLD}Campaign manifest${RESET}`,
      evaluation.campaign
        ? `  ${evaluation.campaign.id}: position ${evaluation.campaign.position} of ${evaluation.campaign.total} (derived from levelIds)`
        : "  unavailable until validation passes",
      "",
      `${BOLD}Fast feedback${RESET}`,
    );

    if (evaluation.errors.length > 0) {
      lines.push(...evaluation.errors.map((error) => `  ✗ ${error}`));
    } else {
      lines.push("  ✓ source + catalog references", "  ✓ deterministic compiler replay");
    }
    lines.push(...evaluation.warnings.map((warning) => `  ! ${warning}`));

    if (evaluation.compiled) {
      const metrics = evaluation.compiled.metrics;
      lines.push(
        "",
        `${BOLD}Compiled metrics${RESET}`,
        `  pathLength=${metrics.pathLength}  rings=${metrics.ringCount}  difficulty=${metrics.estimatedDifficulty}  chokepoints=${metrics.chokepoints}`,
        ...evaluation.metricChecks.map((check) =>
          `  ${statusMark(check.passed)} ${check.metric}: ${check.actual} in ${check.min}..${check.max}`),
        "",
        `${BOLD}Compiled geometry preview${RESET}  ${DIM}S spawn · trail ○ fairy ring H Heartwood${RESET}`,
        renderAsciiPreview(evaluation.compiled),
      );
    }

    lines.push("", `${BOLD}Acceptance simulations${RESET}`);
    if (simulations === null) {
      lines.push("  stale/not run — press s");
    } else {
      lines.push(...simulations.map((scenario) =>
        `  ${statusMark(scenario.passed)} ${scenario.id}: ${scenario.bot} → won=${scenario.result.won} hearts=${scenario.result.hearts}`));
    }
  }

  if (!once) {
    lines.push("", `${BOLD}[s]${RESET} simulate  ${BOLD}[r]${RESET} reload  ${BOLD}[q]${RESET} quit`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function simulate() {
  if (!current?.evaluation.compiled || current.evaluation.errors.length > 0) return;
  simulations = runAcceptanceSimulations(current.intent, current.evaluation.compiled);
}

function reloadAndRender() {
  load();
  render();
}

load();
if (simulateImmediately) simulate();
render();

if (once) process.exit(current && !lastError && current.evaluation.errors.length === 0 && simulations?.every((s) => s.passed) !== false ? 0 : 1);

for (const path of [LEVEL_PATH, CAMPAIGN_PATH]) {
  watch(path, () => {
    clearTimeout(debounce);
    debounce = setTimeout(reloadAndRender, 60);
  });
}

emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("keypress", (_input, key) => {
  if (key?.name === "q" || (key?.ctrl && key.name === "c")) process.exit(0);
  if (key?.name === "r") reloadAndRender();
  if (key?.name === "s") {
    simulate();
    render();
  }
});
