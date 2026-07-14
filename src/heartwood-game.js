import { createGameLoop } from "./engine/loop.js";
import { setupCanvas, WORLD_W, WORLD_H } from "./engine/canvas.js";
import { AudioKit } from "./engine/audio.js";
import { createRng } from "./engine/rng.js";
import { pathsFromLevel } from "./level/path.js";
import { hitTestRing, ringsFromLevel } from "./level/rings.js";
import { levelStartingMana, levelMaxHearts, levelWaves } from "./level/loader.js";
import { fireflyBuff } from "./level/light.js";
import {
  createFireState,
  douseArea,
  douseNeighbors,
  hasFireSpread,
  isRingBurning,
  canPlantOnRing,
  tickFire,
  FIRE,
} from "./level/fire.js";
import { getDefender } from "./content/defenders.js";
import { getSpell } from "./content/spells.js";
import { createDefender } from "./entities/defender.js";
import { createEnemy } from "./entities/enemy.js";
import { Projectile } from "./entities/projectile.js";
import { Particle, FloatText, burst, drawParticle, drawFloatText } from "./rendering/effects.js";
import {
  createBattlefieldRenderer,
  drawDefenderEntity,
  drawEnemyEntity,
  drawProjectileEntity,
  drawHeartwoodGate,
  drawDarknessOverlay,
  drawFireOverlay,
} from "./rendering/battlefield.js";
import { drawDebugOverlay, isDebugMode } from "./rendering/debug.js";

