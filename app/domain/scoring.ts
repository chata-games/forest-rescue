// Engine-independent star-scoring rule for a completed battle (issue #29 AC2).
//
// The combined 1–3 star result fuses three independent dimensions of how well a
// level was defended, with Hearts remaining dominant:
//   - Hearts remaining  — defense quality (did the forest survive intact?).
//   - Resources collected — economy engagement (Mana bounty gathered from foes).
//   - Mana spent         — efficiency (conserving the budget is rewarded).
//
// Each dimension is normalized to a 0..1 factor; a weighted sum yields a 0..1
// quality score mapped to star tiers. A victory always earns at least 1 star; a
// defeat (or an unfinished battle) earns 0. Nothing here depends on Phaser, the
// DOM, or any renderer — it is the engine-independent rule the application seam
// (recordResult) and its tests drive, mirroring the BattleState contract.

import { markCleared, type CampaignProgress } from './campaign';

/** The inputs to a single battle's star evaluation. */
export interface BattleScoreInput {
  outcome: 'victory' | 'defeat' | null;
  hearts: number;
  maxHearts: number;
  /** Net Mana committed to Defender placements (full undo refunds reversed). */
  manaSpent: number;
  /** Mana bounty gathered from defeated enemies over the battle. */
  resourcesCollected: number;
  /** Total Mana bounty every spawned enemy could have yielded. */
  totalBounty: number;
  /** The level's starting Mana budget. */
  startingMana: number;
}

// Hearts dominate: a clean defense is the core goal; economy and efficiency are
// refinements that separate a good clear from a great one.
const HEARTS_WEIGHT = 0.6;
const ECONOMY_WEIGHT = 0.2;
const EFFICIENCY_WEIGHT = 0.2;

// Quality thresholds for the three star tiers.
const THREE_STAR_AT = 0.8;
const TWO_STAR_AT = 0.5;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Hearts-remaining factor: the share of the forest preserved (0..1). */
function heartsFactor(input: BattleScoreInput): number {
  return input.maxHearts > 0 ? clamp01(input.hearts / input.maxHearts) : 0;
}

/** Economy factor: the share of available bounty actually collected (0..1). */
function economyFactor(input: BattleScoreInput): number {
  return input.totalBounty > 0 ? clamp01(input.resourcesCollected / input.totalBounty) : 1;
}

/** Efficiency factor: the share of the total budget NOT spent (0..1). */
function efficiencyFactor(input: BattleScoreInput): number {
  const budget = input.startingMana + input.totalBounty;
  return budget > 0 ? clamp01(1 - input.manaSpent / budget) : 1;
}

/**
 * Continuous 0..1 quality score combining all three factors. Exposed so the rule
 * can be tested at finer granularity than the coarse 1–3 star tiers.
 */
export function scoreQuality(input: BattleScoreInput): number {
  return (
    HEARTS_WEIGHT * heartsFactor(input) +
    ECONOMY_WEIGHT * economyFactor(input) +
    EFFICIENCY_WEIGHT * efficiencyFactor(input)
  );
}

/**
 * The combined 1–3 star result for a battle. A victory maps the quality score to
 * a tier (always at least 1 star); a defeat or unfinished battle scores 0.
 */
export function scoreStars(input: BattleScoreInput): number {
  if (input.outcome !== 'victory') return 0;
  const quality = scoreQuality(input);
  if (quality >= THREE_STAR_AT) return 3;
  if (quality >= TWO_STAR_AT) return 2;
  return 1;
}

/**
 * The application-boundary seam: record a battle result into campaign progress.
 * A loss advances nothing (the level is neither cleared nor starred); a victory
 * is cleared, preserving the best star result across replays. Returns a new
 * progress object (the input is not mutated).
 */
export function recordResult(
  progress: CampaignProgress,
  levelId: string,
  input: BattleScoreInput,
): CampaignProgress {
  if (input.outcome !== 'victory') return progress;
  return markCleared(progress, levelId, scoreStars(input));
}
