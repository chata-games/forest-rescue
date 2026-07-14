import { PathCurve } from "../../src/level/path.js";
import { createRng } from "../../src/engine/rng.js";
import { getDefender } from "../../src/content/defenders.js";
import { getEnemy } from "../../src/content/enemies.js";
import { pathsFromLevel } from "../../src/level/path.js";
import { ringsFromLevel } from "../../src/level/rings.js";

const STEP = 1 / 60;

export const BOTS = {
  "cheapest-dps": { prefer: "sprig-sentinel", upgrade: false },
  "best-coverage": { prefer: "sprig-sentinel", upgrade: false, spread: true },
  "upgrade-first": { prefer: "sprig-sentinel", upgrade: true },
  "defensive-gate": { prefer: "thornvine-bramble", gateFocus: true },
  "anti-air-priority": { prefer: "wisp-willow", antiAir: true },
};

const CAMPAIGN_UNLOCKS = {
  "01-meadows-edge": ["sprig-sentinel", "thornvine-bramble"],
  "02-old-stump-crossroads": ["sprig-sentinel", "thornvine-bramble", "wisp-willow"],
  "03-whispering-river": ["sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph"],
};

export function runSimulation(level, botName = "cheapest-dps", options = {}) {
  const bot = BOTS[botName] || BOTS["cheapest-dps"];
  const maxTicks = options.ticks || 3600 * 8;
  const paths = pathsFromLevel(level);
  const mainPath = paths[0];
  const rings = ringsFromLevel(level);
  const rng = createRng(level.seed + `-sim-${botName}`);

  const state = {
    mana: level.startingMana || 150,
    hearts: level.maxHearts || 5,
    defenders: [],
    enemies: [],
    wave: 0,
    waveIndex: -1,
    spawnQueue: [],
    spawnTimer: 0,
    won: false,
    lost: false,
    ticks: 0,
  };

  const unlocked = new Set([
    ...(CAMPAIGN_UNLOCKS[level.id] || level.unlocks || ["sprig-sentinel"]),
    ...(options.unlocks || []),
  ]);
  let preferType = bot.prefer;
  if (bot.antiAir && unlocked.has("wisp-willow")) preferType = "wisp-willow";
  else if (!unlocked.has(preferType)) preferType = [...unlocked][0];

  function plantOnBestRing() {
    const empty = rings.filter((r) => !state.defenders.some((d) => d.ringId === r.id));
    if (!empty.length) return;
    const def = getDefender(preferType);
    if (!def || state.mana < def.cost) return;
    let pick = empty[0];
    if (bot.gateFocus) {
      pick = empty.reduce((a, b) => (a.x < b.x ? a : b));
    } else if (bot.spread) {
      pick = empty[Math.floor(rng() * empty.length)];
    } else {
      pick = empty.reduce((a, b) => (a.x > b.x ? a : b));
    }
    state.defenders.push({
      ringId: pick.id,
      typeId: preferType,
      x: pick.x,
      y: pick.y,
      range: def.range,
      damage: def.damage,
      cooldown: 0,
      cooldownMax: def.cooldown,
      hp: def.hp,
      dead: false,
    });
    state.mana -= def.cost;
  }

  function startWave() {
    state.waveIndex += 1;
    if (state.waveIndex >= level.waves.length) return;
    state.wave += 1;
    const wave = level.waves[state.waveIndex];
    state.spawnQueue = [];
    for (const g of wave.enemies) {
      for (let i = 0; i < g.count; i++) {
        state.spawnQueue.push({ type: g.type, pathId: g.pathId || "main" });
      }
    }
    state.spawnTimer = wave.delayBefore || 1;
  }

  startWave();

  for (let t = 0; t < maxTicks && !state.won && !state.lost; t++) {
    state.ticks = t;
    state.mana = Math.min(999, state.mana + STEP * 5.2);

    if (t % 120 === 0) plantOnBestRing();

    if (state.spawnQueue.length) {
      state.spawnTimer -= STEP;
      if (state.spawnTimer <= 0) {
        const entry = state.spawnQueue.shift();
        const stats = getEnemy(entry.type);
        const path = paths.find((p) => p.id === entry.pathId) || mainPath;
        state.enemies.push({
          type: entry.type,
          s: 0,
          speed: stats.speed,
          hp: stats.hp,
          maxHp: stats.hp,
          damage: stats.damage,
          path,
          flying: stats.flying || false,
          dead: false,
          x: path.samples[0]?.x || 1400,
          y: path.samples[0]?.y || 300,
          airLane: (level.airLanes || []).find((a) => a.forEnemy === entry.type) || null,
          pathProgress: 0,
        });
        state.spawnTimer = (level.waves[state.waveIndex]?.spawnInterval || 0.9) + rng() * 0.3;
      }
    } else if (state.enemies.every((e) => e.dead)) {
      if (state.waveIndex < level.waves.length - 1) {
        startWave();
      } else if (state.waveIndex >= level.waves.length - 1) {
        state.won = true;
        break;
      }
    }

    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      let blocked = false;
      for (const d of state.defenders) {
        if (d.dead) continue;
        const dd = Math.hypot(d.x - enemy.x, d.y - enemy.y);
        if (dd < 50 && getDefender(d.typeId)?.blocksPath) blocked = true;
      }
      if (!blocked) {
        if (enemy.flying && enemy.airLane) {
          const laneLen = Math.hypot(
            enemy.airLane.to.x - enemy.airLane.from.x,
            enemy.airLane.to.y - enemy.airLane.from.y,
          );
          enemy.pathProgress += (enemy.speed * STEP) / Math.max(1, laneLen);
          const t = Math.min(1, enemy.pathProgress);
          enemy.x = enemy.airLane.from.x + (enemy.airLane.to.x - enemy.airLane.from.x) * t;
          enemy.y = enemy.airLane.from.y + (enemy.airLane.to.y - enemy.airLane.from.y) * t;
        } else {
          enemy.s += enemy.speed * STEP;
          const pos = enemy.path.positionAt(Math.min(enemy.s, enemy.path.length));
          enemy.x = pos.x;
          enemy.y = pos.y;
        }
      }
      const leaked = enemy.flying && enemy.airLane
        ? enemy.pathProgress >= 1
        : enemy.s >= enemy.path.length;
      if (leaked) {
        enemy.dead = true;
        state.hearts -= 1;
        if (state.hearts <= 0) state.lost = true;
      }
    }

    for (const d of state.defenders) {
      if (d.dead) continue;
      d.cooldown -= STEP;
      if (d.cooldown > 0) continue;
      const target = state.enemies
        .filter((e) => {
          if (e.dead) return false;
          const stats = getDefender(d.typeId);
          if (e.flying && stats && !stats.tags.includes("anti-air")) return false;
          return Math.hypot(e.x - d.x, e.y - d.y) <= d.range;
        })
        .sort((a, b) => b.x - a.x)[0];
      if (target) {
        target.hp -= d.damage;
        d.cooldown = d.cooldownMax;
        if (target.hp <= 0) {
          target.dead = true;
          const stats = getEnemy(target.type);
          state.mana = Math.min(999, state.mana + (stats?.manaBounty || 8));
        }
      }
    }

    state.enemies = state.enemies.filter((e) => !e.dead);
    state.defenders = state.defenders.filter((d) => d.hp > 0);
  }

  return {
    bot: botName,
    won: state.won,
    hearts: state.hearts,
    mana: Math.floor(state.mana),
    ticks: state.ticks,
    defendersPlaced: state.defenders.length,
  };
}
