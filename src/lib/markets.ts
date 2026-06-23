/**
 * Supported low-risk betting markets for the World Cup SafeBet MVP.
 *
 * Only the markets listed below are supported. 1X2 is included for context but
 * is flagged `isSafeFocus: false` so it is never surfaced as the headline
 * "safer pick".
 */

import type { Market, MarketKey, WorldCupMatch } from "@/types";

export const MARKETS: Record<MarketKey, Market> = {
  over_0_5_goals: {
    key: "over_0_5_goals",
    label: "Over 0.5 total goals",
    category: "goals",
    line: 0.5,
    isSafeFocus: true,
    description: "At least one goal is scored in the match.",
  },
  over_1_5_goals: {
    key: "over_1_5_goals",
    label: "Over 1.5 total goals",
    category: "goals",
    line: 1.5,
    isSafeFocus: true,
    description: "At least two goals are scored in the match.",
  },
  over_5_5_corners: {
    key: "over_5_5_corners",
    label: "Over 5.5 total corners",
    category: "corners",
    line: 5.5,
    isSafeFocus: true,
    description: "At least six corners are taken in the match.",
  },
  over_6_5_corners: {
    key: "over_6_5_corners",
    label: "Over 6.5 total corners",
    category: "corners",
    line: 6.5,
    isSafeFocus: true,
    description: "At least seven corners are taken in the match.",
  },
  over_0_5_cards: {
    key: "over_0_5_cards",
    label: "Over 0.5 total cards",
    category: "cards",
    line: 0.5,
    isSafeFocus: true,
    description: "At least one card is shown in the match.",
  },
  over_1_5_cards: {
    key: "over_1_5_cards",
    label: "Over 1.5 total cards",
    category: "cards",
    line: 1.5,
    isSafeFocus: true,
    description: "At least two cards are shown in the match.",
  },
  team_to_score_over_0_5: {
    key: "team_to_score_over_0_5",
    label: "Team to score over 0.5",
    category: "team_goals",
    line: 0.5,
    isSafeFocus: true,
    description: "A specific team scores at least one goal.",
  },
  double_chance: {
    key: "double_chance",
    label: "Double chance",
    category: "result",
    isSafeFocus: true,
    description: "Covers two of the three match outcomes.",
  },
  draw_no_bet: {
    key: "draw_no_bet",
    label: "Draw no bet",
    category: "result",
    isSafeFocus: true,
    description: "Stake returned if the match is drawn.",
  },
  "1x2": {
    key: "1x2",
    label: "1X2 (context only)",
    category: "result",
    isSafeFocus: false,
    description:
      "Home / draw / away. Shown for context — not a safe-bet focus market.",
  },
};

/** All markets as an ordered list. */
export const MARKET_LIST: Market[] = Object.values(MARKETS);

/** Only the markets that are part of the "safer pick" focus. */
export const SAFE_FOCUS_MARKETS: Market[] = MARKET_LIST.filter(
  (m) => m.isSafeFocus,
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
