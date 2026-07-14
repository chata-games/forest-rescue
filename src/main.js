import { initLegacyLane } from "./legacy-lane.js";
import { initCampaign } from "./campaign.js";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "campaign";

function hideAllScreens() {
  for (const id of ["startScreen", "gameScreen", "campaignScreen", "pauseOverlay", "endOverlay"]) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  }
}

async function main() {
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
