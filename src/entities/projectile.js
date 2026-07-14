export class Projectile {
  constructor(x, y, target, damage, options = {}) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = options.speed || 320;
    this.dead = false;
    this.homing = options.homing !== false;
    this.color = options.color || "#9cf7ff";
    this.r = options.r || 9;
    this.poisonDps = options.poisonDps || 0;
    this.poisonDuration = options.poisonDuration || 0;
  }

  update(dt, game) {
    if (!this.target || this.target.dead) {
      this.dead = true;
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < this.r + 12) {
      this.target.hp -= this.damage;
      this.target.flash = 0.1;
      if (this.poisonDps > 0) {
        this.target.poisonDps = Math.max(this.target.poisonDps || 0, this.poisonDps);
        this.target.poisonTime = Math.max(this.target.poisonTime || 0, this.poisonDuration);
      }
      this.dead = true;
      game.onEnemyHit(this.target, this.damage);
      return;
    }
    const step = this.speed * dt;
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }
}
