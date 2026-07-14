export async function loadLevel(id) {
  const res = await fetch(`levels/compiled/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load level: ${id}`);
  return res.json();
}

export async function loadCatalog() {
  try {
    const res = await fetch("assets/catalog.json");
    if (!res.ok) return { assets: [] };
    return res.json();
  } catch {
    return { assets: [] };
  }
}

export function levelUnlocks(level) {
  return level.unlocks || [];
}

export function levelWaves(level) {
  return level.waves || [];
}

export function levelStartingMana(level) {
  return level.startingMana ?? 150;
}

export function levelMaxHearts(level) {
  return level.maxHearts ?? 5;
}
