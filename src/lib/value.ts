/**
 * Value scoring + streak-suitability + trap detection.
 *
 * A bet is only a candidate at all if estimatedProbability > impliedProbability
 * (positive market edge) — see `hasEdge`. Everything else here ranks and labels
 * candidates for a streak/compounding strategy without ever calling anything
 * "safe" in isolation or "guaranteed".
 */

import type { DataConfidence, RecommendationLabel, RiskLevel, StreakSuitability } from "@/types";
import type { MarketRecommendation } from "@/types/schema";
import { edge, expectedValue, impliedProbability } from "./probability";

export { impliedProbability, expectedValue };

/** Core rule: a bet is only a candidate if true probability beats the book. */
export function hasEdge(estimatedProbability: number, impliedProbabilityValue: number): boolean {
  return estimatedProbability > impliedProbabilityValue;
}

export function edgeOf(estimatedProbability: number, decimalOdds: number): number {
  return edge(estimatedProbability, impliedProbability(decimalOdds));
}

/**
 * Risk rating from estimated hit probability and edge. Always shown alongside
 * any value/streak language — never implied as "safe" without this.
 */
export function riskRatingOf(estimatedProbability: number, edge: number): RiskLevel {
  let level: RiskLevel =
    estimatedProbability >= 0.8 ? "low" : estimatedProbability >= 0.62 ? "medium" : "high";
  if (edge < -0.05) level = level === "low" ? "medium" : "high";
  return level;
}

const CONFIDENCE_WEIGHT: Record<DataConfidence, number> = {
  high: 1,
  medium: 0.75,
  low: 0.5,
};

/**
 * 0..100 composite value score blending the criteria the spec asks us to rank
 * by: hit probability, positive edge, low variance (via risk rating), data
 * quality, and suitability for compounding (penalising very long-odds legs
 * that blow up streak survival math).
 */
export function valueScoreOf(args: {
  estimatedProbability: number;
  edge: number;
  riskLevel: RiskLevel;
  dataConfidence: DataConfidence;
  odds: number;
}): number {
  const { estimatedProbability, edge, riskLevel, dataConfidence, odds } = args;

  const probabilityComponent = estimatedProbability * 55; // up to 55 pts
  const edgeComponent = clamp(edge * 150, -20, 20); // up to ±20 pts
  const varianceComponent = riskLevel === "low" ? 12 : riskLevel === "medium" ? 6 : 0; // up to 12 pts
  const confidenceComponent = CONFIDENCE_WEIGHT[dataConfidence] * 13; // up to 13 pts
  // Odds below ~1.10 add little streak value even at high probability — penalise.
  const oddsPenalty = odds < 1.1 ? -8 : odds < 1.2 ? -3 : 0;

  const score =
    probabilityComponent + edgeComponent + varianceComponent + confidenceComponent + oddsPenalty;
  return Math.round(clamp(score, 0, 100));
}

/**
 * Classifies streak suitability. A market is only ever a "strong candidate"
 * when it has positive edge, decent probability, and isn't a "trap": very
 * short odds (looks safe) but with little/no real edge or low confidence.
 */
export function streakSuitabilityOf(args: {
  estimatedProbability: number;
  edge: number;
  dataConfidence: DataConfidence;
  valueScore: number;
}): StreakSuitability {
  const { estimatedProbability, edge, dataConfidence, valueScore } = args;

  if (edge <= 0) return "avoid";
  if (dataConfidence === "low" && estimatedProbability < 0.75) return "avoid";
  if (valueScore >= 65 && estimatedProbability >= 0.7) return "strong_candidate";
  if (valueScore >= 40) return "consider";
  return "avoid";
}

/**
 * 4-tier general recommendation label for the Dashboard / Boost finder.
 * Adds a "watch" tier between "avoid" and "consider" for candidates with
 * positive edge that aren't yet strong enough to act on.
 */
export function recommendationLabelOf(args: {
  estimatedProbability: number;
  edge: number;
  dataConfidence: DataConfidence;
  valueScore: number;
}): RecommendationLabel {
  const { edge, dataConfidence, estimatedProbability, valueScore } = args;

  if (edge <= 0) return "avoid";
  if (dataConfidence === "low" && estimatedProbability < 0.75) return "watch";
  if (valueScore >= 65 && estimatedProbability >= 0.7) return "strong_candidate";
  if (valueScore >= 45) return "consider";
  return "watch";
}

/**
 * Detects "trap" picks: short odds that look like an easy lock but carry
 * little real edge, or where data confidence undermines the headline
 * probability. Returns a warning string to surface, or undefined if clean.
 */
