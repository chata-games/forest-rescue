(function () {
  "use strict";

  const COLS = 7;
  const LANES = 4;
  const TREE_COST = 50;
  const MAX_HEARTS = 5;
  const TOTAL_WAVES = 8;
  const STEP = 1 / 60;

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d");
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

  const images = {};
  const imagePaths = {
    bg: "assets/bg.png",
    tree: "assets/tree.png",
    logger: "assets/logger.png",
    dozer: "assets/dozer.png",
    orb: "assets/orb.png",
    mana: "assets/mana.png",
    guardian: "assets/guardian.png"
  };

  for (const [key, src] of Object.entries(imagePaths)) {
    const img = new Image();
    images[key] = { img, ready: false, failed: false };
    img.onload = () => {
      images[key].ready = true;
      if (key === "guardian") drawGuardian();
    };
    img.onerror = () => { images[key].failed = true; };
    img.src = src;
  }

  let width = 1;
  let height = 1;
  let dpr = 1;
  let cellW = 1;
  let laneH = 1;
  let gridLeft = 0;
  let gridTop = 0;
  let game = null;
  let lastTime = 0;
  let accumulator = 0;
  let pointerDown = false;
  let audio = null;
  let muted = false;

  class AudioKit {
    constructor() {
      this.ctx = null;
    }
    ensure() {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!this.ctx) this.ctx = new AudioCtor();
      if (this.ctx.state === "suspended") this.ctx.resume();
    }
    tone(freq, dur, type, gain) {
      if (muted) return;
      this.ensure();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, now);
      amp.gain.setValueAtTime(gain || 0.05, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(amp).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    }
    plant() { this.tone(440, 0.12, "triangle", 0.055); this.tone(660, 0.16, "sine", 0.035); }
    shoot() { this.tone(760, 0.06, "sine", 0.025); }
    hit() { this.tone(160, 0.08, "sawtooth", 0.035); }
    mana() { this.tone(900, 0.12, "triangle", 0.045); this.tone(1200, 0.14, "sine", 0.03); }
    crush() { this.tone(75, 0.22, "square", 0.06); }
    end(win) { this.tone(win ? 620 : 130, 0.25, "triangle", 0.055); this.tone(win ? 880 : 95, 0.32, "sine", 0.04); }
  }

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
      this.x = width + 55;
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
          burst(tree.x, tree.y, this.kind === "dozer" ? "#b8a079" : "#8bec67", 12);
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
        burst(gridLeft + 16, this.y, "#ff694d", 16);
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
      const hit = game.enemies.find((e) => e.lane === this.lane && !e.dead && Math.abs(e.x - this.x) < e.w * 0.48 && Math.abs(e.y - this.y) < e.h * 0.5);
      if (hit) {
        hit.hp -= this.damage;
        hit.flash = 0.1;
        this.dead = true;
        burst(this.x, this.y, "#9cf7ff", 10);
        audio.hit();
        if (hit.hp <= 0) {
          hit.dead = true;
          burst(hit.x, hit.y, hit.kind === "dozer" ? "#cfd0a7" : "#a5ff70", 24);
          game.mana = Math.min(999, game.mana + (hit.kind === "dozer" ? 15 : 8));
        }
      }
      if (this.x > width + 40) this.dead = true;
    }
  }

  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 120;
      this.vy = (Math.random() - 0.7) * 120;
      this.life = 0.55 + Math.random() * 0.45;
      this.maxLife = this.life;
      this.color = color;
      this.size = 3 + Math.random() * 5;
    }
    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 120 * dt;
    }
  }

  class ManaFlower {
    constructor() {
      this.x = gridLeft + Math.random() * Math.max(1, COLS * cellW);
      this.y = gridTop + Math.random() * Math.max(1, LANES * laneH);
      this.r = 22;
      this.life = 8.5;
      this.pulse = Math.random() * 6;
    }
    update(dt) {
      this.life -= dt;
      this.pulse += dt * 5;
      this.y -= Math.sin(this.pulse) * dt * 4;
    }
  }

  class FloatText {
    constructor(x, y, text, color) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.life = 1;
    }
    update(dt) {
      this.life -= dt;
      this.y -= 38 * dt;
    }
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    width = Math.max(320, Math.floor(rect.width));
    height = Math.max(220, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gridLeft = Math.max(20, width * 0.045);
    gridTop = Math.max(18, height * 0.08);
    cellW = (width - gridLeft - Math.max(36, width * 0.08)) / COLS;
    laneH = (height - gridTop - Math.max(22, height * 0.07)) / LANES;
  }

  function startGame() {
    audio.ensure();
    game = new GameState();
    startScreen.classList.add("hidden");
    endOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    resize();
    announceWave();
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
      game.waveQueue.push(Math.random() < dozerChance ? "dozer" : "logger");
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
      game.flowerTimer = 8 + Math.random() * 5;
    }
    if (game.waveActive) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0 && game.waveQueue.length) {
        const kind = game.waveQueue.shift();
        const lane = Math.floor(Math.random() * LANES);
        game.enemies.push(kind === "dozer" ? new Bulldozer(lane) : new Logger(lane));
        game.spawnTimer = Math.max(0.55, 1.55 - game.wave * 0.08) + Math.random() * 0.8;
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
      for (const item of drawables) item instanceof Tree ? drawTree(item) : drawEnemy(item);
      for (const orb of game.orbs) drawOrb(orb);
      for (const flower of game.flowers) drawManaFlower(flower);
      for (const p of game.particles) drawParticle(p);
      for (const f of game.floatTexts) drawFloatText(f);
    }
    ctx.restore();
  }

  function drawBackground() {
    const bg = images.bg;
    if (bg.ready) drawCover(bg.img, 0, 0, width, height);
    else {
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, "#205c31");
      g.addColorStop(1, "#0b2515");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 28; i++) {
        const x = (i * 97) % width;
        const y = (i * 61) % height;
        ctx.fillStyle = i % 2 ? "rgba(86,180,78,.18)" : "rgba(255,215,101,.12)";
        ctx.beginPath();
        ctx.ellipse(x, y, 24 + (i % 5) * 6, 10 + (i % 3) * 6, i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGrid() {
    for (let lane = 0; lane < LANES; lane++) {
      ctx.fillStyle = lane % 2 ? "rgba(255,249,215,.08)" : "rgba(10,45,20,.18)";
      ctx.fillRect(gridLeft, gridTop + lane * laneH, cellW * COLS, laneH);
    }
    ctx.strokeStyle = "rgba(255,249,215,.25)";
    ctx.lineWidth = 2;
    for (let c = 0; c <= COLS; c++) line(gridLeft + c * cellW, gridTop, gridLeft + c * cellW, gridTop + LANES * laneH);
    for (let l = 0; l <= LANES; l++) line(gridLeft, gridTop + l * laneH, gridLeft + COLS * cellW, gridTop + l * laneH);
    ctx.fillStyle = "rgba(255,105,77,.22)";
    ctx.fillRect(0, gridTop, gridLeft, laneH * LANES);
    ctx.fillStyle = "#ffd765";
    ctx.font = "900 18px system-ui";
    ctx.fillText("♥", Math.max(8, gridLeft * 0.25), gridTop + laneH * 2);
  }

  function drawTree(t) {
    const size = Math.min(cellW * 0.76, laneH * 0.86);
    if (images.tree.ready) {
      ctx.globalAlpha = t.flash > 0 ? 0.62 : 1;
      ctx.drawImage(images.tree.img, t.x - size * 0.5, t.y - size * 0.68, size, size);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = t.flash > 0 ? "#fff7ab" : "#7c4d23";
      roundRect(t.x - size * 0.12, t.y - size * 0.25, size * 0.24, size * 0.52, 8, true);
      ctx.fillStyle = t.flash > 0 ? "#eaff98" : "#2ccb5a";
      ctx.beginPath();
      ctx.arc(t.x, t.y - size * 0.35, size * 0.34, 0, Math.PI * 2);
      ctx.arc(t.x - size * 0.22, t.y - size * 0.18, size * 0.25, 0, Math.PI * 2);
      ctx.arc(t.x + size * 0.22, t.y - size * 0.16, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#caff7f";
      ctx.beginPath();
      ctx.arc(t.x + size * 0.16, t.y - size * 0.42, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHp(t.x - size * 0.42, t.y + size * 0.28, size * 0.84, t.hp / t.maxHp, "#58e36d");
  }

  function drawEnemy(e) {
    const w = Math.min(e.w, cellW * (e.kind === "dozer" ? 0.92 : 0.72));
    const h = Math.min(e.h, laneH * 0.82);
    const asset = e.kind === "dozer" ? images.dozer : images.logger;
    if (asset.ready) {
      ctx.globalAlpha = e.flash > 0 ? 0.58 : 1;
      ctx.drawImage(asset.img, e.x - w * 0.5, e.y - h * 0.64, w, h);
      ctx.globalAlpha = 1;
    } else if (e.kind === "dozer") {
      ctx.fillStyle = e.flash > 0 ? "#fff6b8" : "#d9b85f";
      roundRect(e.x - w * 0.5, e.y - h * 0.45, w, h * 0.55, 9, true);
      ctx.fillStyle = "#56606a";
      roundRect(e.x - w * 0.34, e.y - h * 0.72, w * 0.38, h * 0.32, 6, true);
      ctx.fillStyle = "#3b3b36";
      ctx.beginPath(); ctx.arc(e.x - w * 0.28, e.y + h * 0.14, h * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + w * 0.28, e.y + h * 0.14, h * 0.16, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = e.flash > 0 ? "#fff0aa" : "#cf8b52";
      ctx.beginPath(); ctx.arc(e.x, e.y - h * 0.54, h * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8b4d2c";
      roundRect(e.x - w * 0.22, e.y - h * 0.36, w * 0.44, h * 0.48, 7, true);
      ctx.strokeStyle = "#cfd6dc"; ctx.lineWidth = 5;
      line(e.x - w * 0.1, e.y - h * 0.28, e.x - w * 0.48, e.y - h * 0.52);
      ctx.fillStyle = "#4c3022";
      roundRect(e.x - w * 0.2, e.y + h * 0.08, w * 0.15, h * 0.26, 4, true);
      roundRect(e.x + w * 0.05, e.y + h * 0.08, w * 0.15, h * 0.26, 4, true);
    }
    drawHp(e.x - w * 0.42, e.y - h * 0.78, w * 0.84, e.hp / e.maxHp, "#ff7056");
  }

  function drawOrb(o) {
    if (images.orb.ready) ctx.drawImage(images.orb.img, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    else {
      const g = ctx.createRadialGradient(o.x - 3, o.y - 3, 1, o.x, o.y, o.r);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.35, "#9cf7ff");
      g.addColorStop(1, "rgba(53,160,255,.15)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawManaFlower(f) {
    const r = f.r + Math.sin(f.pulse) * 2;
    if (images.mana.ready) ctx.drawImage(images.mana.img, f.x - r, f.y - r, r * 2, r * 2);
    else {
      ctx.fillStyle = "rgba(97,232,255,.22)";
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.35, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = "#86f7ff";
        ctx.beginPath();
        ctx.ellipse(f.x + Math.cos(i) * r * 0.45, f.y + Math.sin(i) * r * 0.45, r * 0.26, r * 0.48, i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff7a8";
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.28, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFloatText(f) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.font = "900 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  function drawGuardian() {
    const gc = $("guardianCanvas");
    const g = gc.getContext("2d");
    g.clearRect(0, 0, gc.width, gc.height);
    if (images.guardian.ready) {
      g.drawImage(images.guardian.img, 0, 0, gc.width, gc.height);
      return;
    }
    g.fillStyle = "#2ccb5a";
    g.beginPath(); g.arc(90, 88, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#16512b";
    g.beginPath(); g.arc(66, 80, 8, 0, Math.PI * 2); g.arc(114, 80, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#16512b"; g.lineWidth = 8; g.beginPath(); g.arc(90, 92, 24, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = "#ffe58b"; g.beginPath(); g.arc(90, 36, 18, 0, Math.PI * 2); g.fill();
  }

  function drawHp(x, y, w, pct, color) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    roundRect(x, y, w, 6, 3, true);
    ctx.fillStyle = color;
    roundRect(x, y, Math.max(0, w * pct), 6, 3, true);
  }

  function drawCover(img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = img.width * s;
    const sh = img.height * s;
    ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r, fill) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill(); else ctx.stroke();
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
        burst(f.x, f.y, "#9cf7ff", 18);
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
    burst(tree.x, tree.y, "#91ff70", 24);
    audio.plant();
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) game.particles.push(new Particle(x, y, color));
  }

  function finish(won) {
    if (!game || game.state !== "playing") return;
    game.state = won ? "victory" : "gameover";
    endTitle.textContent = won ? "Victory" : "Game Over";
    endMessage.textContent = won ? "The jungle is saved." : "The jungle was cleared into farmland.";
    endOverlay.classList.remove("hidden");
    audio.end(won);
  }

  function loop(ts) {
    const now = ts / 1000;
    const delta = Math.min(0.08, now - (lastTime || now));
    lastTime = now;
    accumulator += delta;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render();
    requestAnimationFrame(loop);
  }

  function setPaused(paused) {
    if (!game || game.state !== "playing") return;
    game.state = paused ? "paused" : "playing";
    pauseOverlay.classList.toggle("hidden", !paused);
  }

  function bindEvents() {
    window.addEventListener("resize", resize);
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    playButton.addEventListener("click", startGame);
    replayButton.addEventListener("click", startGame);
    pauseButton.addEventListener("click", () => setPaused(true));
    resumeButton.addEventListener("click", () => {
      if (game && game.state === "paused") {
        game.state = "playing";
        pauseOverlay.classList.add("hidden");
      }
    });
    muteButton.addEventListener("click", () => {
      muted = !muted;
      muteButton.textContent = muted ? "🔇" : "🔊";
    });
    treeTool.addEventListener("click", () => {
      game.selected = "tree";
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

  function init() {
    audio = new AudioKit();
    gameScreen.classList.remove("hidden");
    resize();
    gameScreen.classList.add("hidden");
    drawGuardian();
    bindEvents();
    requestAnimationFrame(loop);
    setTimeout(drawGuardian, 250);
  }

  init();
})();
