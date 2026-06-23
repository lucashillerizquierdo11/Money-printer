/**
 * Supported betting markets for the World Cup Streak Value Finder MVP.
 *
 * Only the markets listed below are supported. 1X2 is included for context but
 * is flagged `isStreakFocus: false` so it is never surfaced as a streak
 * candidate. Player markets only ever appear when a boosted-odds quote exists.
 */

import type { Market, MarketKey, RecentMatchLine, TeamRecentMatchStats, WorldCupMatch } from "@/types";

export const MARKETS: Record<MarketKey, Market> = {
  over_0_5_goals: {
    key: "over_0_5_goals",
    label: "Over 0.5 total goals",
    category: "goals",
    line: 0.5,
    isStreakFocus: true,
    description: "At least one goal is scored in the match.",
  },
  over_1_5_goals: {
    key: "over_1_5_goals",
    label: "Over 1.5 total goals",
    category: "goals",
    line: 1.5,
    isStreakFocus: true,
    description: "At least two goals are scored in the match.",
  },
  over_5_5_corners: {
    key: "over_5_5_corners",
    label: "Over 5.5 total corners",
    category: "corners",
    line: 5.5,
    isStreakFocus: true,
    description: "At least six corners are taken in the match.",
  },
  over_6_5_corners: {
    key: "over_6_5_corners",
    label: "Over 6.5 total corners",
    category: "corners",
    line: 6.5,
    isStreakFocus: true,
    description: "At least seven corners are taken in the match.",
  },
  over_0_5_cards: {
    key: "over_0_5_cards",
    label: "Over 0.5 total cards",
    category: "cards",
    line: 0.5,
    isStreakFocus: true,
    description: "At least one card is shown in the match.",
  },
  over_1_5_cards: {
    key: "over_1_5_cards",
    label: "Over 1.5 total cards",
    category: "cards",
    line: 1.5,
    isStreakFocus: true,
    description: "At least two cards are shown in the match.",
  },
  favorite_team_over_0_5: {
    key: "favorite_team_over_0_5",
    label: "Favorite team over 0.5 goals",
    category: "team_goals",
    line: 0.5,
    isStreakFocus: true,
    description: "The match favorite (by ranking/odds) scores at least one goal.",
  },
  both_teams_combined_over_0_5: {
    key: "both_teams_combined_over_0_5",
    label: "Both teams combined over 0.5 goals",
    category: "goals",
    line: 0.5,
    isStreakFocus: true,
    description:
      "Combined goals from both teams exceed 0.5 — same outcome as Over 0.5 total goals, priced separately by some bet-builder tools.",
  },
  double_chance: {
    key: "double_chance",
    label: "Double chance",
    category: "result",
    isStreakFocus: true,
    description: "Covers two of the three match outcomes.",
  },
  draw_no_bet: {
    key: "draw_no_bet",
    label: "Draw no bet",
    category: "result",
    isStreakFocus: true,
    description: "Stake returned if the match is drawn.",
  },
  player_over_0_5_goals: {
    key: "player_over_0_5_goals",
    label: "Player over 0.5 goals (boosted only)",
    category: "player_props",
    line: 0.5,
    isStreakFocus: true,
    requiresPlayerOdds: true,
    description:
      "A named player scores at least once. Only shown when a boosted-odds price is available.",
  },
  player_shot_on_target: {
    key: "player_shot_on_target",
    label: "Star player — shot on target (placeholder)",
    category: "player_props",
    isStreakFocus: false,
    requiresPlayerOdds: true,
    description:
      "Optional placeholder market for a named player to record a shot on target.",
  },
  "1x2": {
    key: "1x2",
    label: "1X2 (context only)",
    category: "result",
    isStreakFocus: false,
    description:
      "Home / draw / away. Shown for context — not a streak-candidate focus market.",
  },
};

/** All markets as an ordered list. */
export const MARKET_LIST: Market[] = Object.values(MARKETS);

/** Only the markets that are part of the streak-candidate focus. */
export const STREAK_FOCUS_MARKETS: Market[] = MARKET_LIST.filter(
  (m) => m.isStreakFocus && !m.requiresPlayerOdds,
);

// ---------------------------------------------------------------------------
// Market hit-rate helpers
//
// A "hit rate" is the share of a team's recent/tournament matches in which a
// market would have won. These work off the rolling average stat lines so they
// can run with only summary data available.
// ---------------------------------------------------------------------------

