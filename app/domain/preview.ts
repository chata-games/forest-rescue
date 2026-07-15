// Pure preview-overlay projector.
//
// Turns a CompiledLevel (and an optional deterministic simulation file) into the
// structured data the author preview overlays render: routes (spawn -> Heartwood),
// fairy rings by role, hazard/target regions, wave composition, metrics, and a
// per-strategy simulation summary with its outcome-band verdict.
//
// This is deliberately free of Phaser, the DOM, and any renderer so it can be
// unit-tested directly and shared by the battlefield scene and the DOM legend.

import type {
  CompiledLevel,
  LevelMetrics,
  Vec2,
  WaterMask,
  AirLane,
} from './types';

/** The deterministic simulation file written by tools/simulation/run.mjs. */
export interface SimulationBotResult {
  bot: string;
  won: boolean;
  hearts: number;
  band?: string;
  bandEvaluation?: {
    ok: boolean;
    expected: string;
    actual: string;
    reason?: string;
  };
}

export interface SimulationFile {
  levelId: string;
  results: Record<string, SimulationBotResult>;
}

export interface RouteSummary {
  id: string;
  spawn: Vec2;
  heartwood: Vec2;
  length: number;
  width: number;
}

export interface HazardSummary {
  kind: 'fire' | 'darkness' | 'water' | 'air-lane';
  label: string;
  /** Optional geometry the overlay can draw (e.g. water masks / air lanes). */
  region?: WaterMask | AirLane;
}

export interface WaveGroupSummary {
  type: string;
  count: number;
}

export interface WaveSummary {
  index: number;
  groups: WaveGroupSummary[];
  totalEnemies: number;
  delayBefore: number;
  scripted?: boolean;
}

export interface SimulationSummary {
  bot: string;
  won: boolean;
  hearts: number;
  /** Declared outcome band, if this (level, bot) has one. */
  band?: string;
  /** Whether the result landed inside its band (undefined when no band). */
  inBand?: boolean;
}

export interface PreviewSummary {
  meta: {
    id: string;
    name: string;
    biome: string;
    bossId: string | null;
    spellUnlock: string | null;
    unlocks: string[];
    maxHearts: number;
    startingMana: number;
  };
  metrics: LevelMetrics | undefined;
  routes: RouteSummary[];
  rings: { total: number; byRole: Record<string, number> };
  hazards: HazardSummary[];
  waves: WaveSummary[];
  simulation?: SimulationSummary[];
}

/** Build the preview-overlay data for a compiled level (+ optional simulation). */
export function buildPreviewSummary(
  level: CompiledLevel,
  simulation?: SimulationFile,
): PreviewSummary {
  const routes: RouteSummary[] = level.paths.map((path) => {
    const samples = path.samples;
    const spawn = samples[0] ?? path.controlPoints[0] ?? { x: 0, y: 0 };
    const heartwood = samples[samples.length - 1]
      ?? path.controlPoints[path.controlPoints.length - 1]
      ?? { x: 0, y: 0 };
    return { id: path.id, spawn, heartwood, length: path.length, width: path.width };
  });

  const byRole: Record<string, number> = {};
  for (const ring of level.rings) {
    byRole[ring.role] = (byRole[ring.role] ?? 0) + 1;
  }

  const hazards: HazardSummary[] = [];
  if (level.levelModifiers.includes('fire-spread')) {
    hazards.push({ kind: 'fire', label: 'Fire spread' });
  }
  if (level.levelModifiers.includes('darkness')) {
    hazards.push({ kind: 'darkness', label: 'Darkness (limited target lock)' });
  }
  for (const mask of level.waterMasks ?? []) {
    hazards.push({ kind: 'water', label: 'Water crossing', region: mask });
  }
  for (const lane of level.airLanes ?? []) {
    hazards.push({ kind: 'air-lane', label: `Air lane: ${lane.forEnemy}`, region: lane });
  }

  const waves: WaveSummary[] = level.waves.map((wave, index) => ({
    index,
    groups: wave.enemies.map((g) => ({ type: g.type, count: g.count })),
    totalEnemies: wave.enemies.reduce((sum, g) => sum + g.count, 0),
    delayBefore: wave.delayBefore,
    ...(wave.scripted ? { scripted: true } : {}),
  }));

  const simulationSummary: SimulationSummary[] | undefined = simulation
    ? Object.values(simulation.results).map((r) => ({
        bot: r.bot,
        won: r.won,
        hearts: r.hearts,
        ...(r.band ? { band: r.band, inBand: r.bandEvaluation?.ok } : {}),
      }))
    : undefined;

  return {
    meta: {
      id: level.id,
      name: level.name,
      biome: level.biome,
      bossId: level.bossId,
      spellUnlock: level.spellUnlock,
      unlocks: level.unlocks,
      maxHearts: level.maxHearts,
      startingMana: level.startingMana,
    },
    metrics: level.metrics,
    routes,
    rings: { total: level.rings.length, byRole },
    hazards,
    waves,
    simulation: simulationSummary,
  };
}
