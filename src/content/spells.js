export const SPELLS = {
  "root-snare": {
    id: "root-snare",
    name: "Root Snare",
    cost: 45,
    cooldown: 25,
    radius: 140,
    rootDuration: 3.5,
    color: "#6ad45a",
  },
};

export function getSpell(id) {
  return SPELLS[id] || null;
}

export function levelSpellUnlock(level) {
  return level.spellUnlock || null;
}
