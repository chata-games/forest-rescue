/**
 * Why can't this defender go on this ring right now? Returns null when the
 * plant is legal. Pure, so the game UI, the unit tests and the e2e scripted
 * checks all agree on the wording of every rejection (RP-k55mkt: rejected
 * actions must say why instead of failing silently).
 *
 * @param {null | {placement?: string}} ring
 * @param {null | {placement?: string, cost?: number}} def
 * @param {{mana: number, occupied: boolean, ringBurning: boolean}} ctx
 * @returns {null | string} the rejection reason, or null when plantable
 */
export function plantRejectionReason(ring, def, { mana, occupied, ringBurning }) {
  if (!ring || !def) return "Tap a fairy ring to plant";
  if (def.placement === "on-path" && ring.placement !== "on-path") return "Needs an open-path ring";
  if (def.placement !== "on-path" && ring.placement === "on-path") return "Needs a beside-path ring";
  if (ringBurning) return "Ring is burning";
  if (occupied) return "Ring occupied";
  if (mana < (def.cost || 0)) return "Not enough mana";
  return null;
}
