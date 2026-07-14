import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRng } from "../../src/engine/rng.js";
import { PathCurve } from "../../src/level/path.js";
import { dist, segmentsIntersect, poissonDisk } from "../../src/engine/geometry.js";

export const COMPILER_VERSION = "1.0.0";
export const WORLD_W = 1536;
export const WORLD_H = 1024;
export const GATE_X = 45;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "../..");

export const ENEMY_THREAT = {
  logger: 12,
  surveyor: 14,
  "chainsaw-brute": 22,
  bulldozer: 28,
  "buzzsaw-drone": 18,
  poacher: 16,
  "the-grinder": 0,
};

export const BUDGET_CURVES = {
  tutorial: [40, 55, 70, 85, 100, 115, 130, 145],
  gentle: [50, 70, 90, 110, 130, 150, 170, 190, 210],
  moderate: [60, 85, 110, 140, 170, 200, 230, 260, 290, 320],
};

export function intentHash(intent) {
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex").slice(0, 16);
}

export const TOPOLOGY_TEMPLATES = {
  "single-s-curve": () => [
    { x: 1480, y: 280 },
    { x: 1200, y: 220 },
    { x: 900, y: 420 },
    { x: 600, y: 360 },
    { x: 350, y: 560 },
    { x: GATE_X, y: 512 },
  ],
  "two-path-merge": () => [
    { x: 1480, y: 200, id: "a1" },
    { x: 1180, y: 260, id: "a2" },
    { x: 900, y: 380, id: "merge" },
    { x: 600, y: 440 },
    { x: 300, y: 520 },
    { x: GATE_X, y: 512 },
  ],
  "river-crossings": () => [
    { x: 1480, y: 320 },
    { x: 1200, y: 380 },
    { x: 950, y: 300 },
    { x: 750, y: 500 },
    { x: 500, y: 420 },
    { x: 250, y: 540 },
    { x: GATE_X, y: 512 },
  ],
  "fork-and-rejoin": () => [
    { x: 1480, y: 512 },
    { x: 1200, y: 400 },
    { x: 1000, y: 280 },
    { x: 800, y: 512 },
    { x: 600, y: 740 },
    { x: 350, y: 512 },
    { x: GATE_X, y: 512 },
  ],
  "switchbacks": () => [
    { x: 1480, y: 180 },
    { x: 1100, y: 220 },
    { x: 900, y: 420 },
    { x: 700, y: 280 },
    { x: 500, y: 480 },
    { x: 300, y: 340 },
    { x: GATE_X, y: 512 },
  ],
  "three-way-siege": () => [
    { x: 1480, y: 200 },
    { x: 1100, y: 300 },
    { x: 800, y: 512 },
    { x: GATE_X, y: 512 },
  ],
  "spiral-boss": () => [
    { x: 1400, y: 900 },
    { x: 1200, y: 800 },
    { x: 1000, y: 650 },
    { x: 800, y: 500 },
    { x: 600, y: 400 },
    { x: 400, y: 480 },
    { x: GATE_X, y: 512 },
  ],
  "short-boss-assault": () => [
    { x: 1200, y: 512 },
    { x: 800, y: 480 },
    { x: GATE_X, y: 512 },
  ],
  "elevated-paths": () => [
    { x: 1480, y: 250 },
    { x: 1100, y: 300 },
    { x: 800, y: 350 },
    { x: GATE_X, y: 400 },
  ],
};

export function jitterPoints(points, rng, amount = 40) {
  const margin = 80;
  return points.map((p, i) => {
    if (i === points.length - 1) return { x: GATE_X, y: 512 };
    return {
      x: Math.max(margin, Math.min(WORLD_W - margin, p.x + (rng() - 0.5) * amount * 2)),
      y: Math.max(margin, Math.min(WORLD_H - margin, p.y + (rng() - 0.5) * amount * 2)),
    };
  });
}

export function buildPath(controlPoints, width) {
  return new PathCurve(controlPoints, { id: "main", width });
}

