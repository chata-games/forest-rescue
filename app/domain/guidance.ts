// Engine-independent Guidance + retry-coaching rules (issue #23).
//
// A new or younger Guardian receives optional Guidance: a player-controlled
// preference (on by default, changed independently) whose intensity fades as the
// Guardian proves they can clear levels, until it has disabled itself. Guidance
// never takes control — it never blocks an action or forces a Loadout. Its one
// concrete, on-demand expression is "How could I improve?" coaching: opt-in,
// non-blocking advice derived from a battle's observable results.
//
// Challenge mode (the other half of the v1 Standard/Guidance pair) is out of
// scope for v1 (AC2); Guidance is the sole survivor and is independently
// configurable. Nothing here depends on Phaser, the DOM, or localStorage — it is
// the pure boundary the pre-battle shell, the save module, and these tests drive,
// mirroring the Loadout and scoring contracts.

/** Maximum guidance intensity (a brand-new Guardian). Reduces toward 0. */
export const GUIDANCE_MAX = 3;
/** How much a successful completion fades guidance intensity. */
const GUIDANCE_STEP = 1;

/**
 * The Guidance preference (issue #23 AC1/AC6). Two independent concepts:
 *   - `enabled` — the Guardian's own toggle, on by default ("changed
 *     independently" of any other setting).
 *   - `level`   — the auto-fading intensity; each first-time level clear steps it
 *     down, and once it reaches 0 guidance has disabled itself ("reduces after
 *     successful completion … can eventually disable").
 * Guidance is showing while BOTH hold (see {@link guidanceActive}).
 */
export interface GuidanceState {
  enabled: boolean;
  /** 0..GUIDANCE_MAX. Persists across reload (AC6). */
  level: number;
}

/** A brand-new Guardian: opted in, full intensity. */
export function defaultGuidance(): GuidanceState {
  return { enabled: true, level: GUIDANCE_MAX };
}

/**
 * Whether Guidance is currently offered. Requires the Guardian's opt-in AND a
 * non-zero intensity — so disabling the toggle or fading out the intensity both
 * silence guidance (AC1).
 */
export function guidanceActive(state: GuidanceState): boolean {
  return state.enabled && state.level > 0;
}

/**
 * Flip the Guidance preference without touching the faded intensity (AC1: "can be
 * changed independently"). Pure — returns a new state.
 */
export function setGuidanceEnabled(state: GuidanceState, enabled: boolean): GuidanceState {
  return { ...state, enabled };
}

/**
 * Fade guidance after a successful completion (AC1: "reduces after successful
 * completion … can eventually disable"). The intensity steps down by one and
 * floors at 0, at which point {@link guidanceActive} turns false. Pure — the
 * caller decides when a completion is "successful" (a first-time level clear).
 */
export function reduceGuidance(state: GuidanceState): GuidanceState {
  return { ...state, level: clampLevel(state.level - GUIDANCE_STEP) };
}

/**
 * Reconstruct the faded guidance level for a Guardian who has already cleared
 * `clearedCount` levels — used when migrating a pre-Guidance save (issue #23
 * AC6). It is exactly the level they would have reached had guidance faded once
 * per first-time clear (clamped at 0 = graduated), so a migrating veteran is not
 * stranded at full intensity forever. `enabled` stays the default (on).
 */
export function guidanceForClearedCount(clearedCount: number): GuidanceState {
  return { enabled: true, level: clampLevel(GUIDANCE_MAX - clearedCount) };
}

/**
 * Leniently recover a Guidance preference from persisted/loaded data (AC6, and
 * the save module's safe-recovery posture). A missing or non-object value adopts
 * the default; `enabled` defaults to true unless explicitly false; a wild
 * intensity clamps into 0..GUIDANCE_MAX. Never throws.
 */
export function sanitizeGuidance(raw: unknown): GuidanceState {
  const obj = isObject(raw) ? raw : {};
  const enabled = obj.enabled === false ? false : true;
  const level =
    typeof obj.level === 'number' && Number.isFinite(obj.level)
      ? clampLevel(Math.round(obj.level))
      : GUIDANCE_MAX;
  return { enabled, level };
}

// --- "How could I improve?" coaching (AC5) ----------------------------------

/**
 * The observable battle results coaching advises from (AC5). Mirrors the scoring
 * rule's inputs (issue #29) plus the Loadout's composition, so advice stays
 * grounded in what actually happened — never in private simulation state.
 */
export interface CoachingInput {
  outcome: 'victory' | 'defeat' | null;
  /** Best star result for the run (0 on defeat). */
  stars: number;
  hearts: number;
  maxHearts: number;
  /** Net Mana committed to Defender placements. */
  manaSpent: number;
  /** Mana bounty gathered from defeated enemies. */
  resourcesCollected: number;
  /** Total Mana bounty every spawned enemy could have yielded. */
  totalBounty: number;
  /** The level's starting Mana budget. */
  startingMana: number;
  /** Whether the Loadout included a path-blocking Defender. */
  hadBlocker: boolean;
  /** Whether the Loadout included a ranged (non-blocking) Defender. */
  hadRanged: boolean;
}

/** Advice is a list of non-blocking, plain-language tips (AC5). */
export type CoachingTip = string;

/**
 * Opt-in, non-blocking advice derived purely from a battle's observable results
 * (AC5). The shell calls this only when the Guardian asks "How could I improve?";
 * the returned tips never block an action or force a choice. Prioritised:
 * Loadout gaps first, then defense, then economy/efficiency. A flawless 3-star
 * victory yields a single congratulatory note instead of nitpicks.
 */
export function coachingAdvice(input: CoachingInput): CoachingTip[] {
  const tips: CoachingTip[] = [];

  const lostHearts = Math.max(0, input.maxHearts - input.hearts);
  const budget = input.startingMana + input.totalBounty;
  const spendShare = budget > 0 ? input.manaSpent / budget : 0;
  const collectShare = input.totalBounty > 0 ? input.resourcesCollected / input.totalBounty : 1;

  if (input.outcome === 'victory' && input.stars >= 3) {
    return ['Flawless defense — nothing to improve here. Onward to the next level.'];
  }

  // Loadout composition gaps cost the most, so they lead.
  if (!input.hadRanged) {
    tips.push('Bring a ranged defender — only ranged units deal damage from beside the path.');
  }
  if (!input.hadBlocker) {
    tips.push('Bring a path blocker — it slows enemies so your ranged defenders hit them longer.');
  }

  // Defense: any damage to the Heartwood (or a outright defeat) is the headline.
  if (input.outcome === 'defeat' || lostHearts > 0) {
    tips.push('Enemies reached the Heartwood — plant defenders near the front to stop them sooner.');
  }

  // Economy/efficiency refinements, depending on how the budget was used.
  if (input.outcome !== 'victory' && spendShare < 0.4) {
    tips.push('You spent little Mana — invest in more defenders and upgrades early.');
  } else if (input.outcome === 'victory' && spendShare > 0.8) {
    tips.push('You spent most of your Mana — conserve some to raise your efficiency stars.');
  }
  if (collectShare < 0.5) {
    tips.push('Gather more Mana flowers and bounty to afford more defenders during the fight.');
  }

  return tips;
}

// --- Helpers ----------------------------------------------------------------

function clampLevel(n: number): number {
  return Math.max(0, Math.min(GUIDANCE_MAX, n));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
