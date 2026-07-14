export const GLOW = {
  ring: 95,
  firefly: 210,
  mushroom: 150,
  beaconBuff: 180,
};

export function glowSources(level, defenders = []) {
  const sources = [];
  for (const ring of level.rings || []) {
    sources.push({ x: ring.x, y: ring.y, r: GLOW.ring, kind: "ring" });
  }
  for (const lm of level.landmarks || []) {
    if (lm.type === "glow-mushroom-cluster") {
      sources.push({ x: lm.x, y: lm.y, r: GLOW.mushroom, kind: "mushroom" });
    }
  }
  for (const d of defenders) {
    if (d.dead) continue;
    const r = d.stats?.glowRadius;
    if (r) sources.push({ x: d.x, y: d.y, r, kind: "beacon" });
  }
  return sources;
}

export function inGlow(x, y, sources) {
  for (const s of sources) {
    if (Math.hypot(x - s.x, y - s.y) <= s.r) return true;
  }
  return false;
}

export function hasDarkness(level) {
  return (level.levelModifiers || []).includes("darkness");
}

export function canTargetEnemy(defender, enemy, level, defenders) {
  if (!hasDarkness(level)) return true;
  const sources = glowSources(level, defenders);
  if (!inGlow(enemy.x, enemy.y, sources)) return false;
  if (enemy.stats?.cloaked && !inGlow(enemy.x, enemy.y, sources)) return false;
  return true;
}

export function fireflyBuff(defender, defenders) {
  let rangeMul = 1;
  let damageMul = 1;
  for (const d of defenders) {
    if (d.dead || d.typeId !== "firefly-beacon") continue;
    if (Math.hypot(d.x - defender.x, d.y - defender.y) <= GLOW.beaconBuff) {
      rangeMul = 1.2;
      damageMul = 1.2;
      break;
    }
  }
  return { rangeMul, damageMul };
}