/**
 * Estimate the probability that a per-match total clears a line, given the
 * average total and a spread factor. Uses a smooth logistic curve so values
 * stay in (0,1) and respond sensibly to how far the average sits from the line.
 */
export function totalOverProbability(
  avgTotal: number,
  line: number,
  steepness = 1.1,
): number {
  const p = 1 / (1 + Math.exp(-steepness * (avgTotal - line)));
  return clamp01(p);
}

/** Probability a single team scores, from its average goals-for. */
export function teamToScoreProbability(avgGoalsFor: number): number {
  // Poisson P(>=1 goal) = 1 - e^{-lambda}
  return clamp01(1 - Math.exp(-Math.max(0, avgGoalsFor)));
}

/**
 * P(X > line) for X ~ Poisson(lambda), via the complementary CDF.
 * Used for over-totals (goals, corners, cards) given an expected match total.
 */
export function poissonOver(lambda: number, line: number): number {
  const floor = Math.floor(line);
  let cdf = 0;
  let term = Math.exp(-lambda);
  for (let k = 0; k <= floor; k++) {
    if (k > 0) term *= lambda / k;
    cdf += term;
  }
  return clamp01(1 - cdf);
}

/** Clamp a number into the (0,1) range, keeping a small margin off the edges. */
export function clamp01(p: number): number {
  return Math.min(0.995, Math.max(0.005, p));
}

/**
 * Compute the realised hit rate of a market across a set of completed matches,
 * used on the match-detail page to show historical reliability.
 */
export function realisedHitRate(
  matches: WorldCupMatch[],
  predicate: (m: WorldCupMatch) => boolean,
): number | null {
  const completed = matches.filter((m) => m.status === "complete");
  if (completed.length === 0) return null;
  const hits = completed.filter(predicate).length;
  return hits / completed.length;
}

/** Per-line-item predicates for the team-total-based markets we can derive a last-5 hit rate for. */
const HIT_RATE_PREDICATES: Partial<Record<MarketKey, (m: RecentMatchLine) => boolean>> = {
  over_0_5_goals: (m) => m.goalsFor + m.goalsAgainst > 0.5,
  over_1_5_goals: (m) => m.goalsFor + m.goalsAgainst > 1.5,
  both_teams_combined_over_0_5: (m) => m.goalsFor + m.goalsAgainst > 0.5,
  over_5_5_corners: (m) => m.totalCorners > 5.5,
  over_6_5_corners: (m) => m.totalCorners > 6.5,
  over_0_5_cards: (m) => m.totalCards > 0.5,
  over_1_5_cards: (m) => m.totalCards > 1.5,
  favorite_team_over_0_5: (m) => m.goalsFor > 0.5,
};

/** Per-match predicates for the team-total-based markets, against full match totals. */
const TOURNAMENT_HIT_PREDICATES: Partial<Record<MarketKey, (m: WorldCupMatch) => boolean>> = {
  over_0_5_goals: (m) => (m.totalGoals ?? 0) > 0.5,
  over_1_5_goals: (m) => (m.totalGoals ?? 0) > 1.5,
  both_teams_combined_over_0_5: (m) => (m.totalGoals ?? 0) > 0.5,
  over_5_5_corners: (m) => (m.totalCorners ?? 0) > 5.5,
  over_6_5_corners: (m) => (m.totalCorners ?? 0) > 6.5,
  over_0_5_cards: (m) => (m.totalCards ?? 0) > 0.5,
  over_1_5_cards: (m) => (m.totalCards ?? 0) > 1.5,
};

/**
 * Realised tournament hit rate for a market across a set of completed
 * matches. Returns null for markets that can't be derived from match totals
 * (result/team-specific/player markets).
 */
export function tournamentHitRateForMarket(
  matches: WorldCupMatch[],
  marketKey: MarketKey,
): number | null {
  const predicate = TOURNAMENT_HIT_PREDICATES[marketKey];
  if (!predicate) return null;
  return realisedHitRate(matches, predicate);
}

/**
 * Share of a team's last-5 matches in which a market would have hit. Returns
 * null for markets that aren't team-total-based (result/player markets), since
 * a last-5 hit rate can't be derived from summary stat lines for those.
 */
export function teamHitRate(stats: TeamRecentMatchStats, marketKey: MarketKey): number | null {
  const predicate = HIT_RATE_PREDICATES[marketKey];
  if (!predicate || stats.matches.length === 0) return null;
  const hits = stats.matches.filter(predicate).length;
  return hits / stats.matches.length;
}
