/**
 * Value scoring + streak-suitability + trap detection.
 *
 * A bet is only a candidate at all if estimatedProbability > impliedProbability
 * (positive market edge) — see `hasEdge`. Everything else here ranks and labels
 * candidates for a streak/compounding strategy without ever calling anything
 * "safe" in isolation or "guaranteed".
 */

import type { DataConfidence, RecommendationLabel, RiskLevel, StreakSuitability } from "@/types";

/** Core rule: a bet is only a candidate if true probability beats the book. */
export function hasEdge(estimatedProbability: number, impliedProbability: number): boolean {
  return estimatedProbability > impliedProbability;
}

export function impliedProbability(decimalOdds: number): number {
  return 1 / decimalOdds;
}

export function edgeOf(estimatedProbability: number, decimalOdds: number): number {
  return estimatedProbability - impliedProbability(decimalOdds);
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
