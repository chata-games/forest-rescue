export class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 120;
    this.vy = (Math.random() - 0.7) * 120;
    this.life = 0.55 + Math.random() * 0.45;
    this.maxLife = this.life;
    this.color = color;
    this.size = 3 + Math.random() * 5;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 120 * dt;
  }
}

export class FloatText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 1;
  }

  update(dt) {
    this.life -= dt;
    this.y -= 38 * dt;
  }
}

export function burst(game, x, y, color, count) {
  for (let i = 0; i < count; i++) game.particles.push(new Particle(x, y, color));
}

export function drawParticle(ctx, p) {
  ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawFloatText(ctx, f) {
  ctx.globalAlpha = Math.max(0, f.life);
  ctx.fillStyle = f.color;
  ctx.font = "900 22px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(f.text, f.x, f.y);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}
