import { PathCurve } from "../../src/level/path.js";
import { createRng } from "../../src/engine/rng.js";
import { getDefender } from "../../src/content/defenders.js";
import { getEnemy } from "../../src/content/enemies.js";
import { getSpell } from "../../src/content/spells.js";
import { pathsFromLevel } from "../../src/level/path.js";
import { ringsFromLevel } from "../../src/level/rings.js";
import { canTargetEnemy, fireflyBuff, hasDarkness } from "../../src/level/light.js";

const STEP = 1 / 60;

export const BOTS = {
  "cheapest-dps": { prefer: "sprig-sentinel", upgrade: false },
  "best-coverage": { prefer: "sprig-sentinel", upgrade: false, spread: true, lightFirst: true },
  "upgrade-first": { prefer: "sprig-sentinel", upgrade: true },
  "defensive-gate": { prefer: "thornvine-bramble", gateFocus: true },
  "anti-air-priority": { prefer: "wisp-willow", antiAir: true },
};

const CAMPAIGN_UNLOCKS = {
  "01-meadows-edge": ["sprig-sentinel", "thornvine-bramble"],
  "02-old-stump-crossroads": ["sprig-sentinel", "thornvine-bramble", "wisp-willow"],
  "03-whispering-river": ["sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph"],
  "04-mushroom-hollow": ["sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph", "firefly-beacon", "mushroom-shaman"],
  "05-sawmill-clearing": ["sprig-sentinel", "thornvine-bramble", "wisp-willow", "dewdrop-nymph", "firefly-beacon", "mushroom-shaman"],
};

