import { loadLevel, loadCatalog } from "./level/loader.js";
import { initHeartwoodGame } from "./heartwood-game.js";
import { loadSprites, loadUnitsAtlas, loadCatalogSprites } from "./rendering/sprites.js";

const LEVELS = [
  { id: "01-meadows-edge", name: "Meadow's Edge", x: 0.12, y: 0.72, unlocks: ["sprig-sentinel", "thornvine-bramble"] },
  { id: "02-old-stump-crossroads", name: "Old Stump Crossroads", x: 0.28, y: 0.58, unlocks: ["wisp-willow"] },
  { id: "03-whispering-river", name: "Whispering River", x: 0.44, y: 0.48, unlocks: ["dewdrop-nymph"] },
];

export async function initCampaign(dom) {
  const $ = (id) => dom.getElementById(id);
  const startScreen = $("startScreen");
  const campaignScreen = $("campaignScreen");
  const gameScreen = $("gameScreen");
  const playButton = $("playButton");
  const backToMapButton = $("backToMapButton");
  const campaignMap = $("campaignMap");
  const levelTitle = $("levelTitle");

  const catalog = await loadCatalog();
  const [atlas, uiSprites] = await Promise.all([
    loadUnitsAtlas(),
    Promise.resolve(loadSprites({
      guardian: "assets/guardian.png",
      worldMap: "assets/campaign-world-map.png",
    })),
  ]);
  const { images } = uiSprites;
  const { images: sceneImages, ready: sceneReady } = loadCatalogSprites(
    catalog,
    (a) => a.tags?.some((t) => ["material", "decoration", "landmark"].includes(t)),
  );
  await sceneReady;

  let stars = JSON.parse(localStorage.getItem("heartwood-stars") || "{}");
  let activeGame = null;

  function showCampaign() {
    startScreen?.classList.add("hidden");
    gameScreen?.classList.add("hidden");
    campaignScreen?.classList.remove("hidden");
    drawCampaignMap();
  }

  function drawGuardian() {
    const gc = $("guardianCanvas");
    if (!gc) return;
    const g = gc.getContext("2d");
    g.clearRect(0, 0, gc.width, gc.height);
    if (images.guardian?.ready) g.drawImage(images.guardian.img, 0, 0, gc.width, gc.height);
  }

  function drawCampaignMap() {
    if (!campaignMap) return;
    const ctx = campaignMap.getContext("2d");
    const w = campaignMap.width;
    const h = campaignMap.height;
    ctx.clearRect(0, 0, w, h);
    if (images.worldMap?.ready) {
      ctx.drawImage(images.worldMap.img, 0, 0, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1a4a2e");
      g.addColorStop(1, "#0d2818");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    for (const lvl of LEVELS) {
      const px = lvl.x * w;
      const py = lvl.y * h;
      const starCount = stars[lvl.id] || 0;
      ctx.fillStyle = starCount > 0 ? "#ffd765" : "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a3a22";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(String(LEVELS.indexOf(lvl) + 1), px, py + 5);
      if (starCount > 0) {
        ctx.fillStyle = "#ffd765";
        ctx.font = "12px system-ui";
        ctx.fillText("★".repeat(starCount), px, py + 22);
      }
    }
  }

  async function startLevel(levelId) {
    const level = await loadLevel(levelId);
    const levelIndex = LEVELS.findIndex((l) => l.id === levelId);
    const cumulativeUnlocks = LEVELS.slice(0, levelIndex + 1).flatMap((l) => l.unlocks);
    level.unlocks = [...new Set([...(level.unlocks || []), ...cumulativeUnlocks])];
    campaignScreen?.classList.add("hidden");
    gameScreen?.classList.remove("hidden");
    if (levelTitle) levelTitle.textContent = level.name || levelId;

    activeGame = initHeartwoodGame(dom, level, {
      catalog,
      atlas,
      images: sceneImages,
      onComplete(lvl, heartsRemaining) {
        const maxHearts = lvl.maxHearts || 5;
        const starCount = heartsRemaining >= maxHearts ? 3 : heartsRemaining >= maxHearts - 1 ? 2 : 1;
        stars[lvl.id] = Math.max(stars[lvl.id] || 0, starCount);
        localStorage.setItem("heartwood-stars", JSON.stringify(stars));
      },
    });
    activeGame.start();
  }

  function bindEvents() {
    playButton?.addEventListener("click", showCampaign);
    backToMapButton?.addEventListener("click", () => {
      gameScreen?.classList.add("hidden");
      dom.getElementById("endOverlay")?.classList.add("hidden");
      showCampaign();
    });
    campaignMap?.addEventListener("click", (e) => {
      const rect = campaignMap.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      let best = null;
      let bestD = Infinity;
      for (const lvl of LEVELS) {
        const d = Math.hypot(x - lvl.x, y - lvl.y);
        if (d < bestD) { bestD = d; best = lvl; }
      }
      if (best && bestD < 0.08) startLevel(best.id);
    });

    const params = new URLSearchParams(window.location.search);
    const directLevel = params.get("level");
    if (directLevel) startLevel(directLevel);
  }

  return {
    start() {
      drawGuardian();
      bindEvents();
      setTimeout(drawGuardian, 250);
      const params = new URLSearchParams(window.location.search);
      if (!params.get("level")) {
        startScreen?.classList.remove("hidden");
        campaignScreen?.classList.add("hidden");
        gameScreen?.classList.add("hidden");
      }
    },
  };
}
