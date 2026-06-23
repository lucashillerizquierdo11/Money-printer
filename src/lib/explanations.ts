/**
 * Transparent explanation builder for the probability/value engine
 * (src/lib/probability.ts + src/lib/value.ts).
 *
 * Distinct from src/lib/explain.ts, which renders the match-detail page's
 * existing (enum-based) Recommendation shape. This module works off the
 * normalized, numeric MarketEvaluation-style output instead, so every figure
 * shown to the user traces back to a stated reason — including, explicitly,
 * why a market that LOOKS safe got marked "Avoid".
 */

import type { MarketRecommendation } from "@/types/schema";

export interface MarketEvaluationSummary {
  marketLabel: string;
  estimatedProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  riskScore: number; // 0..100
  dataConfidence: number; // 0..1
  recommendation: MarketRecommendation;
  rationale: string[];
  warnings?: string[];
}

const RECOMMENDATION_HEADLINES: Record<MarketRecommendation, string> = {
  strong_candidate: "Strong candidate",
  consider: "Consider",
  watch: "Watch",
  avoid: "Avoid",
};

/** Full plain-English explanation for one market evaluation. */
export function buildMarketExplanation(e: MarketEvaluationSummary): string {
  const headline = RECOMMENDATION_HEADLINES[e.recommendation];
  const sentences: string[] = [];

  sentences.push(
    `${e.marketLabel}: ${headline} — estimated probability ${pct(e.estimatedProbability)} vs a bookmaker-implied ${pct(e.impliedProbability)}, an edge of ${signedPct(e.edge)} and an expected value of ${signedPct(e.expectedValue)} per unit staked.`,
  );

  if (e.rationale.length > 0) {
    sentences.push(`Reasoning: ${e.rationale.join("; ")}.`);
  }

  const avoidReason = explainAvoidReason(e);
  if (avoidReason) sentences.push(avoidReason);

  if (e.warnings && e.warnings.length > 0) {
    sentences.push(`Notes: ${e.warnings.join("; ")}.`);
  }

  sentences.push(`Risk score ${e.riskScore}/100, data confidence ${pct(e.dataConfidence)}.`);

  return sentences.join(" ");
}

/**
 * Surfaces the specific reason a market is marked "Avoid" — including the
 * case the product spec calls out explicitly: a market with a high
 * estimated probability that LOOKS safe, but is priced with no real edge,
 * so the headline probability alone is misleading.
 */
export function explainAvoidReason(e: MarketEvaluationSummary): string | undefined {
  if (e.recommendation !== "avoid") return undefined;

  if (e.edge <= 0 && e.estimatedProbability >= 0.75) {
    return `Avoid: this looks safe at ${pct(e.estimatedProbability)} estimated probability, but the bookmaker has already priced that in (implied ${pct(e.impliedProbability)}) — there is no real edge, so it does not pay to back it.`;
  }
  if (e.edge <= 0) {
    return "Avoid: estimated probability does not beat the bookmaker's implied probability.";
  }
  return "Avoid: a risk gate failed — lineup uncertainty, the player not being a likely starter, or odds priced too low for the risk taken.";
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function signedPct(v: number): string {
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s}%` : `${s}%`;
}
