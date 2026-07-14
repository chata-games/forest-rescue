import { getDefender } from "../content/defenders.js";
import { canTargetEnemy, fireflyBuff } from "../level/light.js";
import { smokeRangeMul, douseNeighbors } from "../level/fire.js";

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
    if (this.stats.supportOnly || this.stats.blocksPath || this.cooldown > 0) return;

    const target = findTarget(this, game);
    if (target) {
      const opts = {};
      if (this.stats.poisonDps) {
        opts.poisonDps = this.stats.poisonDps;
        opts.poisonDuration = this.stats.poisonDuration;
        opts.color = "#b8ff70";
      }
      if (this.stats.tags?.includes("douses-fire") && game.fireState) {
        douseNeighbors(this.ringId, game.fireState, game.fireClock || 0);
      }
      game.projectiles.push(game.createProjectile(this, target, opts));
      this.cooldown = this.cooldownMax;
      game.audio.shoot();
    }
  }
}

function findTarget(defender, game) {
  const { rangeMul, damageMul } = fireflyBuff(defender, game.defenders);
  const smokeMul = smokeRangeMul(defender, game.enemies);
  const range = defender.range * rangeMul * smokeMul;
  let best = null;
  let bestS = -1;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    if (enemy.flying && !defender.stats.tags.includes("anti-air")) continue;
    if (!canTargetEnemy(defender, enemy, game.level, game.defenders)) continue;
    const d = Math.hypot(enemy.x - defender.x, enemy.y - defender.y);
    if (d > range) continue;
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