export function pathSelfIntersects(path) {
  const samples = path.samples;
  for (let i = 0; i < samples.length - 2; i++) {
    for (let j = i + 3; j < samples.length - 1; j++) {
      if (segmentsIntersect(samples[i], samples[i + 1], samples[j], samples[j + 1])) return true;
    }
  }
  return false;
}

export function pathInBounds(path, margin = 40) {
  return path.samples.every((p) =>
    p.x >= margin && p.x <= WORLD_W - margin && p.y >= margin && p.y <= WORLD_H - margin);
}

export function generateRings(path, rng, intent) {
  const rings = [];
  const spacing = 85;
  const offsets = [75, 115, 155];
  const minSep = intent.constraints?.minimumParallelGap ? intent.constraints.minimumParallelGap * 0.55 : 95;
  const targetCount = intent.targets.ringCount;

  const candidates = [];
  for (let s = 50; s < path.length - 50; s += spacing) {
    const pos = path.positionAt(s);
    const n = path.normalAt(s, "left");
    for (const off of offsets) {
      for (const side of [1, -1]) {
        const x = pos.x + n.x * off * side;
        const y = pos.y + n.y * off * side;
        if (x < 100 || y < 100 || x > WORLD_W - 100 || y > WORLD_H - 100) continue;
        if (path.distanceAlong(x, y).distance < (intent.constraints?.pathWidth || 92) * 0.55) continue;
        let role = "support";
        if (s < path.length * 0.2) role = "frontline";
        else if (s > path.length * 0.82) role = "gate-defense";
        else if (path.coverageInRadius(x, y, 160) > 0.15) role = "chokepoint";
        else if (off >= 130) role = "long-range";
        candidates.push({
          id: `ring-${candidates.length}`,
          x: Math.round(x),
          y: Math.round(y),
          role,
          placement: "beside-path",
          radius: 48,
          buildRadius: 42,
        });
      }
    }
  }

  const shuffled = candidates.sort(() => rng() - 0.5);
  const onPathSlots = intent.placementRules?.onPathDefenders?.length
    ? Math.min(2, Math.max(1, Math.floor(targetCount * 0.2)))
    : 0;
  const besideTarget = targetCount - onPathSlots;

  for (const c of shuffled) {
    if (rings.some((r) => dist(r.x, r.y, c.x, c.y) < minSep)) continue;
    rings.push(c);
    if (rings.length >= besideTarget) break;
  }

  if (onPathSlots > 0) {
    const onPathSamples = [];
    for (let s = path.length * 0.28; s < path.length * 0.78; s += spacing * 1.6) {
      const pos = path.positionAt(s);
      onPathSamples.push({ x: Math.round(pos.x), y: Math.round(pos.y) });
    }
    const shuffledOnPath = onPathSamples.sort(() => rng() - 0.5);
    let added = 0;
    for (const pos of shuffledOnPath) {
      if (rings.some((r) => dist(r.x, r.y, pos.x, pos.y) < minSep * 0.75)) continue;
      rings.push({
        id: `ring-onpath-${rings.length}`,
        x: pos.x,
        y: pos.y,
        role: "chokepoint",
        placement: "on-path",
        radius: 40,
        buildRadius: 38,
      });
      added += 1;
      if (added >= onPathSlots) break;
    }
  }

  return rings;
}

