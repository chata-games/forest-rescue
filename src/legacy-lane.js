import { createGameLoop } from "./engine/loop.js";
import { setupCanvas } from "./engine/canvas.js";
import { AudioKit } from "./engine/audio.js";
import { createRng } from "./engine/rng.js";
import { Particle, FloatText, burst, drawParticle, drawFloatText } from "./rendering/effects.js";
import { loadSprites } from "./rendering/sprites.js";
import { line, roundRect, drawHp, drawCover } from "./rendering/draw-utils.js";

const COLS = 7;
const LANES = 4;
const TREE_COST = 50;
const MAX_HEARTS = 5;
const TOTAL_WAVES = 8;

export function initLegacyLane(dom) {
  const $ = (id) => dom.getElementById(id);
  const canvas = $("gameCanvas");
  const wrap = $("canvasWrap");
  const startScreen = $("startScreen");
  const gameScreen = $("gameScreen");
  const pauseOverlay = $("pauseOverlay");
  const endOverlay = $("endOverlay");
  const waveBanner = $("waveBanner");
  const manaText = $("manaText");
  const heartText = $("heartText");
  const waveText = $("waveText");
  const playButton = $("playButton");
  const pauseButton = $("pauseButton");
  const resumeButton = $("resumeButton");
  const replayButton = $("replayButton");
  const muteButton = $("muteButton");
  const treeTool = $("treeTool");
  const endTitle = $("endTitle");
  const endMessage = $("endMessage");

  const view = setupCanvas(canvas, wrap);
  const { ctx } = view;

  let cellW = 1;
  let laneH = 1;
  let gridLeft = 0;
  let gridTop = 0;
  let game = null;
  let rng = createRng("legacy-lane");
  let pointerDown = false;
  let muted = false;
  const audio = new AudioKit(() => muted);

  const { images } = loadSprites({
    bg: "assets/bg.png",
    tree: "assets/tree.png",
    logger: "assets/logger.png",
    dozer: "assets/dozer.png",
    orb: "assets/orb.png",
    mana: "assets/mana.png",
    guardian: "assets/guardian.png",
  });

  class GameState {
    constructor() {
      this.trees = [];
      this.enemies = [];
      this.orbs = [];
      this.particles = [];
      this.flowers = [];
      this.floatTexts = [];
      this.mana = 150;
      this.hearts = MAX_HEARTS;
      this.wave = 0;
      this.waveActive = false;
      this.waveQueue = [];
      this.spawnTimer = 1.5;
      this.nextWaveTimer = 1.2;
      this.flowerTimer = 6;
      this.bannerTimer = 0;
      this.state = "playing";
      this.shake = 0;
      this.selected = "tree";
      this.dragCell = null;
    }
  }

  class Tree {
    constructor(col, lane) {
      this.col = col;
      this.lane = lane;
      this.x = gridLeft + col * cellW + cellW * 0.5;
      this.y = gridTop + lane * laneH + laneH * 0.55;
      this.hp = 95;
      this.maxHp = 95;
      this.cooldown = 0.45;
      this.flash = 0;
    }
    update(dt) {
      this.x = gridLeft + this.col * cellW + cellW * 0.5;
      this.y = gridTop + this.lane * laneH + laneH * 0.55;
      this.cooldown -= dt;
      this.flash = Math.max(0, this.flash - dt);
      const target = game.enemies.find((e) => e.lane === this.lane && e.x > this.x && !e.dead);
      if (target && this.cooldown <= 0) {
        game.orbs.push(new Orb(this.x + cellW * 0.18, this.y - laneH * 0.1, this.lane));
        this.cooldown = 1.15;
        audio.shoot();
      }
    }
  }

  class Enemy {
    constructor(lane, kind) {
      this.lane = lane;
      this.kind = kind;
      this.x = view.width + 55;
      this.y = gridTop + lane * laneH + laneH * 0.58;
      this.w = kind === "dozer" ? 78 : 54;
      this.h = kind === "dozer" ? 58 : 68;
      this.maxHp = kind === "dozer" ? 260 : 115;
      this.hp = this.maxHp;
      this.speed = kind === "dozer" ? 24 : 42;
      this.damage = kind === "dozer" ? 52 : 28;
      this.attackTimer = 0;
      this.flash = 0;
      this.dead = false;
    }
    update(dt) {
      this.y = gridTop + this.lane * laneH + laneH * 0.58;
      this.flash = Math.max(0, this.flash - dt);
      const tree = treeInLaneAtX(this.lane, this.x - this.w * 0.45);
      if (tree) {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          tree.hp -= this.damage;
          tree.flash = 0.12;
          this.attackTimer = this.kind === "dozer" ? 0.75 : 0.95;
          burst(game, tree.x, tree.y, this.kind === "dozer" ? "#b8a079" : "#8bec67", 12);
          if (this.kind === "dozer") {
            game.shake = 0.22;
            audio.crush();
          } else {
            audio.hit();
          }
        }
      } else {
        this.x -= this.speed * dt;
      }
      if (this.x < -this.w) {
        this.dead = true;
        game.hearts -= 1;
        game.shake = 0.18;
        burst(game, gridLeft + 16, this.y, "#ff694d", 16);
        if (game.hearts <= 0) finish(false);
      }
    }
  }

  class Logger extends Enemy {
    constructor(lane) { super(lane, "logger"); }
  }

  class Bulldozer extends Enemy {
    constructor(lane) { super(lane, "dozer"); }
  }

  class Orb {
    constructor(x, y, lane) {
      this.x = x;
      this.y = y;
      this.lane = lane;
      this.r = 11;
      this.vx = 220;
      this.damage = 35;
      this.dead = false;
    }
    update(dt) {
      this.x += this.vx * dt;
      const hit = game.enemies.find((e) => e.lane === this.lane && !e.dead
        && Math.abs(e.x - this.x) < e.w * 0.48 && Math.abs(e.y - this.y) < e.h * 0.5);
      if (hit) {
        hit.hp -= this.damage;
        hit.flash = 0.1;
        this.dead = true;
        burst(game, this.x, this.y, "#9cf7ff", 10);
        audio.hit();
        if (hit.hp <= 0) {
          hit.dead = true;
          burst(game, hit.x, hit.y, hit.kind === "dozer" ? "#cfd0a7" : "#a5ff70", 24);
          game.mana = Math.min(999, game.mana + (hit.kind === "dozer" ? 15 : 8));
        }
      }
      if (this.x > view.width + 40) this.dead = true;
    }
  }

  class ManaFlower {
    constructor() {
      this.x = gridLeft + rng() * Math.max(1, COLS * cellW);
      this.y = gridTop + rng() * Math.max(1, LANES * laneH);
      this.r = 22;
      this.life = 8.5;
      this.pulse = rng() * 6;
    }
    update(dt) {
      this.life -= dt;
      this.pulse += dt * 5;
      this.y -= Math.sin(this.pulse) * dt * 4;
    }
  }

  function resize() {
    const dims = view.resize();
    gridLeft = Math.max(20, dims.width * 0.045);
    gridTop = Math.max(18, dims.height * 0.08);
    cellW = (dims.width - gridLeft - Math.max(36, dims.width * 0.08)) / COLS;
    laneH = (dims.height - gridTop - Math.max(22, dims.height * 0.07)) / LANES;
  }

  function announceWave() {
    game.wave += 1;
    game.waveActive = true;
    game.bannerTimer = 2;
    waveBanner.textContent = `Wave ${game.wave}`;
    waveBanner.classList.add("show");
    const count = 4 + game.wave * 2;
    game.waveQueue = [];
    for (let i = 0; i < count; i++) {
      const dozerChance = game.wave < 3 ? 0 : Math.min(0.1 + game.wave * 0.055, 0.44);
      game.waveQueue.push(rng() < dozerChance ? "dozer" : "logger");
    }
    game.spawnTimer = 1.2;
  }

  function update(dt) {
    if (!game || game.state !== "playing") return;
    game.mana = Math.min(999, game.mana + dt * 5.2);
    game.flowerTimer -= dt;
    game.bannerTimer -= dt;
    if (game.bannerTimer <= 0) waveBanner.classList.remove("show");
    if (game.flowerTimer <= 0) {
      game.flowers.push(new ManaFlower());
      game.flowerTimer = 8 + rng() * 5;
    }
    if (game.waveActive) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0 && game.waveQueue.length) {
        const kind = game.waveQueue.shift();
        const lane = Math.floor(rng() * LANES);
        game.enemies.push(kind === "dozer" ? new Bulldozer(lane) : new Logger(lane));
        game.spawnTimer = Math.max(0.55, 1.55 - game.wave * 0.08) + rng() * 0.8;
      }
      if (!game.waveQueue.length && game.enemies.length === 0) {
        game.waveActive = false;
        game.nextWaveTimer = 3;
      }
    } else {
      game.nextWaveTimer -= dt;
      if (game.nextWaveTimer <= 0) {
        if (game.wave >= TOTAL_WAVES) finish(true);
        else announceWave();
      }
    }
    for (const list of [game.trees, game.enemies, game.orbs, game.particles, game.flowers, game.floatTexts]) {
      for (const item of list) item.update(dt);
    }
    game.trees = game.trees.filter((t) => t.hp > 0);
    game.enemies = game.enemies.filter((e) => !e.dead);
    game.orbs = game.orbs.filter((o) => !o.dead);
    game.particles = game.particles.filter((p) => p.life > 0);
    game.flowers = game.flowers.filter((f) => f.life > 0);
    game.floatTexts = game.floatTexts.filter((f) => f.life > 0);
    game.shake = Math.max(0, game.shake - dt);
    manaText.textContent = Math.floor(game.mana);
    heartText.textContent = "♥".repeat(Math.max(0, game.hearts)) + "♡".repeat(Math.max(0, MAX_HEARTS - game.hearts));
    waveText.textContent = `Wave ${Math.min(game.wave, TOTAL_WAVES)} / ${TOTAL_WAVES}`;
  }

  function render() {
    ctx.save();
    if (game && game.shake > 0) {
      ctx.translate((Math.random() - 0.5) * game.shake * 26, (Math.random() - 0.5) * game.shake * 18);
    }
    drawBackground();
    drawGrid();
    if (game) {
      const drawables = [...game.trees, ...game.enemies].sort((a, b) => a.y - b.y);
      for (const item of drawables) {
        if (item instanceof Tree) drawTree(item);
        else drawEnemy(item);
      }
      for (const orb of game.orbs) drawOrb(orb);
      for (const flower of game.flowers) drawManaFlower(flower);
      for (const p of game.particles) drawParticle(ctx, p);
      for (const f of game.floatTexts) drawFloatText(ctx, f);
    }
    ctx.restore();
  }

  function drawBackground() {
    const bg = images.bg;
    if (bg.ready) drawCover(ctx, bg.img, 0, 0, view.width, view.height);
    else {
      const g = ctx.createLinearGradient(0, 0, 0, view.height);
      g.addColorStop(0, "#205c31");
      g.addColorStop(1, "#0b2515");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  function drawGrid() {
    for (let lane = 0; lane < LANES; lane++) {
      ctx.fillStyle = lane % 2 ? "rgba(255,249,215,.08)" : "rgba(10,45,20,.18)";
      ctx.fillRect(gridLeft, gridTop + lane * laneH, cellW * COLS, laneH);
    }
    ctx.strokeStyle = "rgba(255,249,215,.25)";
    ctx.lineWidth = 2;
    for (let c = 0; c <= COLS; c++) line(ctx, gridLeft + c * cellW, gridTop, gridLeft + c * cellW, gridTop + LANES * laneH);
    for (let l = 0; l <= LANES; l++) line(ctx, gridLeft, gridTop + l * laneH, gridLeft + COLS * cellW, gridTop + l * laneH);
    ctx.fillStyle = "rgba(255,105,77,.22)";
    ctx.fillRect(0, gridTop, gridLeft, laneH * LANES);
    ctx.fillStyle = "#ffd765";
    ctx.font = "900 18px system-ui";
    ctx.fillText("♥", Math.max(8, gridLeft * 0.25), gridTop + laneH * 2);
  }

  function drawTree(t) {
    const size = Math.min(cellW * 0.76, laneH * 0.86);
    if (!drawSpriteTree(t, size)) {
      ctx.fillStyle = t.flash > 0 ? "#fff7ab" : "#7c4d23";
      roundRect(ctx, t.x - size * 0.12, t.y - size * 0.25, size * 0.24, size * 0.52, 8, true);
      ctx.fillStyle = t.flash > 0 ? "#eaff98" : "#2ccb5a";
      ctx.beginPath();
      ctx.arc(t.x, t.y - size * 0.35, size * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHp(ctx, t.x - size * 0.42, t.y + size * 0.28, size * 0.84, t.hp / t.maxHp, "#58e36d");
  }

  function drawSpriteTree(t, size) {
    if (!images.tree.ready) return false;
    ctx.globalAlpha = t.flash > 0 ? 0.62 : 1;
    ctx.drawImage(images.tree.img, t.x - size * 0.5, t.y - size * 0.68, size, size);
    ctx.globalAlpha = 1;
    return true;
  }

  function drawEnemy(e) {
    const w = Math.min(e.w, cellW * (e.kind === "dozer" ? 0.92 : 0.72));
    const h = Math.min(e.h, laneH * 0.82);
    const asset = e.kind === "dozer" ? images.dozer : images.logger;
    if (asset.ready) {
      ctx.globalAlpha = e.flash > 0 ? 0.58 : 1;
      ctx.drawImage(asset.img, e.x - w * 0.5, e.y - h * 0.64, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = e.flash > 0 ? "#fff0aa" : "#cf8b52";
      ctx.beginPath();
      ctx.arc(e.x, e.y - h * 0.54, h * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHp(ctx, e.x - w * 0.42, e.y - h * 0.78, w * 0.84, e.hp / e.maxHp, "#ff7056");
  }

  function drawOrb(o) {
    if (images.orb.ready) ctx.drawImage(images.orb.img, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    else {
      ctx.fillStyle = "#9cf7ff";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawManaFlower(f) {
    const r = f.r + Math.sin(f.pulse) * 2;
    if (images.mana.ready) ctx.drawImage(images.mana.img, f.x - r, f.y - r, r * 2, r * 2);
    else {
      ctx.fillStyle = "#86f7ff";
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGuardian() {
    const gc = $("guardianCanvas");
    if (!gc) return;
    const g = gc.getContext("2d");
    g.clearRect(0, 0, gc.width, gc.height);
    if (images.guardian.ready) {
      g.drawImage(images.guardian.img, 0, 0, gc.width, gc.height);
    }
  }

  function treeInLaneAtX(lane, x) {
    return game.trees.find((t) => t.lane === lane && Math.abs(t.x - x) < cellW * 0.42);
  }

  function cellFromPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < gridLeft || x > gridLeft + COLS * cellW || y < gridTop || y > gridTop + LANES * laneH) return null;
    return { col: Math.floor((x - gridLeft) / cellW), lane: Math.floor((y - gridTop) / laneH), x, y };
  }

  function handleFieldPointer(ev, dragging) {
    if (!game || game.state !== "playing") return;
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    for (let i = game.flowers.length - 1; i >= 0; i--) {
      const f = game.flowers[i];
      if (Math.hypot(f.x - x, f.y - y) <= f.r * 1.45) {
        game.flowers.splice(i, 1);
        game.mana = Math.min(999, game.mana + 25);
        game.floatTexts.push(new FloatText(f.x, f.y, "+25 mana", "#9cf7ff"));
        burst(game, f.x, f.y, "#9cf7ff", 18);
        audio.mana();
        return;
      }
    }
    const cell = cellFromPoint(ev.clientX, ev.clientY);
    if (!cell) return;
    const key = `${cell.col},${cell.lane}`;
    if (dragging && game.dragCell === key) return;
    game.dragCell = key;
    plant(cell.col, cell.lane);
  }

  function plant(col, lane) {
    if (game.mana < TREE_COST) return;
    if (game.trees.some((t) => t.col === col && t.lane === lane)) return;
    const tree = new Tree(col, lane);
    game.trees.push(tree);
    game.mana -= TREE_COST;
    burst(game, tree.x, tree.y, "#91ff70", 24);
    audio.plant();
  }

  function finish(won) {
    if (!game || game.state !== "playing") return;
    game.state = won ? "victory" : "gameover";
    endTitle.textContent = won ? "Victory" : "Game Over";
    endMessage.textContent = won ? "The jungle is saved." : "The jungle was cleared into farmland.";
    endOverlay.classList.remove("hidden");
    audio.end(won);
  }

  function startGame() {
    audio.ensure();
    rng = createRng("legacy-lane");
    game = new GameState();
    startScreen.classList.add("hidden");
    endOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    resize();
    announceWave();
  }

  function setPaused(paused) {
    if (!game || game.state !== "playing") return;
    game.state = paused ? "paused" : "playing";
    pauseOverlay.classList.toggle("hidden", !paused);
  }

  function bindEvents() {
    window.addEventListener("resize", resize);
    playButton?.addEventListener("click", startGame);
    replayButton?.addEventListener("click", startGame);
    pauseButton?.addEventListener("click", () => setPaused(true));
    resumeButton?.addEventListener("click", () => {
      if (game && game.state === "paused") {
        game.state = "playing";
        pauseOverlay.classList.add("hidden");
      }
    });
    muteButton?.addEventListener("click", () => {
      muted = !muted;
      muteButton.textContent = muted ? "🔇" : "🔊";
    });
    treeTool?.addEventListener("click", () => {
      if (game) game.selected = "tree";
      treeTool.classList.add("selected");
    });
    canvas.addEventListener("pointerdown", (e) => {
      pointerDown = true;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      handleFieldPointer(e, false);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (pointerDown) handleFieldPointer(e, true);
    });
    canvas.addEventListener("pointerup", () => {
      pointerDown = false;
      if (game) game.dragCell = null;
    });
    canvas.addEventListener("pointercancel", () => {
      pointerDown = false;
      if (game) game.dragCell = null;
    });
  }

  const loop = createGameLoop(update, render);

  return {
    start() {
      bindEvents();
      resize();
      drawGuardian();
      loop.start();
      setTimeout(drawGuardian, 250);
    },
    update,
    getGame: () => game,
  };
}
