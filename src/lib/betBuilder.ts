/**
 * Bet-builder combination calculator (single match, multiple legs).
 *
 * The app only ever calculates a bet builder when it can show BOTH the naive
 * combined probability AND the hidden risk from correlated legs — never a
 * bare multiplier that hides how much riskier combos get as legs are added.
 */

import type { BetBuilderLeg, BetBuilderSummary, MarketCategory, Recommendation } from "@/types";

const CORRELATED_CATEGORIES: MarketCategory[] = ["goals", "team_goals", "result"];

export function buildBetBuilderSummary(
  matchId: string,
  selectedRecs: Recommendation[],
): BetBuilderSummary {
  const legs: BetBuilderLeg[] = selectedRecs.map((r) => ({
    marketKey: r.marketKey,
    marketLabel: r.marketLabel,
    selection: r.selection,
    estimatedProbability: r.estimatedProbability,
    odds: r.odds,
  }));

  const naiveCombinedProbability = legs.reduce(
    (acc, leg) => acc * leg.estimatedProbability,
    1,
  );
  const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1);
  const combinedImpliedProbability = 1 / combinedOdds;
  const edge = naiveCombinedProbability - combinedImpliedProbability;

  const hiddenRisk: string[] = [
    "The combined probability below multiplies each leg as if independent — real matches correlate goals, team-to-score and result markets, so the true joint probability is usually LOWER than this naive figure.",
  ];
  if (legs.length >= 3) {
    hiddenRisk.push(
      `${legs.length} legs compounds that correlation risk further — each extra leg makes the naive estimate increasingly optimistic.`,
    );
  }
  const correlatedCount = countLikelyCorrelated(selectedRecs);
  if (correlatedCount >= 2) {
    hiddenRisk.push(
      `${correlatedCount} of your selected legs are goal/result-driven and likely to move together (e.g. a high-scoring match also tends to hit team-to-score and double-chance legs) — treat this combo as riskier than the raw multiplication suggests.`,
    );
  }

  return {
    matchId,
    legs,
    naiveCombinedProbability,
    combinedOdds,
    combinedImpliedProbability,
    edge,
    hiddenRisk,
  };
}

function countLikelyCorrelated(recs: Recommendation[]): number {
  // Crude correlation heuristic for the MVP: count legs from "moves together"
  // categories. A real implementation would use historical co-occurrence data.
  const categories = recs.map((r) => categoryOf(r.marketKey));
  return categories.filter((c) => CORRELATED_CATEGORIES.includes(c)).length;
}

function categoryOf(marketKey: string): MarketCategory {
  if (marketKey.includes("goal")) return "goals";
  if (marketKey.includes("corner")) return "corners";
  if (marketKey.includes("card")) return "cards";
  if (marketKey === "favorite_team_over_0_5") return "team_goals";
  if (marketKey.startsWith("player")) return "player_props";
  return "result";
}