export function generateWaves(intent) {
  const curve = BUDGET_CURVES[intent.waves.budgetCurve] || BUDGET_CURVES.tutorial;
  const waves = [];
  for (let i = 0; i < intent.waves.count; i++) {
    const budget = curve[Math.min(i, curve.length - 1)];
    const enemies = [];
    let remaining = budget;
    const pool = [...intent.waves.allowedEnemies].sort(() => createRng(intent.seed + `-w${i}`)() - 0.5);
    let allowed = pool;
    if (intent.learningGoal === "air-coverage" && i < intent.waves.count - 2) {
      allowed = pool.filter((t) => t !== "buzzsaw-drone");
      if (!allowed.length) allowed = ["logger"];
    }
    if (intent.learningGoal === "light-management" && i >= 3) {
      allowed = pool.includes("poacher") ? ["poacher", "logger"] : pool;
    }
    if (intent.learningGoal === "anti-bramble" && i >= 4) {
      allowed = pool.filter((t) => t !== "logger");
      if (!allowed.length) allowed = ["surveyor", "chainsaw-brute"];
    }
    let pass = 0;
    while (remaining > 0 && allowed.length) {
      const type = allowed[pass % allowed.length];
      pass += 1;
      const cost = ENEMY_THREAT[type] || 12;
      if (cost > remaining && enemies.length) break;
      const count = Math.max(1, Math.floor(remaining / cost));
      const capped = Math.min(count, type === "buzzsaw-drone" ? 2 : 6);
      enemies.push({ type, count: capped });
      remaining -= cost * capped;
      if (intent.learningGoal === "air-coverage" && type === "buzzsaw-drone") break;
      if (pass >= allowed.length) break;
    }
    const merged = consolidateWaveEnemies(enemies);
    let finalEnemies = intent.learningGoal === "air-coverage"
      ? capAirCoverageWave(merged)
      : merged;
    if (!finalEnemies.length) finalEnemies = [{ type: intent.waves.allowedEnemies[0], count: 2 }];
    waves.push({
      enemies: finalEnemies,
      delayBefore: i === 0 ? 1.5 : 0.5,
      delayAfter: 3,
      spawnInterval: Math.max(0.55, 1.4 - i * 0.06),
    });
  }
  return applyWaveOverrides(waves, intent);
}

export function applyWaveOverrides(waves, intent) {
  if (!intent.waveOverrides?.length) return waves;
  const result = [...waves];
  for (const override of intent.waveOverrides) {
    const wave = {
      enemies: override.enemies || [],
      delayBefore: override.delayBefore ?? 1.5,
      delayAfter: override.delayAfter ?? 3,
      spawnInterval: override.spawnInterval ?? 1,
      scripted: true,
      bossId: override.bossId || intent.bossId || null,
    };
    const idx = override.waveIndex;
    if (idx >= result.length) {
      while (result.length < idx) {
        result.push({ enemies: [], delayBefore: 0.5, delayAfter: 3, spawnInterval: 1 });
      }
      result.push(wave);
    } else {
      result[idx] = { ...result[idx], ...wave };
    }
  }
  return result;
}

function consolidateWaveEnemies(enemies) {
  const merged = new Map();
  for (const entry of enemies) {
    merged.set(entry.type, (merged.get(entry.type) || 0) + entry.count);
  }
  return [...merged.entries()].map(([type, count]) => ({ type, count }));
}

function capAirCoverageWave(enemies) {
  let drones = 0;
  return enemies.map((entry) => {
    if (entry.type !== "buzzsaw-drone") return entry;
    const count = Math.min(2 - drones, entry.count);
    drones += count;
    return { ...entry, count };
  }).filter((entry) => entry.count > 0);
}

export function computeMetrics(path, rings) {
  const chokepoints = rings.filter((r) => r.role === "chokepoint").length;
  const coverages = rings.map((r) => path.coverageInRadius(r.x, r.y, 160));
  const avgCoverage = coverages.length
    ? coverages.reduce((a, b) => a + b, 0) / coverages.length
    : 0;
  return {
    pathLength: Math.round(path.length * 10) / 10,
    averageRingCoverage: Math.round(avgCoverage * 100) / 100,
    chokepoints,
    ringCount: rings.length,
    estimatedDifficulty: Math.round((path.length / 2000 + avgCoverage * 0.3 + chokepoints * 0.05) * 100) / 100,
  };
}

export function placeLandmarks(intent, path, rng) {
  return (intent.landmarks || []).map((type, i) => {
    const s = path.length * (0.15 + i * 0.2);
    const p = path.positionAt(s);
    const n = path.normalAt(s, "left");
    return { type, x: Math.round(p.x + n.x * 130), y: Math.round(p.y + n.y * 130) };
  });
}

