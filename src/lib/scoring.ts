/**
 * World Cup-specific scoring engine — World Cup Streak Value Finder.
 *
 * Turns team form, tournament performance, group/knockout context, motivation
 * pressure, market hit rates, bookmaker implied probability and data confidence
 * into ranked value candidates for a streak/compounding strategy.
 *
 * IMPORTANT FRAMING: this is research output, never a guarantee. We use
 * "estimated hit probability", "value score", "streak suitability", "risk
 * rating", "market edge" and avoid/consider/strong-candidate language. A bet
 * is only ever a candidate when estimatedProbability > impliedProbability.
 *
 * The factors combined here:
 *   1. Recent team form (last 5 international matches)
 *   2. Current World Cup tournament performance
 *   3. Group-stage vs knockout-stage context
 *   4. Motivation pressure (see `motivationAdjustment`)
 *   5. Market hit rate
 *   6. Implied probability from bookmaker odds
 *   7. Data confidence
 *
 * Ranking criteria (per spec): estimated probability, positive value vs odds,
 * low variance, data quality, suitability for compounding, and avoidance of
 * "safe-looking" low-value traps.
 */

import type {
  GroupStanding,
  Market,
  OddsSnapshot,
  Recommendation,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";
import { MARKETS, STREAK_FOCUS_MARKETS, clamp01, poissonOver } from "./markets";
import { edgeOf, hasEdge, riskRatingOf, streakSuitabilityOf, trapWarningOf, valueScoreOf } from "./value";

// ---------------------------------------------------------------------------
// Motivation adjustment
// ---------------------------------------------------------------------------

export interface MotivationContext {
  match: WorldCupMatch;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  homeStanding?: GroupStanding;
  awayStanding?: GroupStanding;
}

/**
 * Multipliers and flags describing how team motivation should nudge market
 * confidence. Values near 1.0 mean "no change"; >1 boosts, <1 dampens.
 */
export interface MotivationAdjustment {
  /** Multiplier applied to goal-market probabilities. */
  goals: number;
  /** Extra multiplier applied ONLY to Over 1.5 goals (knockout caution). */
  over15GoalsExtra: number;
  /** Multiplier applied to corner-market probabilities. */
  corners: number;
  /** Multiplier applied to the favourite's team-to-score probability. */
  favoriteTeamToScore: number;
  /** Reduces data confidence when rotation risk is high (0 = none). */
  confidencePenalty: number;
  /** Which side is the favourite, if any (team id). */
  favoriteId?: string;
  /** Human-readable explanations of every adjustment applied. */
  notes: string[];
}

const RANKING_GAP_HEAVY_FAVORITE = 25;

/**
 * Compute the motivation-driven adjustments for a match.
 *
 * Rules (per spec):
 *  - Group match where both teams still need points → slightly increase
 *    goal & corner confidence (open, attacking games).
 *  - Knockout match → slightly decrease goal confidence, especially Over 1.5
 *    (knockouts trend cautious / low-scoring).
 *  - Heavy favourite vs a weak team → increase team-to-score confidence for
 *    the favourite.
 *  - An already-qualified team → lower confidence due to rotation risk.
 */
export function motivationAdjustment(
  ctx: MotivationContext,
): MotivationAdjustment {
  const adj: MotivationAdjustment = {
    goals: 1,
    over15GoalsExtra: 1,
    corners: 1,
    favoriteTeamToScore: 1,
    confidencePenalty: 0,
    notes: [],
  };

  const { match, homeTeam, awayTeam, homeStanding, awayStanding } = ctx;
  const isGroup = match.stage === "group";
  const isKnockout = !isGroup;

  // Favourite by FIFA ranking.
  const favorite =
    homeTeam.fifaRanking <= awayTeam.fifaRanking ? homeTeam : awayTeam;
  const underdog = favorite.id === homeTeam.id ? awayTeam : homeTeam;
  adj.favoriteId = favorite.id;
  const rankingGap = underdog.fifaRanking - favorite.fifaRanking;

  // Rule 1 — group match, both sides need points.
  if (isGroup) {
    const bothNeedPoints =
      needsPoints(homeStanding) && needsPoints(awayStanding);
    if (bothNeedPoints) {
      adj.goals *= 1.06;
      adj.corners *= 1.05;
      adj.notes.push(
        "Both teams still need points in the group — expect a more open, attacking game (slight goal/corner boost).",
      );
    }
  }

  // Rule 2 — knockout caution.
  if (isKnockout) {
    adj.goals *= 0.95;
    adj.over15GoalsExtra *= 0.94;
    adj.corners *= 0.98;
    adj.notes.push(
      "Knockout match — historically more cautious; goal confidence trimmed (Over 1.5 most of all).",
    );
  }

  // Rule 3 — heavy favourite vs weak side.
  if (rankingGap >= RANKING_GAP_HEAVY_FAVORITE) {
    adj.favoriteTeamToScore *= 1.05;
    adj.notes.push(
      `${favorite.name} are heavy favourites (ranking gap ${rankingGap}) — higher confidence they score.`,
    );
  }

  // Rule 4 — already-qualified rotation risk.
  const qualifiedSide =
    homeStanding?.qualificationPressure === "already_qualified"
      ? homeTeam
      : awayStanding?.qualificationPressure === "already_qualified"
        ? awayTeam
        : undefined;
  if (qualifiedSide) {
    adj.goals *= 0.98;
    adj.confidencePenalty += 0.15;
    adj.notes.push(
      `${qualifiedSide.name} already qualified — rotation risk lowers data confidence.`,
    );
  }

  return adj;
}

function needsPoints(standing?: GroupStanding): boolean {
  if (!standing) return true; // unknown → treat as still motivated
  return (
    standing.qualificationPressure === "must_win" ||
    standing.qualificationPressure === "likely_needs_points" ||
    standing.qualificationPressure === "in_contention"
  );
}

// ---------------------------------------------------------------------------
// Per-market probability estimation
// ---------------------------------------------------------------------------

export interface ScoringContext {
  match: WorldCupMatch;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  homeRecent: TeamRecentMatchStats;
  awayRecent: TeamRecentMatchStats;
  homeTournament: TeamTournamentStats;
  awayTournament: TeamTournamentStats;
  homeStanding?: GroupStanding;
  awayStanding?: GroupStanding;
  odds: OddsSnapshot[];
}

/** Weight given to in-tournament data once a team has played group games. */
function tournamentWeight(played: number): number {
  if (played >= 2) return 0.45;
  if (played === 1) return 0.3;
  return 0;
}

/** Blended expected total goals for the match (factors 1 & 2). */
function expectedGoals(ctx: ScoringContext): number {
  const { homeRecent, awayRecent, homeTournament, awayTournament } = ctx;
  const recentExp =
    (homeRecent.avgGoalsFor + awayRecent.avgGoalsAgainst) / 2 +
    (awayRecent.avgGoalsFor + homeRecent.avgGoalsAgainst) / 2;
  const playedAvg = (homeTournament.matchesPlayed + awayTournament.matchesPlayed) / 2;
  const w = tournamentWeight(playedAvg);
  const tournExp =
    (homeTournament.avgTotalGoals + awayTournament.avgTotalGoals) / 2;
  return (1 - w) * recentExp + w * (tournExp || recentExp);
}

function expectedCorners(ctx: ScoringContext): number {
  const { homeRecent, awayRecent, homeTournament, awayTournament } = ctx;
  const recentExp =
    (homeRecent.avgTotalCorners + awayRecent.avgTotalCorners) / 2;
  const playedAvg = (homeTournament.matchesPlayed + awayTournament.matchesPlayed) / 2;
  const w = tournamentWeight(playedAvg);
  const tournExp =
    (homeTournament.avgTotalCorners + awayTournament.avgTotalCorners) / 2;
  return (1 - w) * recentExp + w * (tournExp || recentExp);
}

function expectedCards(ctx: ScoringContext): number {
  const { homeRecent, awayRecent, homeTournament, awayTournament } = ctx;
  const recentExp = (homeRecent.avgTotalCards + awayRecent.avgTotalCards) / 2;
  const playedAvg = (homeTournament.matchesPlayed + awayTournament.matchesPlayed) / 2;
  const w = tournamentWeight(playedAvg);
  const tournExp = (homeTournament.avgTotalCards + awayTournament.avgTotalCards) / 2;
  return (1 - w) * recentExp + w * (tournExp || recentExp);
}

/**
 * Estimate the model probability that a single market hits, applying the
 * motivation adjustment. Returns null for markets we cannot price.
 */
export function estimateMarketProbability(
  market: Market,
  ctx: ScoringContext,
  adj: MotivationAdjustment,
): { probability: number; rationale: string[] } | null {
  const rationale: string[] = [];
  let p: number;

  switch (market.key) {
    case "over_0_5_goals":
    case "over_1_5_goals":
    case "both_teams_combined_over_0_5": {
      const exp = expectedGoals(ctx);
      const line = market.key === "both_teams_combined_over_0_5" ? 0.5 : market.line!;
      p = poissonOver(exp, line);
      rationale.push(`Expected total goals ≈ ${exp.toFixed(2)} (form + tournament).`);
      p *= adj.goals;
      if (market.key === "over_1_5_goals") p *= adj.over15GoalsExtra;
      break;
    }
    case "over_5_5_corners":
    case "over_6_5_corners": {
      const exp = expectedCorners(ctx);
      p = poissonOver(exp, market.line!);
      rationale.push(`Expected total corners ≈ ${exp.toFixed(1)}.`);
      p *= adj.corners;
      break;
    }
    case "over_0_5_cards":
    case "over_1_5_cards": {
      const exp = expectedCards(ctx);
      p = poissonOver(exp, market.line!);
      rationale.push(`Expected total cards ≈ ${exp.toFixed(1)}.`);
      break;
    }
    case "favorite_team_over_0_5": {
      const favoriteIsHome = adj.favoriteId === ctx.homeTeam.id;
      const fav = favoriteIsHome ? ctx.homeRecent : ctx.awayRecent;
      const lambda = Math.max(0.3, fav.avgGoalsFor);
      p = clamp01(1 - Math.exp(-lambda));
      p *= adj.favoriteTeamToScore;
      rationale.push(
        `Favourite to score ≥1 (avg ${fav.avgGoalsFor.toFixed(2)} goals/game).`,
      );
      break;
    }
    case "double_chance": {
      const gap = strengthGap(ctx);
      p = clamp01(0.62 + gap * 0.3);
      rationale.push("Double chance on the favourite (covers two outcomes).");
      break;
    }
    case "draw_no_bet": {
      const gap = strengthGap(ctx);
      p = clamp01(0.55 + gap * 0.35);
      rationale.push("Draw no bet on the favourite (stake back if drawn).");
      break;
    }
    default:
      return null; // 1X2 and player props are priced/handled separately.
  }

  return { probability: clamp01(p), rationale };
}

/** Strength gap in favour of the stronger side, ~0..0.6. */
function strengthGap(ctx: ScoringContext): number {
  const h = 1 - (ctx.homeTeam.fifaRanking - 1) / 110;
  const a = 1 - (ctx.awayTeam.fifaRanking - 1) / 110;
  return Math.abs(h - a);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function dataConfidence(
  ctx: ScoringContext,
  adj: MotivationAdjustment,
): Recommendation["dataConfidence"] {
  const played =
    (ctx.homeTournament.matchesPlayed + ctx.awayTournament.matchesPlayed) / 2;
  const fullForm =
    ctx.homeRecent.matches.length >= 5 && ctx.awayRecent.matches.length >= 5;
  let score = 0;
  if (played >= 2) score += 2;
  else if (played >= 1) score += 1;
  if (fullForm) score += 1;
  score -= adj.confidencePenalty >= 0.15 ? 1 : 0;

  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

/** Find the bookmaker odds for a market (favourite selection where relevant). */
function oddsFor(
  market: Market,
  ctx: ScoringContext,
  adj: MotivationAdjustment,
): OddsSnapshot | undefined {
  if (market.key === "favorite_team_over_0_5") {
    return ctx.odds.find(
      (o) => o.marketKey === market.key && o.selection === adj.favoriteId,
    );
  }
  return ctx.odds.find((o) => o.marketKey === market.key);
}

/** Build a recommendation for one market, or null if it can't be priced. */
export function buildRecommendation(
  market: Market,
  ctx: ScoringContext,
  adj: MotivationAdjustment,
): Recommendation | null {
  const estimate = estimateMarketProbability(market, ctx, adj);
  if (!estimate) return null;
  const quote = oddsFor(market, ctx, adj);
  if (!quote) return null;

  const edge = edgeOf(estimate.probability, quote.odds);
  const confidence = dataConfidence(ctx, adj);
  const risk = riskRatingOf(estimate.probability, edge);
  const valueScore = valueScoreOf({
    estimatedProbability: estimate.probability,
    edge,
    riskLevel: risk,
    dataConfidence: confidence,
    odds: quote.odds,
  });
  const trapWarning = trapWarningOf({ odds: quote.odds, edge, dataConfidence: confidence });
  const streakSuitability = streakSuitabilityOf({
    estimatedProbability: estimate.probability,
    edge,
    dataConfidence: confidence,
    valueScore,
  });

  const rationale = [...estimate.rationale, ...adj.notes];
  if (!hasEdge(estimate.probability, quote.impliedProbability)) {
    rationale.push(
      "Estimated probability does not beat the bookmaker's implied probability — not a value candidate.",
    );
  }

  return {
    matchId: ctx.match.id,
    marketKey: market.key,
    marketLabel: MARKETS[market.key].label,
    selection: quote.selection,
    estimatedProbability: round3(estimate.probability),
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
  };
}

/** Every streak-focus recommendation for a match, best value first. */
export function buildRecommendations(ctx: ScoringContext): Recommendation[] {
  const adj = motivationAdjustment(ctx);
  const recs = STREAK_FOCUS_MARKETS.map((m) => buildRecommendation(m, ctx, adj))
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => b.valueScore - a.valueScore);
  return recs;
}

/** The single headline value candidate for a match (highest value score). */
export function bestRecommendation(ctx: ScoringContext): Recommendation | null {
  return buildRecommendations(ctx)[0] ?? null;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
