// Phaser 4 scene that renders the Meadow's Edge battlefield from the
// engine-independent BattleState. All gameplay geometry (trail, fairy rings,
// Heartwood, enemies, defenders, projectiles) is drawn programmatically with
// Phaser Graphics — no raster art is used as gameplay geometry.
//
// The scene owns only rendering and ring hit-testing. Placement intent is sent
// back to the DOM shell via the onRingClick callback; the simulation itself
// lives in BattleState.

import Phaser from 'phaser';
import { STEP, MANA_FLOWER_HIT } from '../domain/battle';
import type { BattleState } from '../domain/battle';
import { getDefender, getSpell } from '../domain/content';
import type { Ring } from '../domain/types';
import type { PreviewSummary } from '../domain/preview';

export interface BattleSceneApi {
  battle: BattleState;
  /**
   * Called when a tap commits on a fairy ring (null = released on empty ground).
   * typeId is the tool snapshotted at touch-down so a second thumb changing the
   * selection mid-gesture can never buy the wrong defender (issue #22 AC5). The
   * shell decides intent: an occupied ring inspects (issue #30), an empty one
   * places — so the scene reports every committed ring tap through this seam.
   */
  onRingClick: (ringId: string | null, typeId?: string) => void;
  /** Called when a spell is committed at a battlefield point (issue #31). */
  onSpellCast: (x: number, y: number, typeId?: string) => void;
  /** Called when a tap collects a Mana flower (issue #31). */
  onCollectFlower: (flowerId: string) => void;
}

const MAX_STEPS_PER_FRAME = 60;
// A tap commits only if the pointer stays within this many CSS pixels of its
// touch-down point — a drag or a sliding thumb cancels and spends nothing.
const MOVE_THRESHOLD_PX = 12;
// Logical battlefield width (the FIT-scaled game width) for CSS->world scaling.
const FIELD_W = 1536;
// Minimum Mana-flower radius in CSS pixels, so every flower is a >=48x48 target.
const MIN_FLOWER_CSS_RADIUS = MANA_FLOWER_HIT / 2;

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
  inspect: 0xf7d66f,
  selected: 0x8ef0b6,
  flower: 0xf77fb0,
  flowerCore: 0xffe08a,
  spellReady: 0x8ea0ff,
};

/**
 * An in-flight pointer gesture. One entry per active pointer, so two thumbs can
 * each carry their own snapshotted intent. While a spell is armed the battlefield
 * is in targeting mode and every tap is a cast — it never places or collects
 * (issue #31 AC6).
 */