export function placeDecorations(intent, path, rings, rng) {
  const bounds = { x: 80, y: 80, w: WORLD_W - 160, h: WORLD_H - 160 };
  const points = poissonDisk(rng, bounds, 80);
  const types = ["stump", "flower", "mushroom", "fence"];
  return points.slice(0, 25).map((p, i) => {
    if (path.distanceAlong(p.x, p.y).distance < 100) return null;
    if (rings.some((r) => dist(r.x, r.y, p.x, p.y) < 70)) return null;
    return { type: types[i % types.length], x: Math.round(p.x), y: Math.round(p.y), size: 12 + (i % 4) * 3 };
  }).filter(Boolean);
}

export function scoreCandidate(path, rings, intent, metrics) {
  const lengthDiff = Math.abs(metrics.pathLength - intent.targets.pathLength) / intent.targets.pathLength;
  const ringDiff = Math.abs(rings.length - intent.targets.ringCount) / intent.targets.ringCount;
  const diffDiff = Math.abs(metrics.estimatedDifficulty - intent.targets.difficulty);
  return lengthDiff * 0.4 + ringDiff * 0.3 + diffDiff * 0.3;
}

export function compileIntent(intent, options = {}) {
  const rng = createRng(intent.seed);
  const templateFn = TOPOLOGY_TEMPLATES[intent.topology.archetype];
  if (!templateFn) throw new Error(`Unknown topology: ${intent.topology.archetype}`);

  const pathWidth = intent.constraints?.pathWidth || 92;
  const candidateCount = options.candidates || 200;
  let best = null;
  let bestScore = Infinity;

  for (let c = 0; c < candidateCount; c++) {
    const base = templateFn();
    const cps = jitterPoints(base, rng, 25 + (c % 5) * 5);
    cps[cps.length - 1] = { x: GATE_X, y: 512 };
    const path = buildPath(cps, pathWidth);
    if (!pathInBounds(path) || pathSelfIntersects(path)) continue;
    const rings = generateRings(path, createRng(intent.seed + `-r${c}`), intent);
    if (rings.length < Math.min(3, intent.targets.ringCount)) continue;
    const metrics = computeMetrics(path, rings);
    const score = scoreCandidate(path, rings, intent, metrics);
    if (score < bestScore) {
      bestScore = score;
      best = { path, rings, metrics };
    }
  }

  if (!best) throw new Error(`Compiler failed to converge for ${intent.id}`);

  const waveRng = createRng(intent.seed + "-waves");
  const waves = generateWaves(intent);
  const landmarks = placeLandmarks(intent, best.path, waveRng);
  const decorations = placeDecorations(intent, best.path, best.rings, waveRng);

  const compiled = {
    id: intent.id,
    name: intent.name || intent.id,
    compilerVersion: COMPILER_VERSION,
    intentHash: intentHash(intent),
    seed: intent.seed,
    biome: intent.biome,
    unlocks: intent.unlocks || [],
    spellUnlock: intent.spellUnlock || null,
    bossId: intent.bossId || null,
    startingMana: 150,
    maxHearts: 5,
    levelModifiers: intent.levelModifiers || [],
    paths: [best.path.toJSON()],
    rings: best.rings,
    landmarks,
    decorations,
    waves,
    metrics: best.metrics,
  };

  if (intent.topology.archetype === "river-crossings") {
    compiled.waterMasks = [
      { x: 950, y: 340, rx: 120, ry: 60 },
      { x: 500, y: 460, rx: 100, ry: 50 },
    ];
    compiled.airLanes = [
      {
        forEnemy: "buzzsaw-drone",
        from: { x: 1480, y: 200 },
        to: { x: GATE_X, y: 400 },
      },
    ];
  }

  if (intent.topology.archetype === "two-path-merge") {
    const mergePath = buildPath([
      { x: 1480, y: 720 },
      { x: 1180, y: 660 },
      { x: 900, y: 520 },
      { x: GATE_X, y: 512 },
    ], pathWidth);
    compiled.paths.push({ ...mergePath.toJSON(), id: "secondary" });
    for (let i = 0; i < waves.length; i++) {
      if (i >= 3 && waves[i].enemies[0]) {
        waves[i].enemies.push({ type: waves[i].enemies[0].type, count: 1, pathId: "secondary" });
      }
    }
  }

  return compiled;
}

export function writeCompiled(compiled, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(compiled, null, 2)}\n`);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
