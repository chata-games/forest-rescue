import { campaign, challenges } from "./campaign-data.js";

const variants = [
  { id: "trail", label: "Trail overlay" },
  { id: "acts", label: "Act itinerary" },
  { id: "compass", label: "Level compass" },
];

const params = new URLSearchParams(window.location.search);
const requestedVariant = params.get("variant");
const state = {
  variant: variants.some((variant) => variant.id === requestedVariant) ? requestedVariant : "trail",
  selectedId: "whispering-river",
  challenge: "medium",
  inspect: params.get("inspect") === "1",
  announcement: "Whispering River selected.",
};

const app = document.querySelector("#app");

function levelById(id) {
  return campaign.levels.find((level) => level.id === id);
}

function challengeLabel() {
  return challenges.find((challenge) => challenge.id === state.challenge).label;
}

function starsFor(level) {
  return level.stars[state.challenge] || 0;
}

function statusLabel(level) {
  if (level.status === "locked") return "Locked";
  if (level.status === "current") return "Next level";
  if (level.status === "complete") return "Complete";
  return "Available";
}

function accessibleName(level) {
  const starText = starsFor(level) === 1 ? "1 of 3 stars" : starsFor(level) + " of 3 stars";
  const lockText = level.status === "locked" ? ". Requires " + level.requirement : "";
  return "Level " + level.number + ", " + level.name + ". " + statusLabel(level) + ". " + starText + " on " + challengeLabel() + " Challenge" + lockText;
}

function icon(name) {
  if (name === "left") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>';
  }
  if (name === "right") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg>';
  }
  if (name === "lock") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  }
  return "";
}

function starRow(level) {
  const count = starsFor(level);
  return '<span class="stars" aria-hidden="true">' +
    [1, 2, 3].map((value) => '<span class="' + (value <= count ? "is-earned" : "") + '">★</span>').join("") +
    "</span>";
}

function levelButton(level, placementClass) {
  const selected = level.id === state.selectedId;
  const classes = ["level-node", "state-" + level.status, placementClass || ""].filter(Boolean).join(" ");
  return '<button class="' + classes + '" type="button" data-action="select" data-level="' + level.id + '"' +
    ' style="--x:' + level.x + "%;--y:" + level.y + '%"' +
    ' aria-label="' + accessibleName(level) + '"' +
    ' aria-current="' + (selected ? "step" : "false") + '">' +
    '<span class="node-orbit" aria-hidden="true"></span>' +
    '<span class="node-core" aria-hidden="true">' + (level.status === "locked" ? icon("lock") : level.number) + "</span>" +
    '<span class="node-stars">' + starRow(level) + "</span>" +
    "</button>";
}

function routePath(levels) {
  return levels.map((level, index) => (index === 0 ? "M " : "L ") + level.x + " " + level.y).join(" ");
}

function routeMarkup(mode) {
  if (mode === "acts") {
    return '<svg class="route-layer route-layer--acts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      campaign.acts.map((act) => {
        const levels = act.levels.map((number) => campaign.levels[number - 1]);
        return '<path class="route act-' + act.id + '" d="' + routePath(levels) + '"/>';
      }).join("") +
      "</svg>";
  }
  return '<svg class="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="route route-shadow" d="' +
    routePath(campaign.levels) + '"/><path class="route route-progress" d="' + routePath(campaign.levels.slice(0, 4)) + '"/></svg>';
}

function mapFrame(options) {
  const nodes = options.interactiveNodes === false
    ? '<div class="visual-nodes" aria-hidden="true">' + campaign.levels.map((level) => '<span class="visual-node state-' + level.status + '" style="--x:' + level.x + "%;--y:" + level.y + '%">' + level.number + "</span>").join("") + "</div>"
    : '<nav class="map-nodes" aria-label="Campaign levels">' + campaign.levels.map((level) => levelButton(level, "map-node")).join("") + "</nav>";
  return '<div class="map-frame ' + (options.className || "") + '" style="--scenery:url(' + campaign.scenery + ')">' +
    '<div class="scenery" aria-hidden="true"></div>' +
    routeMarkup(options.routeMode) +
    nodes +
    (state.inspect ? '<div class="geometry-label" aria-hidden="true">100 × 100 normalized geometry</div>' : "") +
    "</div>";
}

