// Phaser 4 scene that renders the Meadow's Edge battlefield from the
// engine-independent BattleState. All gameplay geometry (trail, fairy rings,
// Heartwood, enemies, defenders, projectiles) is drawn programmatically with
// Phaser Graphics — no raster art is used as gameplay geometry.
//
// The scene owns only rendering and ring hit-testing. Placement intent is sent
// back to the DOM shell via the onRingClick callback; the simulation itself
// lives in BattleState.

import Phaser from 'phaser';
import { STEP } from '../domain/battle';
import type { BattleState } from '../domain/battle';
import type { Ring } from '../domain/types';
import type { PreviewSummary } from '../domain/preview';

export interface BattleSceneApi {
  battle: BattleState;
  /** Called when the Guardian taps a fairy ring (null = tapped empty ground). */
  onRingClick: (ringId: string | null) => void;
}

const MAX_STEPS_PER_FRAME = 60;

// Painterly meadow-edge palette (vector composition; generated art is a future task).
const COLOR = {
  ground: 0x1d5a40,
  groundEdge: 0x123626,
  trail: 0xb9824e,
  trailEdge: 0x8a5f37,
  ring: 0x77e0c1,
  ringOccupied: 0xf7d66f,
  heartwood: 0xf7d66f,
  enemy: 0xe8845c,
  enemyEdge: 0x6e2f17,
  hp: 0x6fd49a,
  hpLow: 0xff6f5b,
  projectile: 0xd7ff8f,
  bramble: 0x5bbf73,
};

// Preview-overlay tints (author mode only): role-coded rings + hazard regions.
const ROLE_COLOR: Record<string, number> = {
  frontline: 0x77e0c1,
  chokepoint: 0xf7d66f,
  'gate-defense': 0xff6f5b,
  'long-range': 0x8ea0ff,
  support: 0x9a9a9a,
};

export class BattleScene extends Phaser.Scene {
  private battle!: BattleState;
  private onRingClick!: (ringId: string | null) => void;

  private terrain!: Phaser.GameObjects.Graphics;
  private dynamic!: Phaser.GameObjects.Graphics;
  private rings: Ring[] = [];

  private accumulator = 0;
  private timeScale = 1;
  private preview = false;
  private summary: PreviewSummary | undefined;

  constructor() {
    super('battle');
  }

