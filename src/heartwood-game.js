import { createGameLoop } from "./engine/loop.js";
import { clearCanvasFrame, isInsideWorld, setupCanvas, WORLD_W, WORLD_H } from "./engine/canvas.js";
import { AudioKit } from "./engine/audio.js";
import { createRng } from "./engine/rng.js";
import { pathsFromLevel } from "./level/path.js";
import { hitTestRing, ringsFromLevel } from "./level/rings.js";
import { FLOWER_TAP_RADIUS, ManaFlower, drawManaFlower, flowerAt } from "./level/flowers.js";
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
import { plantRejectionReason } from "./combat/plant-rules.js";
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
  drawDarknessOverlay,
  drawFireOverlay,
} from "./rendering/battlefield.js";
import { drawDebugOverlay, isDebugMode } from "./rendering/debug.js";
import { getSideways } from "./engine/sideways.js";

export function initHeartwoodGame(dom, level, options = {}) {
  const $ = (id) => dom.getElementById(id);
  const canvas = $("gameCanvas");
  const wrap = $("canvasWrap");
  const gameScreen = $("gameScreen");
  const pauseOverlay = $("pauseOverlay");
  const endOverlay = $("endOverlay");
  const waveBanner = $("waveBanner");
  const startWaveButton = $("startWaveButton");
  const nextWaveTimer = $("nextWaveTimer");
  const manaText = $("manaText");
  const heartText = $("heartText");
  const waveText = $("waveText");
  const pauseButton = $("pauseButton");
  const resumeButton = $("resumeButton");
  const replayButton = $("replayButton");
  const continueButton = $("continueButton");
  const campaignButton = $("campaignButton");
  const muteButton = $("muteButton");
  const endTitle = $("endTitle");
  const endMessage = $("endMessage");
  const endSummary = $("endSummary");
  const endWaveText = $("endWaveText");
  const endLeaksText = $("endLeaksText");
  const endManaText = $("endManaText");
  const toolbar = dom.querySelector(".toolbar");

  const sideways = getSideways(dom);
  const view = setupCanvas(canvas, wrap, sideways);
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
  // Battle state lives in this closure; it must be declared — ES module code is
  // strict, so the bare assignment in startLevel() throws ReferenceError.
  let state = null;
  let fireClock = 0;
  let pointerDown = false;
  let aim = null; // last pointer position in world coords — anchors the range ghost
  let bobPhase = 0;
  const onComplete = options.onComplete || (() => {});
  const onContinue = options.onContinue || (() => {});
  const onExit = options.onExit || (() => {});

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
        const bounty = enemy.stats.manaBounty || 8;
        state.mana = Math.min(999, state.mana + bounty);
        // RP-k55mkt: income must be visible — float the actual bounty paid.
        state.floatTexts.push(new FloatText(enemy.x, enemy.y - 14, `+${bounty}`, "#9cf7ff"));
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
      btn.innerHTML = `<span class="tool-button__art">✦</span><span>${def.name}</span><span class="tool-button__role">${def.role}</span><small>${def.cost} mana</small>`;
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
        btn.innerHTML = `<span class="tool-button__art">${icon}</span><span>${spell.name}</span><span class="tool-button__role">${spell.role}</span><small>${spell.cost} mana${cd}</small>`;
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
    nextWaveTimer.classList.add("hidden");
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
    } else if (state.wave === 0) {
      // Wave 1 is gated behind the Start-Wave button: unlimited prep time.
      // state.wave > 0 && !waveActive ticks the between-wave countdown below.
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
    waveText.textContent = `Wave ${Math.max(1, Math.min(state.wave, totalWaves))} / ${totalWaves}`;

    const betweenWaves = !state.waveActive && state.wave > 0 && state.wave < totalWaves;
    nextWaveTimer.classList.toggle("hidden", !betweenWaves);
    if (betweenWaves) nextWaveTimer.textContent = `Next wave in ${Math.ceil(state.nextWaveTimer)}s`;
  }

  function viewTransform() {
    const scale = Math.min(view.width / WORLD_W, view.height / WORLD_H);
    const ox = (view.width - WORLD_W * scale) / 2;
    const oy = (view.height - WORLD_H * scale) / 2;
    return { scale, ox, oy };
  }

  function screenToWorld(ev) {
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy } = viewTransform();
    // Frame-local point: the identity unrotated, the axis swap in Sideways mode.
    const p = sideways.localPoint(rect, ev.clientX, ev.clientY);
    return { x: (p.x - ox) / scale, y: (p.y - oy) / scale };
  }

  // RP-pyvp2r: translucent circle showing the selected card's area of effect at
  // the hover/press point, snapped to the fairy ring under the pointer when one
  // is. Green = placeable there, red/white = not. Role text on the cards tells
  // players WHAT a defender does; the ghost shows WHERE it pays off.
  function drawRangeGhost(ox, oy, scale) {
    if (!aim || !isInsideWorld(aim) || state.state !== "playing") return;
    let x = aim.x;
    let y = aim.y;
    let r = 0;
    let fill = "rgba(255,255,255,0.10)";
    let stroke = "#ff8f7a";
    if (spellSelected) {
      const spell = getSpell(spellId);
      if (!spell) return;
      r = spell.radius;
      stroke = spell.color;
      fill = "rgba(255,255,255,0.12)";
    } else {
      const def = getDefender(selectedDefender);
      if (!def) return;
      const ring = hitTestRing(rings, aim.x, aim.y);
      if (ring) {
        x = ring.x;
        y = ring.y;
      }
      r = def.range || def.glowRadius || 42;
      if (ring && canPlantAt(ring, def)) {
        fill = "rgba(180,255,160,0.16)";
        stroke = "#b4ffa0";
      }
    }
    const sx = ox + x * scale;
    const sy = oy + y * scale;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx, sy, r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // RP-k55mkt: while a defender card is selected, every ring it can be planted
  // on right now glows green — selection-scoped (never always-on) and
  // green-only per the debate; the hover ghost (drawRangeGhost) stays the
  // precise "will it fit here" preview.
  function drawValidRingHighlights(wctx) {
    if (!state || state.state !== "playing" || spellSelected) return;
    const def = getDefender(selectedDefender);
    if (!def) return;
    wctx.lineWidth = 2.5;
    for (const ring of rings) {
      if (!canPlantAt(ring, def)) continue;
      wctx.fillStyle = "rgba(141,255,156,0.18)";
      wctx.strokeStyle = "rgba(141,255,156,0.65)";
      wctx.beginPath();
      wctx.arc(ring.x, ring.y, ring.buildRadius, 0, Math.PI * 2);
      wctx.fill();
      wctx.stroke();
    }
  }

  function render() {
    clearCanvasFrame(ctx);
    ctx.save();
    if (state?.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake * 20, (Math.random() - 0.5) * state.shake * 14);
    }
    const { scale, ox, oy } = viewTransform();
    battlefield.render(ctx, view.width, view.height, (wctx) => {
      if (!state) return;
      drawValidRingHighlights(wctx);
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
      drawRangeGhost(ox, oy, scale);
      for (const f of state.flowers) {
        drawManaFlower(ctx, f, ox, oy, scale, options.images);
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

  function plantContext(ring) {
    return {
      mana: state.mana,
      occupied: state.defenders.some((d) => d.ringId === ring.id),
      ringBurning: fireState ? !canPlantOnRing(ring.id, fireState) : false,
    };
  }

  function canPlantAt(ring, def) {
    if (!ring || !def || !state) return false;
    return plantRejectionReason(ring, def, plantContext(ring)) === null;
  }

  // RP-k55mkt: a rejected action must say why — shake the board and float the
  // reason so "nothing happened" can never be mistaken for a frozen game.
  function rejectAt(x, y, reason) {
    state.shake = Math.max(state.shake, 0.15);
    state.floatTexts.push(new FloatText(x, y - 20, reason, "#ffb35c", 1.5));
  }

  function plant(ringId, typeId) {
    const ring = ringMap.get(ringId);
    const def = getDefender(typeId);
    const reason = ring && def ? plantRejectionReason(ring, def, plantContext(ring)) : "Tap a fairy ring to plant";
    if (reason) {
      if (ring) rejectAt(ring.x, ring.y - ring.buildRadius, reason);
      return;
    }
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

  function collectFlower(f) {
    const i = state.flowers.indexOf(f);
    if (i === -1) return;
    state.flowers.splice(i, 1);
    state.mana = Math.min(999, state.mana + 25);
    state.floatTexts.push(new FloatText(f.x, f.y - f.r - 8, "+25", "#9cf7ff"));
    burst(state, f.x, f.y, "#9cf7ff", 18);
    state.snareFx.push({ x: f.x, y: f.y, r: FLOWER_TAP_RADIUS, life: 0.5, color: "#ffe08a" });
    audio.mana();
  }

  function handlePointer(ev, isDrag = false) {
    if (!state || state.state !== "playing") return;
    const { x: wx, y: wy } = screenToWorld(ev);

    const flower = flowerAt(state.flowers, wx, wy);
    if (flower) {
      collectFlower(flower);
      return;
    }
    const ring = hitTestRing(rings, wx, wy);
    if (ring) {
      plant(ring.id, selectedDefender);
      return;
    }
    if (spellSelected && spellId) {
      castSpell(wx, wy);
      return;
    }
    // RP-k55mkt: a tap that hits neither flower nor ring is a rejected plant —
    // say so (drag-plants sweep silently, only fresh taps speak).
    if (!isDrag) rejectAt(wx, wy, "Tap a fairy ring to plant");
  }

  function finish(won) {
    if (!state || state.state !== "playing") return;
    state.state = won ? "victory" : "gameover";
    endTitle.textContent = won ? "Victory" : "Game Over";
    endMessage.textContent = won ? `${level.name || level.id} defended!` : "The Heartwood was breached.";
    // RP-nqfepx: read-only recap on both outcomes — wave reached (clamped to
    // the wave count exactly like the HUD), enemies leaked (hearts lost,
    // clamped: several leaks can land after the fatal one in the same frame),
    // mana banked at the moment the battle ended.
    endWaveText.textContent = String(Math.max(1, Math.min(state.wave, totalWaves)));
    endLeaksText.textContent = String(Math.max(0, levelMaxHearts(level) - state.hearts));
    endManaText.textContent = String(Math.floor(state.mana));
    endSummary.classList.remove("hidden");
    continueButton?.classList.toggle("hidden", !won || !options.hasNextLevel);
    campaignButton?.classList.remove("hidden");
    endOverlay.classList.remove("hidden");
    audio.end(won);
    if (won) onComplete(level, state.hearts);
  }

  function showStartGate() {
    startWaveButton.classList.remove("hidden");
    nextWaveTimer.classList.add("hidden");
  }

  function startLevel() {
    audio.ensure();
    fireClock = 0;
    if (fireEnabled) fireState = createFireState(rings);
    state = createGameState();
    gameScreen.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    endOverlay.classList.add("hidden");
    continueButton?.classList.add("hidden");
    campaignButton?.classList.add("hidden");
    view.resize();
    buildToolbar();
    showStartGate();
  }

  function bindEvents() {
    window.addEventListener("resize", () => view.resize());
    pauseButton?.addEventListener("click", () => {
      if (state?.state === "playing") {
        state.state = "paused";
        pauseOverlay.classList.remove("hidden");
      }
    });
    // RP-k55mkt: while paused the overlay swallows every tap — a tap on the
    // backdrop is a rejected action and gets a floating reason of its own.
    pauseOverlay?.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".overlay__panel")) return;
      const hint = dom.createElement("div");
      hint.className = "reject-float";
      hint.textContent = "Paused — resume to plant";
      // Anchor inside the frame so the hint follows the Sideways rotation
      // (RP-eqbawv): position:fixed resolves against the transformed frame.
      const frame = dom.getElementById("app") ?? dom.body;
      const p = sideways.localPoint(frame.getBoundingClientRect(), e.clientX, e.clientY);
      hint.style.left = `${p.x}px`;
      hint.style.top = `${p.y}px`;
      hint.addEventListener("animationend", () => hint.remove());
      frame.appendChild(hint);
    });
    resumeButton?.addEventListener("click", () => {
      if (state?.state === "paused") {
        state.state = "playing";
        pauseOverlay.classList.add("hidden");
      }
    });
    replayButton?.addEventListener("click", startLevel);
    continueButton?.addEventListener("click", () => onContinue(level));
    campaignButton?.addEventListener("click", () => onExit(level));
    startWaveButton?.addEventListener("click", () => {
      if (!state || state.wave !== 0 || state.waveActive) return;
      audio.ensure();
      startWaveButton.classList.add("hidden");
      announceWave();
    });
    muteButton?.addEventListener("click", () => {
      muted = !muted;
      muteButton.textContent = muted ? "🔇" : "🔊";
    });
    canvas.addEventListener("pointerdown", (e) => {
      pointerDown = true;
      aim = screenToWorld(e);
      handlePointer(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      aim = screenToWorld(e);
      if (pointerDown) handlePointer(e, true);
    });
    canvas.addEventListener("pointerup", () => { pointerDown = false; });
    canvas.addEventListener("pointerleave", () => { aim = null; });
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
