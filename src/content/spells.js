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
  "cleansing-rain": {
    id: "cleansing-rain",
    name: "Cleansing Rain",
    cost: 50,
    cooldown: 22,
    radius: 160,
    douseImmunity: 8,
    color: "#6ab8ff",
  },
};

export function getSpell(id) {
  return SPELLS[id] || null;
}

export function levelSpellUnlock(level) {
  return level.spellUnlock || null;
}