export function trapWarningOf(args: {
  odds: number;
  edge: number;
  dataConfidence: DataConfidence;
}): string | undefined {
  const { odds, edge, dataConfidence } = args;
  if (odds <= 1.15 && edge < 0.02) {
    return "Low odds with little real edge — a classic 'safe-looking' trap that erodes streak value over many legs.";
  }
  if (odds <= 1.3 && dataConfidence === "low") {
    return "Short odds but low data confidence — the headline probability is less reliable than it looks.";
  }
  return undefined;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Numeric risk / value / streak-suitability scores (0..100) + recommendation
// engine, operating on the probability.ts estimators' raw numeric outputs
// (0..1 probability/edge/dataConfidence) rather than the enum-based
// RiskLevel/DataConfidence above. This is the transparent scoring layer the
// normalized MarketEvaluation model (src/types/schema.ts) is shaped for.
// ---------------------------------------------------------------------------

/** A market never below 50% estimated probability is even worth tracking. */
const MIN_PROBABILITY_FLOOR = 0.5;

export interface RiskScoreInputs {
  estimatedProbability: number; // 0..1
  dataConfidence: number; // 0..1
  /** How volatile the market itself is (corners > cards > goals, broadly). */
  marketVolatility?: "low" | "medium" | "high";
  isPlayerDependent?: boolean;
  highLineupUncertainty?: boolean;
}

/**
 * 0..100 risk score — higher means more risky. Built from the inverse of
 * estimated probability and data confidence, plus flat penalties for
 * known volatility/uncertainty sources (corners' small samples, player
 * dependence, lineup uncertainty).
 */
export function riskScoreOf(i: RiskScoreInputs): number {
  let score = (1 - i.estimatedProbability) * 60; // up to 60 pts from low probability
  score += (1 - i.dataConfidence) * 25; // up to 25 pts from low confidence
  if (i.marketVolatility === "high") score += 10;
  else if (i.marketVolatility === "medium") score += 5;
  if (i.isPlayerDependent) score += 8;
  if (i.highLineupUncertainty) score += 12;
  return Math.round(clamp(score, 0, 100));
}

export interface ValueScoreInputsV2 {
  estimatedProbability: number; // 0..1
  edge: number; // estimatedProbability - impliedProbability
  expectedValue: number; // estimatedProbability * decimalOdds - 1
  dataConfidence: number; // 0..1
  riskScore: number; // 0..100
}

/**
 * 0..100 value score — higher means more valuable. Rewards high probability,
 * positive edge and expected value, and data confidence; docks points for
 * higher risk. Distinct from `valueScoreOf` above (which works off the
 * enum-based Recommendation shape) — this one is the numeric-engine version.
 */
export function computeValueScore(i: ValueScoreInputsV2): number {
  const probabilityComponent = i.estimatedProbability * 35; // up to 35 pts
  const edgeComponent = clamp(i.edge * 200, -25, 25); // ±25 pts
  const evComponent = clamp(i.expectedValue * 60, -15, 15); // ±15 pts
  const confidenceComponent = i.dataConfidence * 15; // up to 15 pts
  const riskComponent = (100 - i.riskScore) * 0.1; // up to 10 pts
  return Math.round(
    clamp(probabilityComponent + edgeComponent + evComponent + confidenceComponent + riskComponent, 0, 100),
  );
}

export interface StreakSuitabilityScoreInputs {
  estimatedProbability: number; // 0..1
  edge: number;
  riskScore: number; // 0..100
  dataConfidence: number; // 0..1
  isPlayerDependent?: boolean;
  /** Only relevant when isPlayerDependent — an excellent boost can rescue a player-dependent leg. */
  boostValue?: number;
}

/**
 * 0..100 streak-suitability score. High only when probability is high, edge
 * is positive, variance/risk is low, data confidence is decent, and the
 * market isn't heavily player-dependent unless its boosted value is
 * excellent (boostValue >= 10 percentage points).
 */
export function streakSuitabilityScoreOf(i: StreakSuitabilityScoreInputs): number {
  if (i.edge <= 0) return 0;

  let score = clamp(i.estimatedProbability * 50, 0, 50);
  score += clamp(i.edge * 200, 0, 25);
  score += clamp((100 - i.riskScore) * 0.15, 0, 15);
  score += clamp(i.dataConfidence * 10, 0, 10);

  if (i.isPlayerDependent) {
    const boostIsExcellent = (i.boostValue ?? 0) >= 0.1;
    if (!boostIsExcellent) score *= 0.5;
  }

  return Math.round(clamp(score, 0, 100));
}

export interface RecommendationInputs {
  estimatedProbability: number; // 0..1
  edge: number;
  dataConfidence: number; // 0..1
  riskScore: number; // 0..100
  /** Odds are priced too tight to justify the risk taken (e.g. short price, thin data). */
  oddsTooLowForRisk?: boolean;
  highLineupUncertainty?: boolean;
  /** Player market where the player is not a likely starter. */
  playerNotLikelyStarting?: boolean;
  /** Set when an underlying input (form/tournament sample) is missing or too thin to trust fully. */
  dataIncomplete?: boolean;
}

/**
 * Final recommendation gate. Exact thresholds:
 *  - Strong candidate: probability >= 0.82, edge >= 0.05, confidence >= 0.65, risk <= 35
 *  - Consider:         probability >= 0.75, edge >= 0.03, confidence >= 0.55, risk <= 50
 *  - Avoid:            edge <= 0, OR probability below floor, OR lineup uncertainty,
 *                      OR player not likely starting, OR odds too low for the risk taken
 *  - Watch:            everything else (incomplete data or edge too small to act on yet)
 *
 * This is what makes a market that "looks safe" (high probability, short
 * odds) get marked Avoid when the bookmaker has already priced in that
 * probability and left no real edge.
 */
export function recommendationOf(i: RecommendationInputs): MarketRecommendation {
  if (
    i.edge <= 0 ||
    i.estimatedProbability < MIN_PROBABILITY_FLOOR ||
    i.highLineupUncertainty ||
    i.playerNotLikelyStarting ||
    i.oddsTooLowForRisk
  ) {
    return "avoid";
  }

  if (
    i.estimatedProbability >= 0.82 &&
    i.edge >= 0.05 &&
    i.dataConfidence >= 0.65 &&
    i.riskScore <= 35
  ) {
    return "strong_candidate";
  }

  if (
    i.estimatedProbability >= 0.75 &&
    i.edge >= 0.03 &&
    i.dataConfidence >= 0.55 &&
    i.riskScore <= 50
  ) {
    return "consider";
  }

  return "watch";
}
