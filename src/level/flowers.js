import { WORLD_H, WORLD_W } from "../engine/canvas.js";

// Mana flowers are runtime spawns, never level data — the RP-a7h9z5 audit of
// every compiled level found zero flower-spawn entries (the `type: "flower"`
// decorations are background art). One module owns spawn, hitbox and sprite so
// every level plays and looks the same.
export const FLOWER_RADIUS = 22;
export const FLOWER_LIFETIME = 8.5;
// Tap target: the old f.r * 1.4 (~31 world px) went 0-for-4 in playtesting.
// 2x the visual radius is the floor that keeps thumb and scripted taps reliable.
export const FLOWER_TAP_RADIUS = FLOWER_RADIUS * 2;

export class ManaFlower {
  constructor(g) {
    this.x = 120 + g.rng() * 1200;
    this.y = 100 + g.rng() * 824;
    this.r = FLOWER_RADIUS;
    this.life = FLOWER_LIFETIME;
    this.pulse = g.rng() * 6;
  }

  update(dt) {
    this.life -= dt;
    this.pulse += dt * 2.5;
  }
}

/** The topmost Mana flower whose generous tap hitbox contains the world point. */
export function flowerAt(flowers, x, y) {
  for (let i = flowers.length - 1; i >= 0; i--) {
    const f = flowers[i];
    if (Math.hypot(f.x - x, f.y - y) <= FLOWER_TAP_RADIUS) return f;
  }
  return null;
}

/**
 * The one Mana-flower sprite: six pink petals around a golden core with a soft
 * halo, gently pulsing (and fading in its last second). Drawn in screen space
 * from world coords, same as particles and float text.
 */
export function drawManaFlower(ctx, f, ox, oy, scale) {
  const px = ox + f.x * scale;
  const py = oy + f.y * scale;
  const pulse = 1 + 0.08 * Math.sin(f.pulse);
  const r = Math.max(6, f.r * scale * pulse);
  const fade = f.life < 1 ? Math.max(0.25, f.life) : 1;

  ctx.globalAlpha = (0.22 + 0.08 * Math.sin(f.pulse + 1)) * fade;
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(px, py, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = fade;
  ctx.fillStyle = "#ff88cc";
  ctx.strokeStyle = "#c9569b";
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    ctx.beginPath();
    ctx.ellipse(px + Math.cos(a) * r * 0.62, py + Math.sin(a) * r * 0.62, r * 0.42, r * 0.28, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#ffe08a";
  ctx.strokeStyle = "#d9a232";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(px, py, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}
