export const challenges = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export const campaign = {
  id: "heartwood-v1",
  title: "Heartwood Campaign",
  scenery: "assets/campaign-scenery-only.png",
  route: ["meadows-edge", "old-stump", "whispering-river", "mushroom-hollow", "sawmill-clearing", "ashfall-scar", "boulder-pass", "canopy-crossing", "moonlit-gate", "heartwood"],
  acts: [
    { id: "roots", label: "Act I · Rootsong", levels: [1, 2, 3, 4] },
    { id: "iron", label: "Act II · Iron Trail", levels: [5, 6, 7] },
    { id: "crown", label: "Act III · Heartwood Crown", levels: [8, 9, 10] },
  ],
  levels: [
    { number: 1, id: "meadows-edge", name: "Meadow’s Edge", x: 18, y: 84, status: "complete", requirement: "", stars: { low: 3, medium: 3, high: 2 } },
    { number: 2, id: "old-stump", name: "Old Stump Crossroads", x: 41, y: 73, status: "complete", requirement: "", stars: { low: 3, medium: 2, high: 1 } },
    { number: 3, id: "whispering-river", name: "Whispering River", x: 31, y: 58, status: "current", requirement: "", stars: { low: 2, medium: 1, high: 0 } },
    { number: 4, id: "mushroom-hollow", name: "Mushroom Hollow", x: 20, y: 43, status: "available", requirement: "", stars: { low: 0, medium: 0, high: 0 } },
    { number: 5, id: "sawmill-clearing", name: "Sawmill Clearing", x: 57, y: 57, status: "locked", requirement: "Finish Mushroom Hollow", stars: { low: 0, medium: 0, high: 0 } },
    { number: 6, id: "ashfall-scar", name: "Ashfall Scar", x: 77, y: 72, status: "locked", requirement: "Finish Sawmill Clearing", stars: { low: 0, medium: 0, high: 0 } },
    { number: 7, id: "boulder-pass", name: "Boulder Pass", x: 84, y: 45, status: "locked", requirement: "Finish Ashfall Scar", stars: { low: 0, medium: 0, high: 0 } },
    { number: 8, id: "canopy-crossing", name: "Canopy Crossing", x: 82, y: 23, status: "locked", requirement: "Finish Boulder Pass", stars: { low: 0, medium: 0, high: 0 } },
    { number: 9, id: "moonlit-gate", name: "Moonlit Gate", x: 27, y: 23, status: "locked", requirement: "Finish Canopy Crossing", stars: { low: 0, medium: 0, high: 0 } },
    { number: 10, id: "heartwood", name: "Heartwood Awakening", x: 49, y: 31, status: "locked", requirement: "Finish Moonlit Gate", stars: { low: 0, medium: 0, high: 0 } },
  ],
};
