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
import { getDefender } from '../domain/content';
import type { Ring } from '../domain/types';

export interface BattleSceneApi {
  battle: BattleState;
  /**
   * Called when a tap commits on a fairy ring (null = released on empty ground).
   * typeId is the tool snapshotted at touch-down so a second thumb changing the
   * selection mid-gesture can never buy the wrong defender (issue #22 AC5).
   */
  onRingClick: (ringId: string | null, typeId?: string) => void;
}

const MAX_STEPS_PER_FRAME = 60;
// A tap commits only if the pointer stays within this many CSS pixels of its
// touch-down point — a drag or a sliding thumb cancels and spends nothing.
const MOVE_THRESHOLD_PX = 12;

// Painterly meadow-edge palette (vector composition; generated art is a future task).
const COLOR = {
  ground: 0x1d5a40,
  groundEdge: 0x123626,
  trail: 0xb9824e,
  trailEdge: 0x8a5f37,
  ring: 0x77e0c1,
  ringHint: 0xa7f0d6,
  ringOccupied: 0xf7d66f,
  heartwood: 0xf7d66f,
  enemy: 0xe8845c,
  enemyEdge: 0x6e2f17,
  hp: 0x6fd49a,
  hpLow: 0xff6f5b,
  projectile: 0xd7ff8f,
  bramble: 0x5bbf73,
  invalid: 0xff6f5b,
};

/**
 * An in-flight tap. One entry per active pointer, so two thumbs can each carry
 * their own snapshotted tool and each release creates at most one defender.
 */
interface Gesture {
  ringId: string;
  /** Defender type captured at touch-down; the release commits this exact tool. */
  typeId: string;
  /** Whether placement would succeed right now (drives ghost colour). */
  valid: boolean;
  /** CSS-pixel touch-down origin for the movement threshold. */
  downX: number;
  downY: number;
  /** Set once the pointer exceeds the movement threshold — commit is forfeit. */
  movedTooFar: boolean;
}

export class BattleScene extends Phaser.Scene {
  private battle!: BattleState;
  private onRingClick!: (ringId: string | null, typeId?: string) => void;

  private terrain!: Phaser.GameObjects.Graphics;
  private dynamic!: Phaser.GameObjects.Graphics;
  private rings: Ring[] = [];

  private accumulator = 0;
  private timeScale = 1;

  /** Active taps, keyed by pointer id (one gesture per thumb). */
  private gestures = new Map<number, Gesture>();
  private wasPaused = false;

  constructor() {
    super('battle');
  }

  create(): void {
    const api = this.registry.get('battleApi') as BattleSceneApi | undefined;
    if (!api) throw new Error('BattleScene requires a battleApi in the game registry');
    this.battle = api.battle;
    this.onRingClick = api.onRingClick;
    this.timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.rings = [...this.battle.rings];

    this.terrain = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.drawTerrain();

    // Tap-tap placement (issue #22). A second pointer is allowed so two thumbs
    // can play simultaneously; each carries its own tool snapshot. Placement
    // commits only on pointer-up on the same ring within the movement threshold.
    this.input.addPointer();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p, false));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onPointerUp(p, true));

    // Cancellation: any of these abandons in-flight taps and spends nothing.
    const cancelAll = (): void => this.gestures.clear();
    this.events.once('shutdown', cancelAll);
    this.input.on('gameout', cancelAll);
    window.addEventListener('blur', cancelAll);
    window.addEventListener('orientationchange', cancelAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAll();
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

    // Pause or the battle ending abandons any tap mid-gesture (issue #22 AC4).
    if (this.battle.paused && !this.wasPaused) this.gestures.clear();
    this.wasPaused = this.battle.paused;
    if (this.battle.phase === 'won' || this.battle.phase === 'lost') this.gestures.clear();

    this.drawDynamic();

    const onFrame = this.registry.get('onFrame') as ((s: unknown) => void) | undefined;
    onFrame?.(this.battle.snapshot());
  }

  // --- Tap-tap placement gesture ---------------------------------------

  private onPointerDown(p: Phaser.Input.Pointer): void {
    const ringId = this.ringAt(p.worldX, p.worldY);
    if (!ringId) return; // empty ground: nothing to start
    this.gestures.set(p.id, {
      ringId,
      typeId: this.battle.selectedDefenderType,
      valid: this.battle.canPlaceDefender(ringId, this.battle.selectedDefenderType).ok,
      downX: this.clientX(p),
      downY: this.clientY(p),
      movedTooFar: false,
    });
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const g = this.gestures.get(p.id);
    if (!g || g.movedTooFar) return;
    const moved = Math.hypot(this.clientX(p) - g.downX, this.clientY(p) - g.downY);
    if (moved > MOVE_THRESHOLD_PX) g.movedTooFar = true;
  }

  private onPointerUp(p: Phaser.Input.Pointer, cancelled: boolean): void {
    const g = this.gestures.get(p.id);
    if (!g) return;
    this.gestures.delete(p.id);
    // Cancellation, excessive movement, or a release on a different ring all
    // return to the pre-gesture state and spend nothing (issue #22 AC2/AC4).
    if (cancelled || g.movedTooFar) return;
    if (this.ringAt(p.worldX, p.worldY) !== g.ringId) return;
    // Commit with the touch-down tool snapshot; placeDefender re-validates and
    // reports any problem, so an invalid/unaffordable attempt still spends nothing.
    this.onRingClick(g.ringId, g.typeId);
  }

  /** CSS-pixel pointer origin for the movement threshold (scale-independent). */
  private clientX(p: Phaser.Input.Pointer): number {
    const e = p.event as unknown as { clientX?: number } | undefined;
    return e?.clientX ?? p.x;
  }

  private clientY(p: Phaser.Input.Pointer): number {
    const e = p.event as unknown as { clientY?: number } | undefined;
    return e?.clientY ?? p.y;
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

    // Redundant visual cues on the empty fairy rings compatible with the
    // selected tool, so a tap-tap player can see every legal target at once.
    const selected = this.battle.selectedDefenderType;
    for (const ring of this.rings) {
      const occupied = this.battle.defenders.some((d) => d.ringId === ring.id && !d.dead);
      if (occupied) continue;
      if (!this.battle.canPlaceDefender(ring.id, selected).ok) continue;
      g.lineStyle(2, COLOR.ringHint, 0.9);
      g.strokeCircle(ring.x, ring.y, ring.radius + 6);
      g.fillStyle(COLOR.ringHint, 0.18);
      g.fillCircle(ring.x, ring.y, ring.radius);
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

    // Defender ghost + range preview for each in-flight tap (issue #22 AC2).
    for (const gesture of this.gestures.values()) {
      const ring = this.rings.find((r) => r.id === gesture.ringId);
      if (!ring) continue;
      const colour = gesture.valid ? COLOR.ring : COLOR.invalid;
      const range = getDefender(gesture.typeId)?.range ?? 0;
      if (range > 0) {
        g.lineStyle(1, colour, 0.3);
        g.strokeCircle(ring.x, ring.y, range);
      }
      g.lineStyle(2, colour, 0.85);
      g.strokeCircle(ring.x, ring.y, ring.radius + 4);
      g.fillStyle(colour, 0.4);
      g.fillCircle(ring.x, ring.y, 18);
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
