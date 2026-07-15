// Engine-independent light + darkness rules (issue #36: Mushroom Hollow).
//
// A darkness level hides the battlefield: ranged Defenders can only strike an
// enemy that stands in light, and a cloaked Poacher is only visible while lit.
// Light comes from three programmatically placed sources — every fairy ring, a
// glow-mushroom landmark, and a planted Firefly Beacon — so where the Guardian
// places a Beacon is the central defensive decision. The Beacon also emboldens
// nearby allies with extra reach and punch.
//
// Nothing here depends on Phaser, the DOM, or any renderer: it is the pure
// boundary the BattleState and its vitest suite drive, mirroring the light rules
// the legacy engine uses (src/level/light.js) so the simulation stays faithful.

import type { CompiledLevel } from './types';

/** Glow radii, in world units, shared by the domain and the renderer. */
export const GLOW = {
  /** A fairy ring sheds this much light around its build spot. */
  ring: 95,
  /** A glow-mushroom-cluster landmark sheds this much light. */
  mushroom: 150,
  /** A Firefly Beacon emboldens Defenders within this radius. */
  beaconBuff: 180,
  /** How much a Beacon's embolden multiplies a Defender's range and damage. */
  beaconBuffRangeMul: 1.2,
  beaconBuffDamageMul: 1.2,
} as const;

/** One point of light on the battlefield. */
export interface GlowSource {
  x: number;
  y: number;
  r: number;
  kind: 'ring' | 'mushroom' | 'beacon';
}

/** A planted Firefly Beacon as the glow rules see it: position + glow radius. */
export interface BeaconGlow {
  x: number;
  y: number;
  glowRadius: number;
}

/** Whether a level is shrouded in darkness (the Mushroom Hollow modifier). */
export function hasDarkness(level: Pick<CompiledLevel, 'levelModifiers'>): boolean {
  return (level.levelModifiers ?? []).includes('darkness');
}

/**
 * Every light source on the battlefield: each fairy ring, each glow-mushroom
 * landmark, and each living Firefly Beacon the caller passes in. The renderer
 * lifts the dark mask at these points; the BattleState uses them to decide what
 * a Defender can strike.
 */
export function glowSources(
  level: Pick<CompiledLevel, 'rings' | 'landmarks'>,
  beacons: ReadonlyArray<BeaconGlow> = [],
): GlowSource[] {
  const sources: GlowSource[] = [];
  for (const ring of level.rings ?? []) {
    sources.push({ x: ring.x, y: ring.y, r: GLOW.ring, kind: 'ring' });
  }
  for (const landmark of level.landmarks ?? []) {
    if (landmark.type === 'glow-mushroom-cluster') {
      sources.push({ x: landmark.x, y: landmark.y, r: GLOW.mushroom, kind: 'mushroom' });
    }
  }
  for (const beacon of beacons) {
    sources.push({ x: beacon.x, y: beacon.y, r: beacon.glowRadius, kind: 'beacon' });
  }
  return sources;
}

/** Whether a point is lit by at least one glow source. */
export function inGlow(x: number, y: number, sources: ReadonlyArray<GlowSource>): boolean {
  for (const s of sources) {
    if (Math.hypot(x - s.x, y - s.y) <= s.r) return true;
  }
  return false;
}

/** The Firefly Beacon's embolden multipliers for a Defender (1 when out of range). */
export interface BeaconBuff {
  rangeMul: number;
  damageMul: number;
}

/**
 * The embolden a Defender receives from nearby Firefly Beacons (src fireflyBuff):
 * within {@link GLOW.beaconBuff} of any Beacon it gains +20% range and damage.
 * The multipliers stay 1 when no Beacon is in range, so a non-dark level — or a
 * Defender standing alone — is unaffected.
 */
export function fireflyBuff(
  defender: { x: number; y: number },
  beacons: ReadonlyArray<{ x: number; y: number }>,
): BeaconBuff {
  for (const beacon of beacons) {
    if (Math.hypot(beacon.x - defender.x, beacon.y - defender.y) <= GLOW.beaconBuff) {
      return { rangeMul: GLOW.beaconBuffRangeMul, damageMul: GLOW.beaconBuffDamageMul };
    }
  }
  return { rangeMul: 1, damageMul: 1 };
}