function detailPanel(level, floating) {
  const locked = level.status === "locked";
  return '<aside class="level-detail ' + (floating ? "level-detail--floating" : "") + '" aria-label="Selected level details">' +
    '<p class="detail-kicker">Level ' + level.number + " · " + statusLabel(level) + "</p>" +
    "<h2>" + level.name + "</h2>" +
    '<div class="detail-progress"><span>' + challengeLabel() + " Challenge</span>" + starRow(level) + "</div>" +
    "<p>" + (locked ? level.requirement + " to reveal this route." : "Choose this level to review its Loadout before battle.") + "</p>" +
    '<button class="primary-action" type="button" data-action="launch" data-level="' + level.id + '"' + (locked ? " disabled" : "") + ">" +
    (locked ? icon("lock") + " Locked" : "Review Loadout") + "</button>" +
    "</aside>";
}

function renderTrail(level) {
  return '<div class="surface direct-layout">' +
    mapFrame({ className: "map-frame--direct" }) +
    detailPanel(level, false) +
    "</div>";
}

function actCard(act) {
  const actLevels = act.levels.map((number) => campaign.levels[number - 1]);
  const complete = actLevels.filter((level) => level.status === "complete").length;
  return '<section class="act-card act-card--' + act.id + '">' +
    '<header><h2>' + act.label + '</h2><span>' + complete + "/" + actLevels.length + " cleared</span></header>" +
    '<nav aria-label="' + act.label + ' levels"><ol>' +
    actLevels.map((level) => '<li>' + levelButton(level, "itinerary-node") + '<span class="itinerary-copy"><strong>' + level.number + ". " + level.name + "</strong><small>" + statusLabel(level) + " · " + starsFor(level) + "/3 stars</small></span></li>").join("") +
    "</ol></nav></section>";
}

function renderActs(level) {
  return '<div class="surface act-layout">' +
    '<div class="act-map">' + mapFrame({ className: "map-frame--context", routeMode: "acts", interactiveNodes: false }) + detailPanel(level, true) + "</div>" +
    '<div class="act-itinerary">' + campaign.acts.map(actCard).join("") + "</div>" +
    "</div>";
}

function compassButton(level) {
  const selected = level.id === state.selectedId;
  return '<li><button type="button" class="compass-level state-' + level.status + '" data-action="select" data-level="' + level.id + '"' +
    ' aria-label="' + accessibleName(level) + '" aria-current="' + (selected ? "step" : "false") + '">' +
    '<span class="compass-number">' + (level.status === "locked" ? icon("lock") : level.number) + "</span>" +
    '<span class="compass-copy"><strong>' + level.name + "</strong><small>" + statusLabel(level) + " · " + starsFor(level) + "/3 ★</small></span>" +
    "</button></li>";
}

function renderCompass(level) {
  return '<div class="surface compass-layout">' +
    '<nav class="compass-rail" aria-label="Campaign levels"><p class="rail-title">Journey</p><ol>' + campaign.levels.map(compassButton).join("") + "</ol></nav>" +
    '<div class="focus-map">' + mapFrame({ className: "map-frame--focus", interactiveNodes: false }) +
    '<div class="focus-card" style="--x:' + level.x + "%;--y:" + level.y + '%" aria-hidden="true"><span>' + level.number + "</span></div>" +
    detailPanel(level, true) + "</div></div>";
}