export function runSimulation(level, botName = "cheapest-dps", options = {}) {
  const bot = BOTS[botName] || BOTS["cheapest-dps"];
  const maxTicks = options.ticks || 3600 * 8;
  const paths = pathsFromLevel(level);
  const mainPath = paths[0];
  const rings = ringsFromLevel(level);
  const rng = createRng(options.seed || `${level.seed}-sim-${botName}`);

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
    spellCooldown: 0,
  };

  const unlocked = new Set([
    ...(CAMPAIGN_UNLOCKS[level.id] || level.unlocks || ["sprig-sentinel"]),
    ...(options.unlocks || []),
  ]);
  if (botName === "cheapest-dps" && hasDarkness(level)) {
    unlocked.delete("firefly-beacon");
  }

  let preferType = bot.prefer;
  if (bot.antiAir && unlocked.has("wisp-willow")) preferType = "wisp-willow";
  else if (!unlocked.has(preferType)) preferType = [...unlocked][0];

  function plantOnBestRing() {
    const empty = rings.filter((r) => !state.defenders.some((d) => d.ringId === r.id));
    if (!empty.length) return;

    let typeId = preferType;
    if (bot.lightFirst && hasDarkness(level) && unlocked.has("firefly-beacon")) {
      const beacons = state.defenders.filter((d) => d.typeId === "firefly-beacon").length;
      const sprigs = state.defenders.filter((d) => d.typeId === "sprig-sentinel").length;
      if (beacons < 1 && sprigs >= 3) typeId = "firefly-beacon";
      else if (beacons < 2 && sprigs >= 5) typeId = "firefly-beacon";
    }
    if (bot.upgrade) {
      const sprigs = state.defenders.filter((d) => d.typeId === "sprig-sentinel").length;
      const wisps = state.defenders.filter((d) => d.typeId === "wisp-willow").length;
      const shamans = state.defenders.filter((d) => d.typeId === "mushroom-shaman").length;
      if (unlocked.has("mushroom-shaman") && sprigs >= 3 && shamans < 2) typeId = "mushroom-shaman";
      else if (unlocked.has("wisp-willow") && sprigs >= 2 && wisps < 2) typeId = "wisp-willow";
    }

    const def = getDefender(typeId);
    if (!def || state.mana < def.cost) return;
    let pick = empty[0];
    if (bot.gateFocus) {
      pick = empty.reduce((a, b) => (a.x < b.x ? a : b));
    } else if (typeId === "firefly-beacon") {
      const sorted = [...empty].sort((a, b) => a.x - b.x);
      pick = sorted[Math.floor(sorted.length / 2)] || empty[0];
    } else if (bot.spread && !hasDarkness(level)) {
      pick = empty[Math.floor(rng() * empty.length)];
    } else {
      pick = empty.reduce((a, b) => (a.x > b.x ? a : b));
    }
    state.defenders.push({
      ringId: pick.id,
      typeId,
      x: pick.x,
      y: pick.y,
      range: def.range,
      damage: def.damage,
      cooldown: 0,
      cooldownMax: def.cooldown,
      hp: def.hp,
      dead: false,
      supportOnly: def.supportOnly || false,
      poisonDps: def.poisonDps || 0,
      poisonDuration: def.poisonDuration || 0,
    });
    state.mana -= def.cost;
  }

  function tryCastRootSnare() {
    if (!bot.upgrade || !level.spellUnlock || state.spellCooldown > 0) return;
    const boss = state.enemies.find((e) => e.type === "the-grinder" && !e.dead);
    if (!boss) return;
    const spell = getSpell(level.spellUnlock);
    if (!spell || state.mana < spell.cost) return;
    state.mana -= spell.cost;
    state.spellCooldown = spell.cooldown;
    boss.rootTime = Math.max(boss.rootTime || 0, spell.rootDuration);
  }

  function grinderPhase(enemy) {
    const ratio = enemy.hp / enemy.maxHp;
    return ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  }

  function updateGrinder(enemy) {
    const base = getEnemy("the-grinder");
    const phase = grinderPhase(enemy);
    const speedMul = phase === 1 ? 1 : phase === 2 ? 1.25 : 1.55;
    enemy.speed = base.speed * speedMul;

    for (const d of state.defenders) {
      if (d.dead || d.typeId !== "thornvine-bramble") continue;
      if (Math.hypot(d.x - enemy.x, d.y - enemy.y) < 62) {
        d.dead = true;
        d.hp = 0;
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + 80);
        return;
      }
    }

    enemy.shrapnelTimer = (enemy.shrapnelTimer || 2) - STEP;
    if (enemy.shrapnelTimer <= 0) {
      enemy.shrapnelTimer = phase === 1 ? 4.2 : phase === 2 ? 2.8 : 1.9;
      for (const d of state.defenders) {
        if (d.dead || d.supportOnly) continue;
        if (Math.hypot(d.x - enemy.x, d.y - enemy.y) < 190) d.hp -= 10 + phase * 9;
      }
    }

    if (enemy.rootTime > 0) {
      enemy.rootTime -= STEP;
      return false;
    }

    let blocked = false;
    for (const d of state.defenders) {
      if (d.dead) continue;
      if (Math.hypot(d.x - enemy.x, d.y - enemy.y) < 50 && getDefender(d.typeId)?.blocksPath) blocked = true;
    }
    if (!blocked) {
      enemy.s += enemy.speed * STEP;
      const pos = enemy.path.positionAt(Math.min(enemy.s, enemy.path.length));
      enemy.x = pos.x;
      enemy.y = pos.y;
      enemy.pathProgress = enemy.path.length > 0 ? enemy.s / enemy.path.length : 0;
    }
    return enemy.s >= enemy.path.length;
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
    state.spellCooldown = Math.max(0, state.spellCooldown - STEP);

    if (t % 120 === 0) plantOnBestRing();
    tryCastRootSnare();

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
          cloaked: stats.cloaked || false,
          ignoresBlockers: stats.ignoresBlockers || false,
          boss: stats.boss || false,
          shrapnelTimer: 2,
          rootTime: 0,
          poisonTime: 0,
          poisonDps: 0,
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
      if (enemy.poisonTime > 0) {
        enemy.poisonTime -= STEP;
        enemy.hp -= enemy.poisonDps * STEP;
        if (enemy.hp <= 0) enemy.dead = true;
      }
      if (enemy.dead) continue;

      if (enemy.boss) {
        if (updateGrinder(enemy)) {
          enemy.dead = true;
          state.hearts -= 1;
          if (state.hearts <= 0) state.lost = true;
        }
        continue;
      }

      let blocked = false;
      if (!enemy.ignoresBlockers) {
        for (const d of state.defenders) {
          if (d.dead) continue;
          const dd = Math.hypot(d.x - enemy.x, d.y - enemy.y);
          if (dd < 50 && getDefender(d.typeId)?.blocksPath) blocked = true;
        }
      }
      if (!blocked) {
        if (enemy.flying && enemy.airLane) {
          const laneLen = Math.hypot(
            enemy.airLane.to.x - enemy.airLane.from.x,
            enemy.airLane.to.y - enemy.airLane.from.y,
          );
          enemy.pathProgress += (enemy.speed * STEP) / Math.max(1, laneLen);
          const tpos = Math.min(1, enemy.pathProgress);
          enemy.x = enemy.airLane.from.x + (enemy.airLane.to.x - enemy.airLane.from.x) * tpos;
          enemy.y = enemy.airLane.from.y + (enemy.airLane.to.y - enemy.airLane.from.y) * tpos;
        } else {
          enemy.s += enemy.speed * STEP;
          const pos = enemy.path.positionAt(Math.min(enemy.s, enemy.path.length));
          enemy.x = pos.x;
          enemy.y = pos.y;
          enemy.pathProgress = enemy.path.length > 0 ? enemy.s / enemy.path.length : 0;
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
      if (d.dead || d.supportOnly) continue;
      d.cooldown -= STEP;
      if (d.cooldown > 0) continue;
      const defStats = getDefender(d.typeId);
      const { rangeMul, damageMul } = fireflyBuff(d, state.defenders);
      const range = d.range * rangeMul;
      const target = state.enemies
        .filter((e) => {
          if (e.dead) return false;
          if (e.flying && defStats && !defStats.tags.includes("anti-air")) return false;
          if (!canTargetEnemy(d, { x: e.x, y: e.y, stats: getEnemy(e.type) }, level, state.defenders)) return false;
          return Math.hypot(e.x - d.x, e.y - d.y) <= range;
        })
        .sort((a, b) => b.x - a.x)[0];
      if (target) {
        target.hp -= d.damage * damageMul;
        d.cooldown = d.cooldownMax;
        if (d.poisonDps > 0) {
          target.poisonDps = Math.max(target.poisonDps || 0, d.poisonDps);
          target.poisonTime = Math.max(target.poisonTime || 0, d.poisonDuration);
        }
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
