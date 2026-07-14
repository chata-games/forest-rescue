import { getEnemy } from "../content/enemies.js";
import { inGlow, glowSources } from "../level/light.js";
import { igniteRing, nearestRing } from "../level/fire.js";
import { createBoss, isBossType } from "./boss.js";

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
    this.poisonTime = 0;
    this.poisonDps = 0;
    this.stealCooldown = 0;
    this.rootTime = 0;
    this.igniteCooldown = 0;
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
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    this.igniteCooldown = Math.max(0, this.igniteCooldown - dt);
    if (this.poisonTime > 0) {
      this.poisonTime -= dt;
      this.hp -= this.poisonDps * dt;
      if (this.hp <= 0) {
        this.dead = true;
        game.onEnemyHit(this);
      }
    }

    if (this.stats.tags?.includes("steals-flowers") && game.flowers?.length && this.stealCooldown <= 0) {
      const flower = nearestFlower(this, game.flowers);
      if (flower && Math.hypot(flower.x - this.x, flower.y - this.y) < flower.r + 30) {
        flower.life = 0;
        game.mana = Math.max(0, game.mana - 20);
        this.stealCooldown = 2.5;
        game.onFlowerStolen?.(this, flower);
        return;
      }
    }

    if (this.stats.tags?.includes("ignites-rings") && game.fireState && this.igniteCooldown <= 0) {
      const ring = nearestRing(this.x, this.y, game.level.rings || []);
      if (ring) {
        igniteRing(ring.id, game.fireState, game.fireClock || 0);
        this.igniteCooldown = 2.2;
      }
    }

    const blocker = this.stats.ignoresBlockers ? null : findBlocker(this, game);
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

    if (this.rootTime > 0) {
      this.rootTime -= dt;
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

  isVisible(level, defenders) {
    if (!this.stats.cloaked) return true;
    return inGlow(this.x, this.y, glowSources(level, defenders));
  }

  applyRoot(duration) {
    this.rootTime = Math.max(this.rootTime || 0, duration);
  }
}

function nearestFlower(enemy, flowers) {
  let best = null;
  let bestD = Infinity;
  for (const f of flowers) {
    if (f.life <= 0) continue;
    const d = Math.hypot(f.x - enemy.x, f.y - enemy.y);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
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
  if (isBossType(typeId)) return createBoss(typeId, path, options);
  return new EnemyEntity(typeId, path, options?.pathId, options);
}
