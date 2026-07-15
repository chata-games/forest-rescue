/**
 * Pure campaign-resolution helpers.
 *
 * The campaign manifest (levels/campaign.json) is the single source of truth
 * for ordered stable level IDs, act membership, normalized map landmarks, and
 * unlock requirements. These functions turn that manifest into the data the
 * campaign map, level loader, and battle simulation need — without any DOM or
 * filesystem access, so they are safe to import from both the browser shell
 * and Node tooling/tests.
 */

/** Ordered list of campaign level entries (stable IDs in campaign order). */
export function campaignLevels(manifest) {
  return manifest?.levels ?? [];
}

/** Find a single level entry by stable ID, or null. */
export function levelEntry(manifest, levelId) {
  return campaignLevels(manifest).find((l) => l.id === levelId) ?? null;
}

/** Index of a level in campaign order, or -1 when absent. */
export function levelIndex(manifest, levelId) {
  return campaignLevels(manifest).findIndex((l) => l.id === levelId);
}

/** Act id for a level, or null. */
export function actOf(manifest, levelId) {
  return levelEntry(manifest, levelId)?.act ?? null;
}

/** Cumulative unlocked defenders up to and including levelId, deduped, first-seen order. */
export function cumulativeUnlocks(manifest, levelId) {
  const end = levelIndex(manifest, levelId);
  if (end < 0) return [];
  const seen = new Set();
  const out = [];
  for (const level of campaignLevels(manifest).slice(0, end + 1)) {
    for (const unlock of level.unlocks ?? []) {
      if (!seen.has(unlock)) {
        seen.add(unlock);
        out.push(unlock);
      }
    }
  }
  return out;
}

/** Most recent spell unlocked up to and including levelId, or null. */
export function cumulativeSpellUnlock(manifest, levelId) {
  const end = levelIndex(manifest, levelId);
  if (end < 0) return null;
  let spell = null;
  for (const level of campaignLevels(manifest).slice(0, end + 1)) {
    if (level.spellUnlock) spell = level.spellUnlock;
  }
  return spell;
}
