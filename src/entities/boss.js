import { getEnemy } from "../content/enemies.js";

const PHASE_SHRAPNEL = {
  1: { interval: 4.2, speedMul: 1, shrapnelCount: 3 },
  2: { interval: 2.8, speedMul: 1.25, shrapnelCount: 5 },
  3: { interval: 1.9, speedMul: 1.55, shrapnelCount: 7 },
};

export class GrinderBoss {
  constructor(path, options = {}) {
    const stats = getEnemy("the-grinder");
    if (!stats) throw new Error("Missing the-grinder stats");
    this.typeId = "the-grinder";
    this.stats = stats;
    this.path = path;
    this.pathId = options.pathId || "main";
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
    this.flying = false;
    this.poisonTime = 0;
    this.poisonDps = 0;
    this.rootTime = 0;
    this.phase = 1;
    this.shrapnelTimer = 2;
    this.x = 0;
    this.y = 0;
    this.facing = -1;
    this._syncPosition();
  }

  _syncPosition() {
    const pos = this.path.positionAt(this.s);
    this.x = pos.x;
    this.y = pos.y;
    const tan = this.path.tangentAt(this.s);
    this.facing = tan.x < 0 ? -1 : 1;
    this.pathProgress = this.path.length > 0 ? this.s / this.path.length : 0;
  }

  _updatePhase() {
    const ratio = this.hp / this.maxHp;
    this.phase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  }

  _tryEatBramble(game) {
    for (let i = game.defenders.length - 1; i >= 0; i--) {
      const d = game.defenders[i];
      if (d.dead || d.typeId !== "thornvine-bramble") continue;
      if (Math.hypot(d.x - this.x, d.y - this.y) > 62) continue;
      d.dead = true;
      d.hp = 0;
      this.hp = Math.min(this.maxHp, this.hp + 80);
      game.onDefenderHit?.(d, this);
      game.onBrambleEaten?.(this, d);
      return true;
    }
    return false;
  }

  _fireShrapnel(game) {
    const cfg = PHASE_SHRAPNEL[this.phase];
    const count = cfg.shrapnelCount;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + game.rng() * 0.4;
      game.projectiles.push({
        x: this.x,
        y: this.y - 20,
        vx: Math.cos(angle) * 220,
        vy: Math.sin(angle) * 220,
        damage: 18 + this.phase * 6,
        r: 7,
        color: "#d4c4a0",
        life: 1.2,
        homing: false,
        dead: false,
        isShrapnel: true,
        update(dt, g) {
          this.life -= dt;
          if (this.life <= 0) { this.dead = true; return; }
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          for (const d of g.defenders) {
            if (d.dead || d.stats.supportOnly) continue;
            if (Math.hypot(d.x - this.x, d.y - this.y) < this.r + 24) {
              d.hp -= this.damage;
              d.flash = 0.12;
              g.onDefenderHit?.(d, this);
              this.dead = true;
              return;
            }
          }
        },
      });
    }
    game.shake = Math.max(game.shake || 0, 0.08);
  }

  update(dt, game) {
    this.flash = Math.max(0, this.flash - dt);
    this._updatePhase();
    const cfg = PHASE_SHRAPNEL[this.phase];
    this.speed = this.stats.speed * cfg.speedMul;

    if (this.poisonTime > 0) {
      this.poisonTime -= dt;
      this.hp -= this.poisonDps * dt;
      if (this.hp <= 0) {
        this.dead = true;
        game.onEnemyHit(this);
      }
    }

    if (this._tryEatBramble(game)) return;

    this.shrapnelTimer -= dt;
    if (this.shrapnelTimer <= 0) {
      this._fireShrapnel(game);
      this.shrapnelTimer = cfg.interval;
    }

    if (this.rootTime > 0) {
      this.rootTime -= dt;
      return;
    }

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

    this.s += this.speed * dt;
    this._syncPosition();

    if (this.pathProgress >= 1 || this.s >= this.path.length) {
      this.dead = true;
      game.onLeak(this);
    }
  }

  isVisible() {
    return true;
  }

  applyRoot(duration) {
    this.rootTime = Math.max(this.rootTime, duration);
  }
}

function findBlocker(enemy, game) {
  for (const d of game.defenders) {
    if (d.dead || !d.stats.blocksPath) continue;
    if (Math.hypot(d.x - enemy.x, d.y - enemy.y) < 55) return d;
  }
  return null;
}

export function createBoss(typeId, path, options = {}) {
  if (typeId === "the-grinder") return new GrinderBoss(path, options);
  throw new Error(`Unknown boss: ${typeId}`);
}

export function isBossType(typeId) {
  return typeId === "the-grinder";
}
