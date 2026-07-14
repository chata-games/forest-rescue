import { getDefender } from "../content/defenders.js";

export class DefenderEntity {
  constructor(ringId, typeId, ring, stats) {
    this.ringId = ringId;
    this.typeId = typeId;
    this.x = ring.x;
    this.y = ring.y;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.range = stats.range;
    this.damage = stats.damage;
    this.cooldown = 0.45;
    this.cooldownMax = stats.cooldown;
    this.flash = 0;
    this.stats = stats;
    this.dead = false;
  }

  update(dt, game) {
    this.flash = Math.max(0, this.flash - dt);
    this.cooldown -= dt;
    if (this.stats.blocksPath || this.cooldown > 0) return;

    const target = findTarget(this, game);
    if (target) {
      game.projectiles.push(game.createProjectile(this, target));
      this.cooldown = this.cooldownMax;
      game.audio.shoot();
    }
  }
}

function findTarget(defender, game) {
  let best = null;
  let bestS = -1;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    if (enemy.flying && !defender.stats.tags.includes("anti-air")) continue;
    const d = Math.hypot(enemy.x - defender.x, enemy.y - defender.y);
    if (d > defender.range) continue;
    if (enemy.pathProgress > bestS) {
      bestS = enemy.pathProgress;
      best = enemy;
    }
  }
  return best;
}

export function createDefender(ring, typeId) {
  const stats = getDefender(typeId);
  if (!stats) return null;
  return new DefenderEntity(ring.id, typeId, ring, stats);
}