function inspector(level) {
  if (!state.inspect) return "";
  return '<aside class="inspector" aria-label="Prototype system inspector">' +
    '<strong>Runtime-owned state</strong>' +
    "<dl>" +
    "<dt>Scenery</dt><dd>" + campaign.scenery + "</dd>" +
    "<dt>Route</dt><dd>campaign.route · " + campaign.route.length + " nodes</dd>" +
    "<dt>Selected</dt><dd>" + level.id + "</dd>" +
    "<dt>Position</dt><dd>x " + level.x + "% · y " + level.y + "%</dd>" +
    "<dt>Hit target</dt><dd>56 CSS px</dd>" +
    "<dt>State</dt><dd>" + level.status + "</dd>" +
    "<dt>Challenge</dt><dd>" + state.challenge + " · " + starsFor(level) + "/3 stars</dd>" +
    "<dt>Accessible name</dt><dd>" + accessibleName(level) + "</dd>" +
    "</dl></aside>";
}

function switcher() {
  const currentIndex = variants.findIndex((variant) => variant.id === state.variant);
  const current = variants[currentIndex];
  return '<nav class="prototype-switcher" aria-label="Prototype variants">' +
    '<button type="button" data-action="previous-variant" aria-label="Previous variant">' + icon("left") + "</button>" +
    '<span><small>Prototype</small>' + (currentIndex + 1) + " / " + variants.length + " · " + current.label + "</span>" +
    '<button type="button" data-action="next-variant" aria-label="Next variant">' + icon("right") + "</button>" +
    "</nav>";
}

function render(focusId) {
  const level = levelById(state.selectedId);
  const content = state.variant === "acts" ? renderActs(level) : state.variant === "compass" ? renderCompass(level) : renderTrail(level);
  app.className = "prototype variant-" + state.variant + (state.inspect ? " is-inspecting" : "");
  app.innerHTML =
    '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark" aria-hidden="true">H</span><span><strong>' + campaign.title + '</strong><small>Campaign map system prototype</small></span></div>' +
      '<div class="top-actions">' +
        '<button type="button" data-action="cycle-challenge" aria-label="Change Challenge. Current: ' + challengeLabel() + '">Challenge · ' + challengeLabel() + "</button>" +
        '<button type="button" data-action="toggle-inspect" aria-pressed="' + state.inspect + '">' + (state.inspect ? "Hide system" : "Inspect system") + "</button>" +
      "</div>" +
    "</header>" +
    content +
    inspector(level) +
    '<p class="sr-only" aria-live="polite">' + state.announcement + "</p>" +
    switcher();

  if (focusId) {
    const target = app.querySelector('[data-level="' + focusId + '"]');
    if (target) target.focus({ preventScroll: true });
  }
}

function updateUrl() {
  const next = new URL(window.location.href);
  next.searchParams.set("variant", state.variant);
  if (state.inspect) next.searchParams.set("inspect", "1");
  else next.searchParams.delete("inspect");
  window.history.replaceState({}, "", next);
}

function cycleVariant(direction) {
  const index = variants.findIndex((variant) => variant.id === state.variant);
  state.variant = variants[(index + direction + variants.length) % variants.length].id;
  state.announcement = variants.find((variant) => variant.id === state.variant).label + " variant shown.";
  updateUrl();
  render();
}

app.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  if (action === "select") {
    const level = levelById(control.dataset.level);
    state.selectedId = level.id;
    state.announcement = level.status === "locked" ? level.name + " is locked. " + level.requirement + "." : level.name + " selected.";
    render(level.id);
  } else if (action === "cycle-challenge") {
    const index = challenges.findIndex((challenge) => challenge.id === state.challenge);
    state.challenge = challenges[(index + 1) % challenges.length].id;
    state.announcement = challengeLabel() + " Challenge progress shown.";
    render();
  } else if (action === "toggle-inspect") {
    state.inspect = !state.inspect;
    state.announcement = state.inspect ? "System inspection shown." : "System inspection hidden.";
    updateUrl();
    render();
  } else if (action === "previous-variant") {
    cycleVariant(-1);
  } else if (action === "next-variant") {
    cycleVariant(1);
  } else if (action === "launch") {
    state.announcement = levelById(control.dataset.level).name + " would open Loadout review. Prototype state changed only in memory.";
    render(control.dataset.level);
  }
});

window.addEventListener("keydown", (event) => {
  const active = document.activeElement;
  if (active && (active.matches("input, textarea") || active.isContentEditable)) return;
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});

render();
