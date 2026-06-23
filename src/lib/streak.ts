/**
 * Streak/compounding math.
 *
 * For streak mode: combinedStreakProbability = product of each selected leg's
 * estimated probability. This is the chance the WHOLE streak survives —
 * a single loss on any leg resets progress. We surface that explicitly rather
 * than only showing the (much more exciting-looking) payout multiplier.
 */

import type { DataConfidence, Recommendation, RiskLevel, StreakLeg, StreakSummary } from "@/types";
import { expectedValue } from "./probability";

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

// ---------------------------------------------------------------------------
// All-in compounding: explicitly supported, always shown with the high-risk
// warning the product spec requires.
// ---------------------------------------------------------------------------

export const ALL_IN_RISK_WARNING =
  "All-in compounding (staking the whole bankroll on every leg) is fully supported, but is high risk: a single loss resets the bankroll to 0.";

export interface StreakRequirement {
  /** finalBankroll = startingBankroll * product(decimalOdds of selected bets). */
  requiredMultiplier: number;
  /** n = log(requiredMultiplier) / log(averageOdds), rounded up to a whole win. */
  winsRequired: number;
  afterOneLoss: string;
}

/**
 * Bundles the four things the spec asks to always show for a streak plan:
 * required multiplier, wins required at a flat average-odds rate, and what
 * happens after one loss. Matches the worked example: 100 kr -> 10,000 kr
 * target (100x) at 1.20 average odds needs ⌈log(100)/log(1.20)⌉ = 26 wins.
 */
export function streakRequirement(
  startingBankroll: number,
  targetBankroll: number,
  averageOdds: number,
): StreakRequirement {
  const required = requiredMultiplier(startingBankroll, targetBankroll);
  const winsRequired =
    averageOdds > 1 ? Math.ceil(Math.log(required) / Math.log(averageOdds)) : Infinity;
  return {
    requiredMultiplier: required,
    winsRequired,
    afterOneLoss:
      "A single loss on any leg resets the bankroll to 0 kr under all-in staking — there is no partial credit for a streak that breaks partway through.",
  };
}

// ---------------------------------------------------------------------------
// Streak optimizer
//
// Given every evaluated market across upcoming matches, find candidate
// streak paths. Always works from positive-edge legs only, one leg per
// match (correlated legs from the same match are never stacked — bet-builder
// combos with unknown correlation never enter this pipeline at all, since it
// only accepts single-market Recommendation legs), excludes low
// data-confidence player props, and excludes odds too low to justify the
// risk of adding a leg at all.
// ---------------------------------------------------------------------------

export type StreakStrategy = "conservative" | "balanced" | "aggressive";

export interface StreakPlanLeg {
  matchId: string;
  marketLabel: string;
  selection?: string;
  estimatedProbability: number;
  odds: number;
  edge: number;
  expectedValue: number;
  riskLevel: RiskLevel;
  dataConfidence: DataConfidence;
  isBoosted?: boolean;
}

export interface StreakPlan {
  strategy: StreakStrategy;
  label: string;
  legs: StreakPlanLeg[];
  combinedOdds: number;
  combinedProbability: number;
  expectedFinalBankroll: number;
  requiredMultiplier: number;
  targetReached: boolean;
  biggestRisk: string;
  rationale: string;
}

export interface StreakOptimizerResult {
  plans: StreakPlan[];
  hasPositiveEdgePath: boolean;
  /** Set when no positive-edge path exists at all — show this instead of any plan. */
  message?: string;
}

const MAX_OPTIMIZER_LEGS = 40;
/** Odds at or below this add negligible streak value even at high probability. */
const MIN_ODDS_TO_JUSTIFY_RISK = 1.02;
/** Aggressive plan still needs a probability floor — chasing EV alone invites traps. */
const AGGRESSIVE_PROBABILITY_FLOOR = 0.5;

/** Negative-edge markets, odds too thin to matter, and low-confidence player props never enter the optimizer. */
function isEligibleLeg(r: Recommendation): boolean {
  if (r.edge <= 0) return false;
  if (r.odds <= MIN_ODDS_TO_JUSTIFY_RISK) return false;
  if (r.marketKey.startsWith("player_") && r.dataConfidence === "low") return false;
  return true;
}

/** One leg per match — picks the highest-ranked leg per match, then sorts matches best-first. */
function bestPerMatch(recs: Recommendation[], rank: (r: Recommendation) => number): Recommendation[] {
  const best = new Map<string, Recommendation>();
  for (const r of recs) {
    const existing = best.get(r.matchId);
    if (!existing || rank(r) > rank(existing)) best.set(r.matchId, r);
  }
  return [...best.values()].sort((a, b) => rank(b) - rank(a));
}

