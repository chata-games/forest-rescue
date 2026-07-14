import { getEnemy } from "../content/enemies.js";

export class EnemyEntity {
  constructor(typeId, path, pathId = "main", options = {}) {
    const stats = getEnemy(typeId);
    if (!stats) throw new Error(`Unknown enemy: ${typeId}`);
    this.typeId = typeId;
    this.stats = stats;
    this.path = path;
    this.pathId = pathId;
    this.s = 0;
    this.pathProgress = 0;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    this.damage = stats.damage;
    this.attackInterval = stats.attackInterval;
    this.attackTimer = 0;
    this.flash = 0;
    this.dead = false;
    this.flying = stats.flying || false;
    this.airLane = options.airLane || null;
    this.x = 0;
    this.y = 0;
    this.facing = -1;
    this._syncPosition();
  }

  _syncPosition() {
    if (this.flying && this.airLane) {
      const t = Math.min(1, this.pathProgress);
      this.x = this.airLane.from.x + (this.airLane.to.x - this.airLane.from.x) * t;
      this.y = this.airLane.from.y + (this.airLane.to.y - this.airLane.from.y) * t;
      this.facing = this.airLane.to.x < this.airLane.from.x ? -1 : 1;
      return;
    }
    const pos = this.path.positionAt(this.s);
    this.x = pos.x;
    this.y = pos.y;
    const tan = this.path.tangentAt(this.s);
    this.facing = tan.x < 0 ? -1 : 1;
    this.pathProgress = this.path.length > 0 ? this.s / this.path.length : 0;
  }

  update(dt, game) {
    this.flash = Math.max(0, this.flash - dt);
    const blocker = findBlocker(this, game);
    if (blocker) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        blocker.hp -= this.damage;
        blocker.flash = 0.12;
        this.attackTimer = this.attackInterval;
        game.onDefenderHit(blocker, this);
      }
      return;
    }

    if (this.flying && this.airLane) {
      const laneLen = Math.hypot(
        this.airLane.to.x - this.airLane.from.x,
        this.airLane.to.y - this.airLane.from.y,
      );
      this.pathProgress += (this.speed * dt) / Math.max(1, laneLen);
      this._syncPosition();
    } else {
      this.s += this.speed * dt;
      this._syncPosition();
    }

    if (this.pathProgress >= 1 || this.s >= this.path.length) {
      this.dead = true;
      game.onLeak(this);
    }
  }
}

function findBlocker(enemy, game) {
  if (enemy.flying) return null;
  const near = game.defenders.filter((d) => !d.dead && d.stats.blocksPath);
  for (const d of near) {
    const onPath = enemy.path.distanceAlong(d.x, d.y).distance < enemy.path.width * 0.5;
    const close = Math.abs(enemy.path.distanceAlong(d.x, d.y).s - enemy.s) < 50;
    if (onPath && close) return d;
  }
  for (const d of game.defenders) {
    if (d.dead || !d.stats.blocksPath) continue;
    if (Math.hypot(d.x - enemy.x, d.y - enemy.y) < 55) return d;
  }
  return null;
}

export function createEnemy(typeId, path, options) {
  return new EnemyEntity(typeId, path, options?.pathId, options);
}
