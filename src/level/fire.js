export const FIRE = {
  adjacencyDist: 210,
  propagateInterval: 2.5,
  defenderBurnDps: 9,
  igniteRadius: 95,
  douseImmunity: 5,
};

export function hasFireSpread(level) {
  return (level.levelModifiers || []).includes("fire-spread");
}

export function ringAdjacency(rings, maxDist = FIRE.adjacencyDist) {
  const adj = new Map();
  for (const ring of rings) adj.set(ring.id, []);
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const d = Math.hypot(rings[i].x - rings[j].x, rings[i].y - rings[j].y);
      if (d <= maxDist) {
        adj.get(rings[i].id).push(rings[j].id);
        adj.get(rings[j].id).push(rings[i].id);
      }
    }
  }
  return adj;
}

export function createFireState(rings) {
  return {
    burning: new Set(),
    dousedUntil: new Map(),
    propagateTimer: FIRE.propagateInterval * 0.5,
    adjacency: ringAdjacency(rings),
    ringMap: new Map(rings.map((r) => [r.id, r])),
  };
}

export function isRingBurning(ringId, fireState) {
  if (!fireState) return false;
  const until = fireState.dousedUntil.get(ringId) || 0;
  if (until > 0) return false;
  return fireState.burning.has(ringId);
}

export function canPlantOnRing(ringId, fireState) {
  return !isRingBurning(ringId, fireState);
}

export function igniteRing(ringId, fireState, now = 0) {
  if (!fireState) return;
  const until = fireState.dousedUntil.get(ringId) || 0;
  if (until > now) return;
  fireState.burning.add(ringId);
}

export function douseRing(ringId, fireState, now = 0, immunity = FIRE.douseImmunity) {
  if (!fireState) return;
  fireState.burning.delete(ringId);
  fireState.dousedUntil.set(ringId, now + immunity);
}

export function douseArea(x, y, radius, rings, fireState, now = 0) {
  if (!fireState) return 0;
  let count = 0;
  for (const ring of rings) {
    if (Math.hypot(ring.x - x, ring.y - y) <= radius) {
      douseRing(ring.id, fireState, now);
      count += 1;
    }
  }
  return count;
}

export function douseNeighbors(ringId, fireState, now = 0) {
  if (!fireState) return;
  douseRing(ringId, fireState, now);
  for (const nid of fireState.adjacency.get(ringId) || []) {
    douseRing(nid, fireState, now);
  }
}

export function tickFire(dt, fireState, now) {
  if (!fireState) return;
  for (const [ringId, until] of fireState.dousedUntil) {
    if (until <= now) fireState.dousedUntil.delete(ringId);
  }
  fireState.propagateTimer -= dt;
  if (fireState.propagateTimer > 0) return;
  fireState.propagateTimer = FIRE.propagateInterval;
  const next = new Set(fireState.burning);
  for (const ringId of fireState.burning) {
    const until = fireState.dousedUntil.get(ringId) || 0;
    if (until > now) continue;
    for (const nid of fireState.adjacency.get(ringId) || []) {
      const nUntil = fireState.dousedUntil.get(nid) || 0;
      if (nUntil <= now) next.add(nid);
    }
  }
  fireState.burning = next;
}

export function smokeRangeMul(defender, enemies) {
  let mul = 1;
  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const aura = enemy.stats?.smokeAura;
    if (!aura) continue;
    if (Math.hypot(enemy.x - defender.x, enemy.y - defender.y) <= aura.radius) {
      mul = Math.min(mul, 1 - (aura.rangeReduction || 0));
    }
  }
  return mul;
}

export function nearestRing(x, y, rings, maxDist = FIRE.igniteRadius) {
  let best = null;
  let bestD = maxDist;
  for (const ring of rings) {
    const d = Math.hypot(ring.x - x, ring.y - y);
    if (d < bestD) { bestD = d; best = ring; }
  }
  return best;
}