function toPlanLeg(r: Recommendation): StreakPlanLeg {
  return {
    matchId: r.matchId,
    marketLabel: r.marketLabel,
    selection: r.selection,
    estimatedProbability: r.estimatedProbability,
    odds: r.odds,
    edge: r.edge,
    expectedValue: expectedValue(r.odds, r.estimatedProbability),
    riskLevel: r.riskLevel,
    dataConfidence: r.dataConfidence,
    isBoosted: r.isBoosted,
  };
}

function describeBiggestRisk(legs: StreakPlanLeg[]): string {
  if (legs.length === 0) return "No eligible legs were available for this plan.";
  const weakest = [...legs].sort((a, b) => a.estimatedProbability - b.estimatedProbability)[0];
  const highRiskCount = legs.filter((l) => l.riskLevel === "high").length;
  const lowConfidenceCount = legs.filter((l) => l.dataConfidence === "low").length;

  const parts = [
    `Weakest leg is ${weakest.marketLabel} at ${(weakest.estimatedProbability * 100).toFixed(0)}% estimated probability — the leg most likely to break this streak.`,
  ];
  if (highRiskCount > 0) {
    parts.push(`${highRiskCount} leg${highRiskCount > 1 ? "s" : ""} carry a high risk rating.`);
  }
  if (lowConfidenceCount > 0) {
    parts.push(`${lowConfidenceCount} leg${lowConfidenceCount > 1 ? "s" : ""} have low data confidence.`);
  }
  parts.push("A single loss on any leg resets the entire streak under all-in staking.");
  return parts.join(" ");
}

function buildPlan(
  strategy: StreakStrategy,
  label: string,
  ranked: Recommendation[],
  startingBankroll: number,
  targetBankroll: number,
  rationale: string,
): StreakPlan {
  const required = requiredMultiplier(startingBankroll, targetBankroll);
  const legs: StreakPlanLeg[] = [];
  let combinedOdds = 1;
  for (const r of ranked) {
    if (legs.length >= MAX_OPTIMIZER_LEGS) break;
    legs.push(toPlanLeg(r));
    combinedOdds *= r.odds;
    if (combinedOdds >= required) break;
  }
  const combinedProbability = legs.reduce((acc, l) => acc * l.estimatedProbability, 1);
  const expectedFinalBankroll = startingBankroll * combinedOdds;

  return {
    strategy,
    label,
    legs,
    combinedOdds,
    combinedProbability,
    expectedFinalBankroll,
    requiredMultiplier: required,
    targetReached: expectedFinalBankroll >= targetBankroll,
    biggestRisk: describeBiggestRisk(legs),
    rationale,
  };
}

/**
 * Builds three candidate streak plans from every evaluated market:
 *  - Conservative: highest-probability positive-edge legs first. Lower
 *    variance, but still a one-loss failure like any streak.
 *  - Balanced: highest value-score legs first (blends probability, edge,
 *    risk and data confidence) — the recommended default trade-off.
 *  - Aggressive: highest expected-value positive-edge legs first, favouring
 *    boosted prices — reaches the target faster but is more volatile.
 *
 * If no positive-edge legs exist at all, returns no plans and the message
 * "If no positive-edge path exists, the correct recommendation is to wait."
 */
export function buildStreakPlans(
  recommendations: Recommendation[],
  startingBankroll: number,
  targetBankroll: number,
): StreakOptimizerResult {
  const eligible = recommendations.filter(isEligibleLeg);

  if (eligible.length === 0) {
    return {
      plans: [],
      hasPositiveEdgePath: false,
      message:
        "No positive-edge legs are currently available across upcoming matches. If no positive-edge path exists, the correct recommendation is to wait.",
    };
  }

  const safest = bestPerMatch(eligible, (r) => r.estimatedProbability);
  const balanced = bestPerMatch(eligible, (r) => r.valueScore);
  const aggressiveCandidates = eligible.filter(
    (r) => r.estimatedProbability >= AGGRESSIVE_PROBABILITY_FLOOR,
  );
  const aggressive = bestPerMatch(
    aggressiveCandidates,
    (r) => expectedValue(r.odds, r.estimatedProbability) + (r.isBoosted ? 0.05 : 0),
  );

  const plans = [
    buildPlan(
      "conservative",
      "Conservative streak",
      safest,
      startingBankroll,
      targetBankroll,
      "Highest-probability positive-edge legs, one per match — maximises the chance every leg survives, even if it needs more legs at shorter odds.",
    ),
    buildPlan(
      "balanced",
      "Balanced streak",
      balanced,
      startingBankroll,
      targetBankroll,
      "Best overall value score (blends probability, edge, risk and data confidence) — the recommended default trade-off between survival odds and payout speed.",
    ),
    buildPlan(
      "aggressive",
      "Aggressive boost/value streak",
      aggressive,
      startingBankroll,
      targetBankroll,
      aggressive.length > 0
        ? "Highest expected-value positive-edge legs, including boosted prices where available — reaches the target faster but is more volatile."
        : "No legs met the aggressive plan's probability floor — widen filters or wait rather than chasing expected value alone.",
    ),
  ];

  return { plans, hasPositiveEdgePath: true };
}