export function initHeartwoodGame(dom, level, options = {}) {
  const $ = (id) => dom.getElementById(id);
  const canvas = $("gameCanvas");
  const wrap = $("canvasWrap");
  const gameScreen = $("gameScreen");
  const pauseOverlay = $("pauseOverlay");
  const endOverlay = $("endOverlay");
  const waveBanner = $("waveBanner");
  const manaText = $("manaText");
  const heartText = $("heartText");
  const waveText = $("waveText");
  const pauseButton = $("pauseButton");
  const resumeButton = $("resumeButton");
  const replayButton = $("replayButton");
  const muteButton = $("muteButton");
  const endTitle = $("endTitle");
  const endMessage = $("endMessage");
  const toolbar = dom.querySelector(".toolbar");

  const view = setupCanvas(canvas, wrap);
  const { ctx } = view;
  let muted = false;
  const audio = new AudioKit(() => muted);
  const paths = pathsFromLevel(level);
  const mainPath = paths[0];
  const rings = ringsFromLevel(level);
  const ringMap = new Map(rings.map((r) => [r.id, r]));
  const battlefield = createBattlefieldRenderer(level, options.catalog, {
    debug: isDebugMode(),
    atlas: options.atlas,
    images: options.images || {},
  });
  const waves = levelWaves(level);
  const totalWaves = waves.length;
  const unlocked = new Set(level.unlocks || ["sprig-sentinel"]);
  const spellId = level.spellUnlock || null;
  let selectedDefender = [...unlocked][0] || "sprig-sentinel";
  let spellSelected = false;
  const fireEnabled = hasFireSpread(level);
  let fireState = fireEnabled ? createFireState(rings) : null;
  let fireClock = 0;
  let pointerDown = false;
  let bobPhase = 0;
  const onComplete = options.onComplete || (() => {});

  class ManaFlower {
    constructor(g) {
      this.x = 120 + g.rng() * 1200;
      this.y = 100 + g.rng() * 824;
      this.r = 22;
      this.life = 8.5;
      this.pulse = g.rng() * 6;
    }
    update(dt) {
      this.life -= dt;
      this.pulse += dt * 5;
    }
  }

  function createGameState() {
    return {
      defenders: [],
      enemies: [],
      projectiles: [],
      particles: [],
      floatTexts: [],
      flowers: [],
      mana: levelStartingMana(level),
      hearts: levelMaxHearts(level),
      wave: 0,
      waveActive: false,
      spawnQueue: [],
      spawnTimer: 1,
      nextWaveTimer: 2,
      flowerTimer: 6,
      bannerTimer: 0,
      state: "playing",
      shake: 0,
      spellCooldown: 0,
      snareFx: [],
      rng: createRng(level.seed || level.id),
    };
  }

  const gameApi = {
    get defenders() { return state.defenders; },
    get enemies() { return state.enemies; },
    get projectiles() { return state.projectiles; },
    get particles() { return state.particles; },
    get floatTexts() { return state.floatTexts; },
    get flowers() { return state.flowers; },
    get mana() { return state.mana; },
    set mana(v) { state.mana = v; },
    get hearts() { return state.hearts; },
    set hearts(v) { state.hearts = v; },
    get shake() { return state.shake; },
    set shake(v) { state.shake = v; },
    get rng() { return state.rng; },
    createProjectile: (d, t, opts = {}) => {
      const { damageMul } = fireflyBuff(d, state.defenders);
      return new Projectile(d.x, d.y - 10, t, d.damage * damageMul, opts);
    },
    level,
    get fireState() { return fireState; },
    get fireClock() { return fireClock; },
    onFlowerStolen(enemy, flower) {
      burst(state, flower.x, flower.y, "#ff88cc", 12);
      state.floatTexts.push(new FloatText(flower.x, flower.y, "-20", "#ff7056"));
    },
    onDefenderHit(defender, enemy) {
      burst(state, defender.x, defender.y, "#b8a079", 10);
      audio.hit();
    },
    onBrambleEaten(boss, defender) {
      burst(state, defender.x, defender.y, "#8a5a30", 22);
      state.floatTexts.push(new FloatText(defender.x, defender.y - 20, "Crunch!", "#d4a060"));
      state.shake = 0.15;
    },
    onEnemyHit(enemy) {
      burst(state, enemy.x, enemy.y, "#9cf7ff", 8);
      audio.hit();
      if (enemy.hp <= 0) {
        enemy.dead = true;
        burst(state, enemy.x, enemy.y, "#a5ff70", 18);
        state.mana = Math.min(999, state.mana + (enemy.stats.manaBounty || 8));
      }
    },
    onEnemyBurrow(enemy) {
      burst(state, enemy.x, enemy.y, "#b8a070", 14);
    },
    onLeak() {
      state.hearts -= 1;
      state.shake = 0.2;
      if (state.hearts <= 0) finish(false);
    },
    audio,
  };

  function buildToolbar() {
    if (!toolbar) return;
    toolbar.innerHTML = "";
    for (const id of unlocked) {
      const def = getDefender(id);
      if (!def) continue;
      const btn = dom.createElement("button");
      btn.type = "button";
      btn.className = `tool-button${!spellSelected && id === selectedDefender ? " selected" : ""}`;
      btn.innerHTML = `<span class="tool-button__art">✦</span><span>${def.name}</span><small>${def.cost} mana</small>`;
      btn.addEventListener("click", () => {
        selectedDefender = id;
        spellSelected = false;
        buildToolbar();
      });
      toolbar.appendChild(btn);
    }
    if (spellId) {
      const spell = getSpell(spellId);
      if (spell) {
        const btn = dom.createElement("button");
        btn.type = "button";
        btn.className = `tool-button tool-button--spell${spellSelected ? " selected" : ""}`;
        const cd = state?.spellCooldown > 0 ? ` (${Math.ceil(state.spellCooldown)}s)` : "";
        const icon = spellId === "cleansing-rain" ? "🌧" : "🌿";
        btn.innerHTML = `<span class="tool-button__art">${icon}</span><span>${spell.name}</span><small>${spell.cost} mana${cd}</small>`;
        btn.disabled = state?.spellCooldown > 0;
        btn.addEventListener("click", () => {
          spellSelected = true;
          buildToolbar();
        });
        toolbar.appendChild(btn);
      }
    }
  }

  function queueWave(waveIndex) {
    const wave = waves[waveIndex];
    state.spawnQueue = [];
    for (const group of wave.enemies || []) {
      for (let i = 0; i < group.count; i++) {
        state.spawnQueue.push({ type: group.type, pathId: group.pathId || "main" });
      }
    }
    state.spawnTimer = wave.delayBefore || 1;
  }

  function announceWave() {
    state.wave += 1;
    state.waveActive = true;
    state.bannerTimer = 2;
    const wave = waves[state.wave - 1];
    if (wave?.scripted && (wave.bossId || level.bossId)) {
      const bossId = wave.bossId || level.bossId;
      waveBanner.textContent = bossId === "excavator"
        ? "The Excavator rolls in!"
        : "The Grinder approaches!";
    } else {
      waveBanner.textContent = `Wave ${state.wave}`;
    }
    waveBanner.classList.add("show");
    queueWave(state.wave - 1);
  }

  function update(dt) {
    if (!state || state.state !== "playing") return;
    bobPhase += dt;
    fireClock += dt;
    if (fireState) {
      tickFire(dt, fireState, fireClock);
      for (const d of state.defenders) {
        if (d.dead || !isRingBurning(d.ringId, fireState)) continue;
        d.hp -= FIRE.defenderBurnDps * dt;
        if (d.hp <= 0) {
          d.dead = true;
          burst(state, d.x, d.y, "#ff8844", 16);
        }
      }
    }
    state.mana = Math.min(999, state.mana + dt * 5.2);
    state.spellCooldown = Math.max(0, (state.spellCooldown || 0) - dt);
    state.flowerTimer -= dt;
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) waveBanner.classList.remove("show");

    if (state.flowerTimer <= 0) {
      state.flowers.push(new ManaFlower(state));
      state.flowerTimer = 8 + state.rng() * 5;
    }

    if (state.waveActive) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.spawnQueue.length) {
        const entry = state.spawnQueue.shift();
        const path = paths.find((p) => p.id === entry.pathId) || mainPath;
        const airLane = (level.airLanes || []).find((a) => a.forEnemy === entry.type) || null;
        state.enemies.push(createEnemy(entry.type, path, { pathId: entry.pathId, airLane }));
        state.spawnTimer = (waves[state.wave - 1]?.spawnInterval || 0.9) + state.rng() * 0.4;
      }
      if (!state.spawnQueue.length && state.enemies.length === 0) {
        state.waveActive = false;
        state.nextWaveTimer = waves[state.wave - 1]?.delayAfter ?? 3;
      }
    } else if (state.wave < totalWaves) {
      state.nextWaveTimer -= dt;
      if (state.nextWaveTimer <= 0) announceWave();
    } else if (state.wave >= totalWaves && state.enemies.length === 0) {
      finish(true);
    }

    for (const list of [state.defenders, state.enemies, state.projectiles, state.particles, state.flowers, state.floatTexts]) {
      for (const item of list) {
        if (item.update.length === 1) item.update(dt);
        else item.update(dt, gameApi);
      }
    }
    state.defenders = state.defenders.filter((d) => d.hp > 0);
    state.enemies = state.enemies.filter((e) => !e.dead);
    state.projectiles = state.projectiles.filter((p) => !p.dead);
    state.particles = state.particles.filter((p) => p.life > 0);
    state.flowers = state.flowers.filter((f) => f.life > 0);
    state.floatTexts = state.floatTexts.filter((f) => f.life > 0);
    state.snareFx = (state.snareFx || []).filter((fx) => {
      fx.life -= dt;
      return fx.life > 0;
    });
    state.shake = Math.max(0, state.shake - dt);

    if (spellId && state.spellCooldown <= 0.05) buildToolbar();

    manaText.textContent = Math.floor(state.mana);
    heartText.textContent = "♥".repeat(Math.max(0, state.hearts))
      + "♡".repeat(Math.max(0, levelMaxHearts(level) - state.hearts));
    waveText.textContent = `Wave ${Math.min(state.wave, totalWaves)} / ${totalWaves}`;
  }

  function viewTransform() {
    const scale = Math.min(view.width / WORLD_W, view.height / WORLD_H);
    const ox = (view.width - WORLD_W * scale) / 2;
    const oy = (view.height - WORLD_H * scale) / 2;
    return { scale, ox, oy };
  }

  function render() {
    ctx.save();
    if (state?.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake * 20, (Math.random() - 0.5) * state.shake * 14);
    }
    const { scale, ox, oy } = viewTransform();
    battlefield.render(ctx, view.width, view.height, (wctx) => {
      drawHeartwoodGate(wctx);
      if (!state) return;
      const sorted = [...state.defenders, ...state.enemies].sort((a, b) => a.y - b.y);
      for (const ent of sorted) {
        if (ent.typeId) drawDefenderEntity(wctx, ent, options.catalog, bobPhase + ent.x, options.atlas);
        else if (!ent.isVisible || ent.isVisible(level, state.defenders)) {
          drawEnemyEntity(wctx, ent, options.catalog, bobPhase + ent.x, options.atlas);
        }
      }
      for (const p of state.projectiles) drawProjectileEntity(wctx, p);
      for (const fx of state.snareFx || []) {
        const color = fx.color || "#6ad45a";
        const alpha = fx.life * 0.55;
        wctx.strokeStyle = color.startsWith("#")
          ? `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${alpha})`
          : color;
        wctx.lineWidth = 3;
        wctx.beginPath();
        wctx.arc(fx.x, fx.y, fx.r * (1.1 - fx.life * 0.3), 0, Math.PI * 2);
        wctx.stroke();
      }
      if (level.levelModifiers?.includes("darkness")) {
        drawDarknessOverlay(wctx, level, state.defenders);
      }
      if (fireState) {
        drawFireOverlay(wctx, level.rings, fireState, bobPhase);
      }
      if (isDebugMode()) drawDebugOverlay(wctx, level, paths);
    });
    if (state) {
      for (const f of state.flowers) {
        ctx.fillStyle = "rgba(97,232,255,.35)";
        ctx.beginPath();
        ctx.arc(ox + f.x * scale, oy + f.y * scale, (f.r + Math.sin(f.pulse) * 2) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of state.particles) {
        drawParticle(ctx, { ...p, x: ox + p.x * scale, y: oy + p.y * scale });
      }
      for (const f of state.floatTexts) {
        drawFloatText(ctx, { ...f, x: ox + f.x * scale, y: oy + f.y * scale });
      }
    }
    ctx.restore();
  }

  function plant(ringId, typeId) {
    const ring = ringMap.get(ringId);
    const def = getDefender(typeId);
    if (!ring || !def || !state) return;
    if (def.placement === "on-path" && ring.placement !== "on-path") return;
    if (def.placement !== "on-path" && ring.placement === "on-path") return;
    if (state.mana < def.cost) return;
    if (fireState && !canPlantOnRing(ringId, fireState)) return;
    if (state.defenders.some((d) => d.ringId === ringId)) return;
    const entity = createDefender(ring, typeId);
    if (!entity) return;
    state.defenders.push(entity);
    state.mana -= def.cost;
    burst(state, ring.x, ring.y, "#91ff70", 20);
    audio.plant();
  }

  function castSpell(wx, wy) {
    const spell = getSpell(spellId);
    if (!spell || !state || state.mana < spell.cost || state.spellCooldown > 0) return false;
    state.mana -= spell.cost;
    state.spellCooldown = spell.cooldown;

    if (spellId === "root-snare") {
      let rooted = 0;
      for (const enemy of state.enemies) {
        if (enemy.dead) continue;
        if (Math.hypot(enemy.x - wx, enemy.y - wy) <= spell.radius) {
          enemy.applyRoot?.(spell.rootDuration);
          rooted += 1;
        }
      }
      state.snareFx.push({ x: wx, y: wy, r: spell.radius, life: 1 });
      burst(state, wx, wy, spell.color, 24);
      state.floatTexts.push(new FloatText(wx, wy - 16, rooted ? "Rooted!" : "Snare", spell.color));
    } else if (spellId === "cleansing-rain") {
      const doused = douseArea(wx, wy, spell.radius, rings, fireState, fireClock);
      state.snareFx.push({ x: wx, y: wy, r: spell.radius, life: 1.2, color: spell.color });
      burst(state, wx, wy, spell.color, 28);
      state.floatTexts.push(new FloatText(wx, wy - 16, doused ? "Doused!" : "Rain", spell.color));
    }

    audio.plant();
    buildToolbar();
    return true;
  }

  function handlePointer(ev) {
    if (!state || state.state !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const { scale, ox, oy } = viewTransform();
    const wx = (sx - ox) / scale;
    const wy = (sy - oy) / scale;

    for (let i = state.flowers.length - 1; i >= 0; i--) {
      const f = state.flowers[i];
      if (Math.hypot(f.x - wx, f.y - wy) <= f.r * 1.4) {
        state.flowers.splice(i, 1);
        state.mana = Math.min(999, state.mana + 25);
        state.floatTexts.push(new FloatText(wx, wy, "+25", "#9cf7ff"));
        burst(state, wx, wy, "#9cf7ff", 14);
        audio.mana();
        return;
      }
    }
    const ring = hitTestRing(rings, wx, wy);
    if (ring) {
      plant(ring.id, selectedDefender);
      return;
    }
    if (spellSelected && spellId) castSpell(wx, wy);
  }

  function finish(won) {
    if (!state || state.state !== "playing") return;
    state.state = won ? "victory" : "gameover";
    endTitle.textContent = won ? "Victory" : "Game Over";
    endMessage.textContent = won ? `${level.name || level.id} defended!` : "The Heartwood was breached.";
    endOverlay.classList.remove("hidden");
    audio.end(won);
    if (won) onComplete(level, state.hearts);
  }

  function startLevel() {
    audio.ensure();
    fireClock = 0;
    if (fireEnabled) fireState = createFireState(rings);
    state = createGameState();
    gameScreen.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    endOverlay.classList.add("hidden");
    view.resize();
    buildToolbar();
    announceWave();
  }

  function bindEvents() {
    window.addEventListener("resize", () => view.resize());
    pauseButton?.addEventListener("click", () => {
      if (state?.state === "playing") {
        state.state = "paused";
        pauseOverlay.classList.remove("hidden");
      }
    });
    resumeButton?.addEventListener("click", () => {
      if (state?.state === "paused") {
        state.state = "playing";
        pauseOverlay.classList.add("hidden");
      }
    });
    replayButton?.addEventListener("click", startLevel);
    muteButton?.addEventListener("click", () => {
      muted = !muted;
      muteButton.textContent = muted ? "🔇" : "🔊";
    });
    canvas.addEventListener("pointerdown", (e) => {
      pointerDown = true;
      handlePointer(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (pointerDown) handlePointer(e);
    });
    canvas.addEventListener("pointerup", () => { pointerDown = false; });
  }

  const loop = createGameLoop(update, render);

  return {
    start() {
      bindEvents();
      startLevel();
      loop.start();
    },
    getState: () => state,
  };
}