  create(): void {
    const api = this.registry.get('battleApi') as BattleSceneApi | undefined;
    if (!api) throw new Error('BattleScene requires a battleApi in the game registry');
    this.battle = api.battle;
    this.onRingClick = api.onRingClick;
    this.timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.preview = (this.registry.get('preview') as boolean | undefined) ?? false;
    this.summary = this.registry.get('summary') as PreviewSummary | undefined;
    this.rings = [...this.battle.rings];

    this.terrain = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.drawTerrain();
    if (this.preview) this.drawPreviewOverlay();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.onRingClick(this.ringAt(pointer.worldX, pointer.worldY));
    });
  }

  update(_time: number, delta: number): void {
    // Fixed 1/60 s timestep with an accumulator, scaled for debug turbo.
    this.accumulator += (delta / 1000) * this.timeScale;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
      this.battle.tick(STEP);
      this.accumulator -= STEP;
      steps++;
    }
    // Shed any backlog so a long pause can't spiral the loop.
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.drawDynamic();

    const onFrame = this.registry.get('onFrame') as ((s: unknown) => void) | undefined;
    onFrame?.(this.battle.snapshot());
  }

  // --- Rendering --------------------------------------------------------

  private drawTerrain(): void {
    const g = this.terrain;
    const path = this.battle.path;

    // Ground.
    g.fillStyle(COLOR.ground, 1);
    g.fillRect(0, 0, 1536, 1024);

    // Trail band: two passes for an edge + fill, drawn through compiled samples.
    const samples = path.samples;
    if (samples.length > 1) {
      g.lineStyle(path.width + 16, COLOR.groundEdge, 0.6);
      this.strokeSpline(g, samples);
      g.lineStyle(path.width, COLOR.trail, 0.9);
      this.strokeSpline(g, samples);
      g.lineStyle(path.width - 18, COLOR.trailEdge, 0.25);
      this.strokeSpline(g, samples);
    }

    // Heartwood grove at the trail's end (the destination enemies reach).
    const end = path.positionAt(path.length);
    g.fillStyle(0x0a2a1f, 0.9);
    g.fillCircle(end.x, end.y, 54);
    g.lineStyle(3, COLOR.heartwood, 1);
    g.strokeCircle(end.x, end.y, 48);
    g.fillStyle(COLOR.heartwood, 1);
    g.fillCircle(end.x, end.y, 14);

    // Fairy rings (build spots) — drawn empty; occupancy is restroked each
    // dynamic frame so a freshly planted Defender lights up immediately.
    for (const ring of this.rings) {
      g.fillStyle(0x0a2a1faa, 0.8);
      g.fillCircle(ring.x, ring.y, ring.radius);
      g.lineStyle(3, COLOR.ring, 0.9);
      g.strokeCircle(ring.x, ring.y, ring.radius);
    }
  }

  /**
   * Author preview overlay (drawn once onto the static terrain layer when
   * ?preview=1): role-coded ring outlines, hazard regions (water crossings,
   * air lanes), spawn markers, and the Heartwood target reticle for each route.
   */
  private drawPreviewOverlay(): void {
    const summary = this.summary;
    if (!summary) return;
    const g = this.terrain;

    for (const ring of this.rings) {
      const color = ROLE_COLOR[ring.role] ?? COLOR.ring;
      g.lineStyle(2, color, 0.9);
      g.strokeCircle(ring.x, ring.y, ring.radius + 6);
    }

    for (const hazard of summary.hazards) {
      if (hazard.kind === 'water' && hazard.region) {
        const mask = hazard.region as { x: number; y: number; rx: number; ry: number };
        g.fillStyle(0x2f6fb0, 0.35);
        g.fillEllipse(mask.x, mask.y, mask.rx * 2, mask.ry * 2);
      } else if (hazard.kind === 'air-lane' && hazard.region) {
        const lane = hazard.region as { from: { x: number; y: number }; to: { x: number; y: number } };
        g.lineStyle(3, 0x8ea0ff, 0.5);
        g.lineBetween(lane.from.x, lane.from.y, lane.to.x, lane.to.y);
      }
    }

    for (const route of summary.routes) {
      // Spawn marker (enemy entrance).
      g.lineStyle(2, 0xd7ff8f, 0.95);
      g.strokeCircle(route.spawn.x, route.spawn.y, 20);
      g.fillStyle(0xd7ff8f, 0.5);
      g.fillCircle(route.spawn.x, route.spawn.y, 8);

      // Heartwood target reticle (the grove enemies must reach).
      const h = route.heartwood;
      g.lineStyle(3, 0xff6f5b, 0.9);
      g.strokeCircle(h.x, h.y, 64);
      g.lineBetween(h.x - 72, h.y, h.x + 72, h.y);
      g.lineBetween(h.x, h.y - 72, h.x, h.y + 72);
    }
  }

  private drawDynamic(): void {
    const g = this.dynamic;
    g.clear();

    // Highlight occupied rings on top of the static slot.
    for (const ring of this.rings) {
      const occupied = this.battle.defenders.some((d) => d.ringId === ring.id && !d.dead);
      if (occupied) {
        g.lineStyle(3, COLOR.ringOccupied, 1);
        g.strokeCircle(ring.x, ring.y, ring.radius);
      }
    }

    // Enemies (and their hit points) advancing along the trail.
    for (const enemy of this.battle.enemies) {
      if (enemy.dead) continue;
      const r = 16;
      g.fillStyle(COLOR.enemy, 1);
      g.fillCircle(enemy.x, enemy.y, r);
      g.lineStyle(2, COLOR.enemyEdge, 1);
      g.strokeCircle(enemy.x, enemy.y, r);
      // hp bar
      const frac = Math.max(0, enemy.hp / enemy.maxHp);
      const bw = 30;
      g.fillStyle(0x03110eaa, 1);
      g.fillRect(enemy.x - bw / 2, enemy.y - r - 10, bw, 4);
      g.fillStyle(frac > 0.4 ? COLOR.hp : COLOR.hpLow, 1);
      g.fillRect(enemy.x - bw / 2, enemy.y - r - 10, bw * frac, 4);
    }

    // Defenders planted on fairy rings.
    for (const defender of this.battle.defenders) {
      if (defender.dead) continue;
      if (defender.blocksPath) {
        g.fillStyle(COLOR.bramble, 1);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.fillCircle(defender.x + Math.cos(a) * 16, defender.y + Math.sin(a) * 16, 7);
        }
      } else {
        g.lineStyle(1, COLOR.ring, 0.18);
        g.strokeCircle(defender.x, defender.y, defender.range);
        g.fillStyle(COLOR.ring, 1);
        g.fillCircle(defender.x, defender.y, 18);
        g.fillStyle(0x0c2a1d, 1);
        g.fillCircle(defender.x, defender.y, 8);
      }
    }

    // Projectile tracers from the simulation's view list.
    const now = this.battle.clock;
    for (const p of this.battle.projectiles) {
      const age = now - p.born;
      const alpha = Math.max(0, 1 - age / p.ttl);
      g.lineStyle(3, COLOR.projectile, alpha);
      g.lineBetween(p.fromX, p.fromY, p.toX, p.toY);
    }
  }

  private strokeSpline(g: Phaser.GameObjects.Graphics, points: ReadonlyArray<{ x: number; y: number }>): void {
    if (points.length < 2) return;
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.strokePath();
  }

  private ringAt(wx: number, wy: number): string | null {
    let best: Ring | null = null;
    let bestD = Infinity;
    for (const ring of this.rings) {
      const d = Math.hypot(wx - ring.x, wy - ring.y);
      if (d <= ring.buildRadius && d < bestD) {
        bestD = d;
        best = ring;
      }
    }
    return best ? best.id : null;
  }
}
