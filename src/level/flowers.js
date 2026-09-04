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

/** Painted pickup, pulsing and fading in screen space. The tap radius is unchanged. */
export function drawManaFlower(ctx, f, ox, oy, scale, images = {}) {
  const sprite = images["mana-flower"];
  if (!sprite?.ready) return;
  const px = ox + f.x * scale;
  const py = oy + f.y * scale;
  const pulse = 1 + 0.08 * Math.sin(f.pulse);
  const size = 64 * scale * pulse;
  const fade = f.life < 1 ? Math.max(0.25, f.life) : 1;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.shadowColor = "#65e8e3";
  ctx.shadowBlur = 8 * scale;
  ctx.drawImage(sprite.img, px - size / 2, py - size / 2, size, size);
  ctx.restore();
}
