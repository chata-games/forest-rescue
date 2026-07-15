import { describe, it, expect } from 'vitest';
import { buildPreviewSummary, type SimulationFile } from './preview';
import meadowsRaw from '../../levels/compiled/01-meadows-edge.json';
import sawmillRaw from '../../levels/compiled/05-sawmill-clearing.json';
import meadowsSimRaw from '../../levels/compiled/01-meadows-edge.simulation.json';
import type { CompiledLevel } from './types';

const meadows = meadowsRaw as CompiledLevel;
const sawmill = sawmillRaw as CompiledLevel;
const meadowsSim = meadowsSimRaw as unknown as SimulationFile;

describe('preview summary projector', () => {
  it('projects level metadata the overlay legend needs', () => {
    const summary = buildPreviewSummary(meadows);
    expect(summary.meta).toMatchObject({
      id: '01-meadows-edge',
      name: 'Meadow\'s Edge',
      biome: 'meadow-edge',
      bossId: null,
      spellUnlock: null,
      maxHearts: 5,
    });
    expect(summary.meta.unlocks).toContain('sprig-sentinel');
  });

  it('exposes one route per compiled path with spawn and Heartwood endpoints', () => {
    const summary = buildPreviewSummary(meadows);
    expect(summary.routes).toHaveLength(meadows.paths.length);
    const main = summary.routes[0];
    expect(main.id).toBe('main');
    const firstSample = meadows.paths[0].samples[0];
    const lastSample = meadows.paths[0].samples[meadows.paths[0].samples.length - 1];
    expect(main.spawn).toEqual(firstSample);
    expect(main.heartwood).toEqual(lastSample);
    expect(main.length).toBe(meadows.paths[0].length);
    expect(main.width).toBe(meadows.paths[0].width);
  });

  it('summarizes fairy rings grouped by strategic role', () => {
    const summary = buildPreviewSummary(meadows);
    expect(summary.rings.total).toBe(meadows.rings.length);
    const roleTotal = Object.values(summary.rings.byRole).reduce((a, b) => a + b, 0);
    expect(roleTotal).toBe(meadows.rings.length);
  });

  it('breaks every wave down into composition and an enemy total', () => {
    const summary = buildPreviewSummary(meadows);
    expect(summary.waves).toHaveLength(meadows.waves.length);
    const w0 = summary.waves[0];
    expect(w0.index).toBe(0);
    const expectedTotal = meadows.waves[0].enemies.reduce((a, e) => a + e.count, 0);
    expect(w0.totalEnemies).toBe(expectedTotal);
    expect(w0.groups).toEqual(meadows.waves[0].enemies);
  });

  it('reports the compiled difficulty metrics', () => {
    const summary = buildPreviewSummary(meadows);
    expect(summary.metrics).toMatchObject({
      pathLength: meadows.metrics!.pathLength,
      ringCount: meadows.metrics!.ringCount,
      estimatedDifficulty: meadows.metrics!.estimatedDifficulty,
    });
  });

  it('flags fire and water hazards when the level authoring calls for them', () => {
    expect(buildPreviewSummary(sawmill).hazards.map((h) => h.kind)).not.toContain('fire');

    const withFire = { ...meadows, levelModifiers: ['fire-spread'] };
    expect(buildPreviewSummary(withFire).hazards.map((h) => h.kind)).toContain('fire');
  });

  it('flags darkness when authored', () => {
    const dark = { ...meadows, levelModifiers: ['darkness'] };
    expect(buildPreviewSummary(dark).hazards.map((h) => h.kind)).toContain('darkness');
  });

  it('summarizes the deterministic simulation with its outcome band verdict', () => {
    const summary = buildPreviewSummary(meadows, meadowsSim);
    const cheapest = summary.simulation?.find((s) => s.bot === 'cheapest-dps');
    expect(cheapest).toBeDefined();
    expect(cheapest!.band).toBe('clean-win');
    expect(cheapest!.inBand).toBe(true);
    // A bot without a declared band still reports its raw outcome.
    const coverage = summary.simulation?.find((s) => s.bot === 'best-coverage');
    expect(coverage?.won).toBe(true);
    expect(coverage?.band).toBeUndefined();
  });

  it('omits the simulation block when no simulation file is supplied', () => {
    expect(buildPreviewSummary(meadows).simulation).toBeUndefined();
  });
});
