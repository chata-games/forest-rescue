import { initLegacyLane } from "./legacy-lane.js";
import { initCampaign } from "./campaign.js";
import { getSideways } from "./engine/sideways.js";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "campaign";

function hideAllScreens() {
  for (const id of ["startScreen", "gameScreen", "campaignScreen", "pauseOverlay", "endOverlay"]) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  }
}

// Sideways mode (RP-eqbawv): the start-screen and HUD toggles are shared by the
// campaign and the classic lane mode, so they bind once here.
function bindSideways() {
  const sideways = getSideways(document, window);
  const startToggle = document.getElementById("sidewaysStartButton");
  const hudToggle = document.getElementById("rotateButton");
  function sync() {
    const on = sideways.enabled;
    if (startToggle) {
      startToggle.textContent = `Rotate screen: ${on ? "On" : "Off"}`;
      startToggle.setAttribute("aria-pressed", String(on));
    }
    hudToggle?.setAttribute("aria-pressed", String(on));
  }
  const toggle = () => {
    sideways.toggle();
    sync();
  };
  startToggle?.addEventListener("click", toggle);
  hudToggle?.addEventListener("click", toggle);
  sync();
}

async function main() {
  bindSideways();
  // On a direct-level entry (?level=…) the auto-started battle mounts under the
  // start screen, which index.html ships visible as a full-viewport overlay
  // (z-index 20) — it would swallow every tap. Clear the screens for that path;
  // initCampaign re-shows the start screen when there is no ?level param.
  if (params.get("level")) hideAllScreens();

  if (mode === "legacy") {
    const legacy = initLegacyLane(document);
    legacy.start();
    return;
  }

  const campaign = await initCampaign(document);
  campaign.start();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend",
    `<p style="color:#fff;padding:1rem">Failed to start: ${err.message}</p>`);
});
