export const BIOMES = {
  "meadow-edge": {
    id: "meadow-edge",
    name: "Meadow's Edge",
    baseColor: "#2a6b3a",
    accentColor: "#4a9e58",
    pathColor: "#c4a86a",
    pathEdgeColor: "#8b7348",
    noiseTint: "rgba(120,200,90,0.12)",
    waterColor: null,
  },
  "stump-crossroads": {
    id: "stump-crossroads",
    name: "Old Stump Crossroads",
    baseColor: "#3d4a32",
    accentColor: "#5c6b48",
    pathColor: "#b89a6e",
    pathEdgeColor: "#7a6544",
    noiseTint: "rgba(90,70,50,0.15)",
    waterColor: null,
  },
  "whispering-river": {
    id: "whispering-river",
    name: "Whispering River",
    baseColor: "#1e5a4a",
    accentColor: "#3a8a72",
    pathColor: "#c9b080",
    pathEdgeColor: "#8a7550",
    noiseTint: "rgba(60,140,120,0.14)",
    waterColor: "rgba(40,120,160,0.55)",
  },
};

export function getBiome(id) {
  return BIOMES[id] || BIOMES["meadow-edge"];
}
