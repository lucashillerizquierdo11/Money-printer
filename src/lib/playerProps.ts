/**
 * Player-prop recommendation builder.
 *
 * Per the product spec, "player over 0.5 goals" is only ever a candidate when
 * a BOOSTED odds quote exists — un-boosted player-goal markets are filtered
 * out entirely rather than shown as weak candidates. "Star player shot on
 * target" is an optional placeholder and is shown for context only (never
 * ranked as a streak candidate).
 */

import type { PlayerPropOdds, Recommendation, WorldCupPlayer } from "@/types";
import { MARKETS } from "./markets";
import { edgeOf, hasEdge, riskRatingOf, streakSuitabilityOf, trapWarningOf, valueScoreOf } from "./value";

function fairGoalProbability(player: WorldCupPlayer): number {
  return Math.min(0.95, Math.max(0.05, 1 - Math.exp(-player.avgGoalsPerMatch)));
}

/**
 * Build a recommendation for a boosted player-goal quote. Returns null when
 * the quote isn't boosted (per spec, those never surface as candidates).
 */
export function buildPlayerGoalRecommendation(
  player: WorldCupPlayer,
  quote: PlayerPropOdds,
): Recommendation | null {
  if (!quote.isBoosted || quote.marketKey !== "player_over_0_5_goals") return null;

  const probability = fairGoalProbability(player);
  const edge = edgeOf(probability, quote.odds);
  const confidence = "medium" as const; // player-level mock data is thinner than team data
  const risk = riskRatingOf(probability, edge);
  const valueScore = valueScoreOf({
    estimatedProbability: probability,
    edge,
    riskLevel: risk,
    dataConfidence: confidence,
    odds: quote.odds,
  });
  const trapWarning = trapWarningOf({ odds: quote.odds, edge, dataConfidence: confidence });
  const streakSuitability = streakSuitabilityOf({
    estimatedProbability: probability,
    edge,
    dataConfidence: confidence,
    valueScore,
  });

  const rationale = [
    `${player.name} averages ${player.avgGoalsPerMatch.toFixed(2)} goals per international appearance.`,
    "Boosted bookmaker price — only shown because this player-goal market has a boost applied.",
  ];
  if (!hasEdge(probability, quote.impliedProbability)) {
    rationale.push(
      "Even boosted, the estimated probability does not beat the bookmaker's implied probability.",
    );
  }

  return {
    matchId: quote.matchId,
    marketKey: "player_over_0_5_goals",
    marketLabel: `${MARKETS.player_over_0_5_goals.label} — ${player.name}`,
    selection: player.id,
    estimatedProbability: round3(probability),
    odds: quote.odds,
    bookmaker: quote.bookmaker,
    impliedProbability: quote.impliedProbability,
    edge: round3(edge),
    valueScore,
    riskLevel: risk,
    dataConfidence: confidence,
    streakSuitability,
    trapWarning,
    rationale,
    isBoosted: true,
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
