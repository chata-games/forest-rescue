import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefender } from "../../src/entities/defender.js";
import { Projectile } from "../../src/entities/projectile.js";

const STEP = 1 / 60;

// Minimal game surface: exactly what DefenderEntity.update + Projectile.update
// touch (findTarget, createProjectile, audio.shoot, onEnemyHit).
function makeGame(enemies) {
  return {
    defenders: [],
    enemies,
    projectiles: [],
    level: { rings: [], landmarks: [] },
    fireState: null,
    fireClock: 0,
    audio: { shoot() {} },
    createProjectile(defender, target, opts = {}) {
      return new Projectile(defender.x, defender.y - 10, target, defender.damage, opts);
    },
    onEnemyHit(enemy) {
      if (enemy.hp <= 0) enemy.dead = true;
    },
  };
}

function makeDummy(x, y) {
  return {
    x,
    y,
    hp: 95,
    maxHp: 95,
    dead: false,
    flying: false,
    pathProgress: 0.5,
    flash: 0,
    isTargetable: () => true,
    stats: { armor: 0, width: 40, height: 40 },
  };
}

test("sprig-sentinel fires repeatedly and kills a stationary dummy", () => {
  const ring = { id: "ring-test", x: 400, y: 500, buildRadius: 42 };
  const defender = createDefender(ring, "sprig-sentinel");
  assert.ok(defender, "sprig-sentinel stats resolve");
  const dummy = makeDummy(430, 530); // well inside range 160
  const game = makeGame([dummy]);

  let shots = 0;
  // 6 sim-seconds is generous: 0.45s windup + 3 shots @1.15s cadence ~ 2.9s.
  for (let i = 0; i < 360 && !dummy.dead; i++) {
    defender.update(STEP, game);
    for (const p of game.projectiles) p.update(STEP, game);
    if (game.projectiles.some((p) => !p.dead)) shots += 1;
    game.projectiles = game.projectiles.filter((p) => !p.dead);
  }

  assert.ok(shots > 0, "defender produced at least one projectile");
  assert.equal(dummy.dead, true, `stationary dummy died (shots in flight: ${shots}, dummy hp: ${dummy.hp})`);
});

test("defender cooldown re-arms after each shot (not a single shot)", () => {
  const ring = { id: "ring-test", x: 400, y: 500, buildRadius: 42 };
  const defender = createDefender(ring, "sprig-sentinel");
  const dummy = makeDummy(430, 530);
  dummy.hp = 1e9; // unkillable target so only firing cadence is observed
  const game = makeGame([dummy]);

  let fired = 0;
  for (let i = 0; i < 360; i++) {
    const before = game.projectiles.length;
    defender.update(STEP, game);
    fired += game.projectiles.length - before;
    for (const p of game.projectiles) p.update(STEP, game);
    game.projectiles = game.projectiles.filter((p) => !p.dead);
  }

  // 0.45s windup then ~1/1.15s cadence over 6s => at least 4 shots.
  assert.ok(fired >= 4, `expected >=4 shots over 6 sim-seconds, got ${fired}`);
});