type PointerGesture =
  | {
      kind: 'place';
      ringId: string;
      /** Defender type captured at touch-down; the release commits this exact tool. */
      typeId: string;
      /** Whether placement would succeed at touch-down (drives ghost colour). */
      valid: boolean;
      downX: number;
      downY: number;
      /** Set once the pointer exceeds the movement threshold — commit is forfeit. */
      movedTooFar: boolean;
      /** Occupied rings show an inspect cue; empty rings show placement feedback. */
      mode: 'place' | 'inspect';
    }
  | {
      kind: 'collect';
      flowerId: string;
      downX: number;
      downY: number;
      movedTooFar: boolean;
    }
  | {
      kind: 'cast';
      /** Spell armed at touch-down; the release commits this exact spell. */
      typeId: string;
      /** World point the spell will land at (follows the pointer — this is aiming). */
      x: number;
      y: number;
      /** Whether the cast would succeed at the current point (drives preview tint). */
      valid: boolean;
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
  private onRingClick!: (ringId: string | null, typeId?: string) => void;
  private onSpellCast!: (x: number, y: number, typeId?: string) => void;
  private onCollectFlower!: (flowerId: string) => void;

  private terrain!: Phaser.GameObjects.Graphics;
  private dynamic!: Phaser.GameObjects.Graphics;
  private rings: Ring[] = [];

  private accumulator = 0;
  private timeScale = 1;
  private preview = false;
  private summary: PreviewSummary | undefined;

  /** Active taps, keyed by pointer id (one gesture per thumb). */
  private gestures = new Map<number, PointerGesture>();
  private wasPaused = false;

  constructor() {
    super('battle');
  }

  create(): void {
    const api = this.registry.get('battleApi') as BattleSceneApi | undefined;
    if (!api) throw new Error('BattleScene requires a battleApi in the game registry');
    this.battle = api.battle;
    this.onRingClick = api.onRingClick;
    this.onSpellCast = api.onSpellCast;
    this.onCollectFlower = api.onCollectFlower;
    this.timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.preview = (this.registry.get('preview') as boolean | undefined) ?? false;
    this.summary = this.registry.get('summary') as PreviewSummary | undefined;
    this.rings = [...this.battle.rings];

    this.terrain = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.drawTerrain();
    if (this.preview) this.drawPreviewOverlay();

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

  // --- Tap gestures: place, collect, or cast ---------------------------

  private onPointerDown(p: Phaser.Input.Pointer): void {
    // While a spell is armed, targeting owns every battlefield tap — it never
    // places a Defender or collects a flower (issue #31 AC6).
    if (this.battle.armedSpell) {
      const typeId = this.battle.armedSpell;
      this.gestures.set(p.id, {
        kind: 'cast',
        typeId,
        x: p.worldX,
        y: p.worldY,
        valid: this.battle.canCastSpell(p.worldX, p.worldY, typeId).ok,
      });
      return;
    }

    const { x, y } = this.clientPos(p);
    // A tap on a Mana flower harvests it (only when no spell is armed).
    const flowerId = this.flowerAt(p.worldX, p.worldY);
    if (flowerId) {
      this.gestures.set(p.id, { kind: 'collect', flowerId, downX: x, downY: y, movedTooFar: false });
      return;
    }

    // Otherwise a tap on a fairy ring begins a placement gesture.
    const ringId = this.ringAt(p.worldX, p.worldY);
    if (!ringId) return; // empty ground: nothing to start
    const typeId = this.battle.selectedDefenderType;
    // An occupied ring is an inspect target (issue #30), not a placement one —
    // the shell branches on occupancy at commit, and this drives the visual.
    const occupied = this.battle.defenders.some((d) => d.ringId === ringId && !d.dead);
    this.gestures.set(p.id, {
      kind: 'place',
      ringId,
      typeId,
      valid: this.battle.canPlaceDefender(ringId, typeId).ok,
      downX: x,
      downY: y,
      movedTooFar: false,
      mode: occupied ? 'inspect' : 'place',
    });
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const g = this.gestures.get(p.id);
    if (!g) return;
    if (g.kind === 'cast') {
      // Aiming: the reticle follows the pointer. Movement is the interaction, so
      // it never cancels a cast — only leaving the battlefield does (AC2).
      g.x = p.worldX;
      g.y = p.worldY;
      g.valid = this.battle.canCastSpell(g.x, g.y, g.typeId).ok;
      return;
    }
    if (g.movedTooFar) return;
    const { x, y } = this.clientPos(p);
    if (Math.hypot(x - g.downX, y - g.downY) > MOVE_THRESHOLD_PX) g.movedTooFar = true;
  }

  private onPointerUp(p: Phaser.Input.Pointer, cancelled: boolean): void {
    const g = this.gestures.get(p.id);
    if (!g) return;
    this.gestures.delete(p.id);
    // Cancellation / excessive movement / a release off-target all return to the
    // pre-gesture state and spend nothing (issue #22 AC2/AC4, #31 AC2). A cancelled
    // cast just drops the aim — the spell stays armed so the Guardian can re-aim.
    if (cancelled) return;
    if (g.kind === 'place') {
      if (g.movedTooFar) return;
      if (this.ringAt(p.worldX, p.worldY) !== g.ringId) return;
      this.onRingClick(g.ringId, g.typeId);
      return;
    }
    if (g.kind === 'collect') {
      if (g.movedTooFar) return;
      if (this.flowerAt(p.worldX, p.worldY) !== g.flowerId) return;
      this.onCollectFlower(g.flowerId);
      return;
    }
    // kind === 'cast': commit only if the spell is still armed (Esc may have
    // disarmed mid-gesture). castSpell re-validates, so an invalid/unaffordable
    // release still spends nothing.
    if (this.battle.armedSpell === null) return;
    this.onSpellCast(g.x, g.y, g.typeId);
  }

  /** CSS-pixel pointer position for the movement threshold (scale-independent). */
  private clientPos(p: Phaser.Input.Pointer): { x: number; y: number } {
    const e = p.event as unknown as { clientX?: number; clientY?: number } | undefined;
    return { x: e?.clientX ?? p.x, y: e?.clientY ?? p.y };
  }

  /** World-unit flower radius that renders (and hit-tests) as >=48 CSS pixels. */
  private flowerHitRadius(): number {
    const cssWidth = this.game.canvas.clientWidth;
    const cssToWorld = cssWidth > 0 ? FIELD_W / cssWidth : 1;
    return Math.max(MIN_FLOWER_CSS_RADIUS, MIN_FLOWER_CSS_RADIUS * cssToWorld);
  }

  /** Id of the Mana flower under a world point, or null. */
  private flowerAt(wx: number, wy: number): string | null {
    const r = this.flowerHitRadius();
    let best: string | null = null;
    let bestD = Infinity;
    for (const f of this.battle.manaFlowers) {
      const d = Math.hypot(wx - f.x, wy - f.y);
      if (d <= r && d < bestD) {
        bestD = d;
        best = f.id;
      }
    }
    return best;
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
      if (hazard.kind === 'water') {
        g.fillStyle(0x2f6fb0, 0.35);
        g.fillEllipse(hazard.region.x, hazard.region.y, hazard.region.rx * 2, hazard.region.ry * 2);
      } else if (hazard.kind === 'air-lane') {
        g.lineStyle(3, 0x8ea0ff, 0.5);
        g.lineBetween(hazard.region.from.x, hazard.region.from.y, hazard.region.to.x, hazard.region.to.y);
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

    // Overlay each fairy ring once: occupied rings glow gold, while empty rings
    // that accept the selected tool get a soft hint so a tap-tap player can see
    // every legal target at once.
    const selected = this.battle.selectedDefenderType;
    for (const ring of this.rings) {
      const occupied = this.battle.defenders.some((d) => d.ringId === ring.id && !d.dead);
      if (occupied) {
        g.lineStyle(3, COLOR.ringOccupied, 1);
        g.strokeCircle(ring.x, ring.y, ring.radius);
        continue;
      }
      if (!this.battle.canPlaceDefender(ring.id, selected).ok) continue;
      g.lineStyle(2, COLOR.ringHint, 0.9);
      g.strokeCircle(ring.x, ring.y, ring.radius + 6);
      g.fillStyle(COLOR.ringHint, 0.18);
      g.fillCircle(ring.x, ring.y, ring.radius);
    }

    // Persistent selection highlight on the inspected Defender's ring (issue #30
    // AC2): the modeless panel follows whichever occupied ring was last tapped.
    const inspectedId = this.registry.get('inspected') as string | null | undefined;
    if (inspectedId) {
      const ring = this.rings.find((r) => r.id === inspectedId);
      if (ring) {
        g.lineStyle(4, COLOR.selected, 1);
        g.strokeCircle(ring.x, ring.y, ring.radius + 10);
        g.lineStyle(2, COLOR.inspect, 0.9);
        g.strokeCircle(ring.x, ring.y, ring.radius + 4);
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

    // Mana flowers: collectible pickups, each drawn at a >=48 CSS-pixel radius so
    // the tap target matches the rendered glyph (issue #31 AC5).
    const flowerR = this.flowerHitRadius();
    for (const flower of this.battle.manaFlowers) {
      g.fillStyle(0x0a2a1f, 0.35);
      g.fillCircle(flower.x, flower.y, flowerR);
      g.lineStyle(3, COLOR.flower, 0.9);
      g.strokeCircle(flower.x, flower.y, flowerR);
      g.fillStyle(COLOR.flower, 0.8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g.fillCircle(flower.x + Math.cos(a) * flowerR * 0.5, flower.y + Math.sin(a) * flowerR * 0.5, flowerR * 0.4);
      }
      g.fillStyle(COLOR.flowerCore, 1);
      g.fillCircle(flower.x, flower.y, flowerR * 0.32);
    }

    // In-flight taps: a placement ghost, a harvest highlight, or a spell aim.
    for (const gesture of this.gestures.values()) {
      if (gesture.kind === 'place') {
        const ring = this.rings.find((r) => r.id === gesture.ringId);
        if (!ring) continue;
        if (gesture.mode === 'inspect') {
          g.lineStyle(3, COLOR.inspect, 0.95);
          g.strokeCircle(ring.x, ring.y, ring.radius + 8);
          continue;
        }
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
      } else if (gesture.kind === 'collect') {
        const flower = this.battle.manaFlowers.find((f) => f.id === gesture.flowerId);
        if (!flower) continue;
        g.lineStyle(3, COLOR.flowerCore, 1);
        g.strokeCircle(flower.x, flower.y, flowerR + 6);
      } else {
        // kind === 'cast': area preview (the spell radius) + a reticle at the
        // landing point, tinted by whether the cast would commit (issue #31 AC1).
        const colour = gesture.valid ? COLOR.spellReady : COLOR.invalid;
        const radius = getSpell(gesture.typeId)?.radius ?? 0;
        if (radius > 0) {
          g.lineStyle(2, colour, 0.5);
          g.strokeCircle(gesture.x, gesture.y, radius);
          g.fillStyle(colour, 0.12);
          g.fillCircle(gesture.x, gesture.y, radius);
        }
        g.lineStyle(3, colour, 0.95);
        g.strokeCircle(gesture.x, gesture.y, 16);
        g.lineBetween(gesture.x - 24, gesture.y, gesture.x + 24, gesture.y);
        g.lineBetween(gesture.x, gesture.y - 24, gesture.x, gesture.y + 24);
      }
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
