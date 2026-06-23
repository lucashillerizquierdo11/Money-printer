/**
 * Streak/compounding math.
 *
 * For streak mode: combinedStreakProbability = product of each selected leg's
 * estimated probability. This is the chance the WHOLE streak survives —
 * a single loss on any leg resets progress. We surface that explicitly rather
 * than only showing the (much more exciting-looking) payout multiplier.
 */

import type { StreakLeg, StreakSummary } from "@/types";

/** product of leg probabilities — chance every leg in the streak wins. */
export function combinedStreakProbability(legs: { estimatedProbability: number }[]): number {
  return legs.reduce((acc, leg) => acc * leg.estimatedProbability, 1);
}

/** product of leg decimal odds — the payout multiplier if every leg wins. */
export function combinedStreakOdds(legs: { odds: number }[]): number {
  return legs.reduce((acc, leg) => acc * leg.odds, 1);
}

/**
 * Build a full streak summary from selected legs + a starting bankroll.
 * Always frames the result around survival probability and the bankroll
 * reset on a single loss — never as a promised return.
 */
export function buildStreakSummary(
  legs: StreakLeg[],
  startingBankroll: number,
): StreakSummary {
  const combinedSurvivalProbability = combinedStreakProbability(legs);
  const combinedOdds = combinedStreakOdds(legs);
  const projectedPayout = startingBankroll * combinedOdds;

  const highRiskLegs = legs.filter((l) => l.riskLevel === "high").length;
  const lowConfidenceLegs = legs.filter((l) => l.dataConfidence === "low").length;
  const lowerRiskAlternativeSuggested =
    legs.length >= 5 || combinedSurvivalProbability < 0.3 || highRiskLegs > 0;

  const notes: string[] = [
    `Estimated chance the full ${legs.length}-leg streak survives: ${pct(combinedSurvivalProbability)}.`,
    `One loss on any leg resets this streak — there is no partial credit for a failed combination.`,
  ];
  if (highRiskLegs > 0) {
    notes.push(
      `${highRiskLegs} leg${highRiskLegs > 1 ? "s" : ""} carry a high risk rating — each one materially lowers survival probability.`,
    );
  }
  if (lowConfidenceLegs > 0) {
    notes.push(
      `${lowConfidenceLegs} leg${lowConfidenceLegs > 1 ? "s" : ""} have low data confidence — treat the survival estimate as less reliable.`,
    );
  }
  if (lowerRiskAlternativeSuggested) {
    notes.push(
      "Consider a lower-risk staking strategy: cashing out partial winnings or flat-staking each leg separately instead of rolling the full balance forward would reduce the chance of losing everything in one go.",
    );
  }

  return {
    legs,
    combinedSurvivalProbability,
    combinedOdds,
    startingBankroll,
    projectedPayout,
    lowerRiskAlternativeSuggested,
    notes,
  };
}

/** Suggests a streak length where survival probability stays above a floor. */
export function suggestedStreakLength(
  perLegProbability: number,
  survivalFloor = 0.3,
): number {
  if (perLegProbability <= 0 || perLegProbability >= 1) return 0;
  // n such that p^n >= floor  =>  n <= log(floor) / log(p)
  const n = Math.log(survivalFloor) / Math.log(perLegProbability);
  return Math.max(1, Math.floor(n));
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Kelly-fraction stake size as a share of bankroll: f* = (bp - q) / b, where
 * b = decimalOdds - 1, p = estimated probability, q = 1 - p. Clamped to
 * [0, 1] — negative Kelly means the bet has no edge and should get 0 stake.
 */
export function kellyFraction(estimatedProbability: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const q = 1 - estimatedProbability;
  const f = (b * estimatedProbability - q) / b;
  return Math.max(0, Math.min(1, f));
}

/** Multiplier the bankroll needs to grow by to reach the target. */
export function requiredMultiplier(startingBankroll: number, targetBankroll: number): number {
  if (startingBankroll <= 0) return Infinity;
  return targetBankroll / startingBankroll;
}

/**
 * Greedily counts how many legs (from odds sorted best-value-first) are
 * needed before the cumulative odds product reaches the required multiplier,
 * capped at maxLegs. Returns maxLegs if the target isn't reached in time.
 */
export function legsNeededForTarget(
  legOdds: number[],
  required: number,
  maxLegs: number,
): number {
  let product = 1;
  for (let i = 0; i < Math.min(legOdds.length, maxLegs); i++) {
    product *= legOdds[i];
    if (product >= required) return i + 1;
  }
  return Math.min(legOdds.length, maxLegs);
}
