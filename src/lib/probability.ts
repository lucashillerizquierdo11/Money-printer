/**
 * Transparent probability engine.
 *
 * Three core formulas everything else builds on:
 *   impliedProbability(decimalOdds)              = 1 / decimalOdds
 *   edge(estimatedProbability, impliedProbability) = estimatedProbability - impliedProbability
 *   expectedValue(decimalOdds, estimatedProbability) = estimatedProbability * decimalOdds - 1
 *
 * Below that are per-market probability estimators. Each one takes a plain
 * inputs object naming exactly the factors that feed it, and returns the
 * estimated probability plus a numeric data-confidence (0..1) and a
 * rationale/warning trail — every number shown to the user must trace back
 * to a reason stated here, nothing is a black box.
 *
 * These estimators are intentionally pure functions of their inputs: no
 * market here ever looks at its own odds to decide its probability. Odds are
 * only ever compared against the probability afterwards, via edge/expectedValue.
 */

import { clamp01, poissonOver } from "./markets";

export function impliedProbability(decimalOdds: number): number {
  return 1 / decimalOdds;
}

export function edge(estimatedProbability: number, impliedProbabilityValue: number): number {
  return estimatedProbability - impliedProbabilityValue;
}

export function expectedValue(decimalOdds: number, estimatedProbability: number): number {
  return estimatedProbability * decimalOdds - 1;
}

/** Shared shape returned by every market-specific estimator. */
export interface MarketEstimate {
  /** 0..1, clamped away from the extremes. */
  probability: number;
  /** 0..1 — how much to trust this estimate, given sample size and data quality. */
  dataConfidence: number;
  /** Plain-English factors that produced the estimate. */
  rationale: string[];
  /** Caveats / risk flags worth surfacing even when the number looks good. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 1. Over 0.5 total goals
// ---------------------------------------------------------------------------

export interface Over05GoalsInputs {
  /** Share (0..1) of Team A's recent matches in which they failed to score. */
  teamAFailedToScoreRate: number;
  /** Share (0..1) of Team B's recent matches in which they failed to score. */
  teamBFailedToScoreRate: number;
  /** Share (0..1) of the two teams' recent head-to-head-style matches that finished 0-0. */
  combined00Rate?: number;
  /** Share (0..1) of 0-0 results across the tournament so far. */
  tournament00Rate?: number;
  /** 0..100, higher = stronger attack. */
  teamAAttackRating?: number;
  teamBAttackRating?: number;
  /** 0..100, higher = leakier defense. */
  teamADefenseWeakness?: number;
  teamBDefenseWeakness?: number;
  isKnockout: boolean;
  /** Neither side has anything left to play for. */
  isDeadRubber: boolean;
  bothTeamsNeedPoints: boolean;
}

export function estimateOver05Goals(i: Over05GoalsInputs): MarketEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  // Independent estimate of "neither side scores", from each team's own rate.
  const independentNoGoalRate = clamp01(i.teamAFailedToScoreRate * i.teamBFailedToScoreRate);
  // Blended with observed combined/tournament 0-0 rates, which capture
  // correlation (cagey, low-tempo matchups) that the independent estimate misses.
  const sampleRates = [independentNoGoalRate, i.combined00Rate, i.tournament00Rate].filter(
    (v): v is number => v !== undefined,
  );
  const noGoalRate = sampleRates.reduce((a, b) => a + b, 0) / sampleRates.length;

  let p = 1 - noGoalRate;
  rationale.push(`Base no-goal rate ≈ ${(noGoalRate * 100).toFixed(1)}% from failed-to-score history.`);

  if (i.teamAAttackRating !== undefined && i.teamBDefenseWeakness !== undefined) {
    p += (i.teamAAttackRating - 50) / 1000 + (i.teamBDefenseWeakness - 50) / 1000;
  }
  if (i.teamBAttackRating !== undefined && i.teamADefenseWeakness !== undefined) {
    p += (i.teamBAttackRating - 50) / 1000 + (i.teamADefenseWeakness - 50) / 1000;
  }

  if (i.isKnockout) {
    p *= 0.96;
    rationale.push("Knockout caution trims goal probability slightly.");
  }
  if (i.isDeadRubber) {
    p *= 0.92;
    warnings.push("Dead-rubber match — reduced motivation can suppress tempo and goals.");
  }
  if (i.bothTeamsNeedPoints) {
    p *= 1.04;
    rationale.push("Both teams still need points — a more open, attacking approach is likely.");
  }

  const dataConfidence = sampleRates.length >= 2 ? 0.75 : 0.55;

  return { probability: clamp01(p), dataConfidence, rationale, warnings };
}

// ---------------------------------------------------------------------------
// 2. Over 1.5 total goals
// ---------------------------------------------------------------------------

export interface Over15GoalsInputs {
  /** Average combined goals across both teams' last 5 matches. */
  last5AvgTotalGoals: number;
  tournamentAvgTotalGoals?: number;
  /** Empirical share (0..1) of recent/tournament matches that went over 1.5. */
  over15HitRate?: number;
  teamAAttackRating?: number;
  teamBAttackRating?: number;
  teamADefenseWeakness?: number;
  teamBDefenseWeakness?: number;
  /** Motivation multiplier from the scoring engine's motivation adjustment, default 1. */
  motivationMultiplier?: number;
  isKnockout: boolean;
}

export function estimateOver15Goals(i: Over15GoalsInputs): MarketEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  const tournamentWeight = i.tournamentAvgTotalGoals !== undefined ? 0.4 : 0;
  const expectedGoals =
    (1 - tournamentWeight) * i.last5AvgTotalGoals +
    tournamentWeight * (i.tournamentAvgTotalGoals ?? i.last5AvgTotalGoals);
  rationale.push(`Expected total goals ≈ ${expectedGoals.toFixed(2)} (form-weighted).`);

  let p = poissonOver(Math.max(0.1, expectedGoals), 1.5);

  if (i.over15HitRate !== undefined) {
    p = p * 0.6 + i.over15HitRate * 0.4;
    rationale.push(`Blended with empirical Over 1.5 hit rate of ${(i.over15HitRate * 100).toFixed(0)}%.`);
  }

  const attackScore = ((i.teamAAttackRating ?? 50) + (i.teamBAttackRating ?? 50)) / 2;
  const defenseLeakScore =
    ((i.teamADefenseWeakness ?? 50) + (i.teamBDefenseWeakness ?? 50)) / 2;
  p += (attackScore + defenseLeakScore - 100) / 2000;

  p *= i.motivationMultiplier ?? 1;

  if (i.isKnockout) {
    p *= 0.94;
    warnings.push("Knockout matches trend cautious — Over 1.5 hits less often than open-play form suggests.");
  }

  const dataConfidence =
    i.over15HitRate !== undefined && i.tournamentAvgTotalGoals !== undefined ? 0.7 : 0.5;

  return { probability: clamp01(p), dataConfidence, rationale, warnings };
}

// ---------------------------------------------------------------------------
// 3. Over 5.5 / 6.5 total corners
// ---------------------------------------------------------------------------

export interface OverCornersInputs {
  teamACornersFor: number;
  teamACornersAgainst: number;
  teamBCornersFor: number;
  teamBCornersAgainst: number;
  last5CombinedAvgCorners: number;
  tournamentAvgCorners?: number;
  /** 0..1 — how much the favourite is expected to dominate territory/possession. */
  favoritePressure?: number;
  /** 0..1 — how likely the underdog sits deep and suppresses corner count. */
  underdogBlockLikelihood?: number;
  /** Either team chasing a goal tends to push more corners late on. */
  teamsNeedingGoals?: boolean;
  /** How many actual World Cup matches inform this estimate — corners are volatile, so small samples must not look confident. */
  sampleSizeWorldCupMatches: number;
  line: 5.5 | 6.5;
}

export function estimateOverCorners(i: OverCornersInputs): MarketEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  const ownProfileAvg =
    (i.teamACornersFor + i.teamACornersAgainst + i.teamBCornersFor + i.teamBCornersAgainst) / 2;
  const tournamentWeight = i.tournamentAvgCorners !== undefined ? 0.35 : 0;
  let expectedCorners =
    (1 - tournamentWeight) * ((ownProfileAvg + i.last5CombinedAvgCorners) / 2) +
    tournamentWeight * (i.tournamentAvgCorners ?? i.last5CombinedAvgCorners);

  rationale.push(`Expected total corners ≈ ${expectedCorners.toFixed(1)}.`);

  if (i.favoritePressure !== undefined) expectedCorners *= 1 + (i.favoritePressure - 0.5) * 0.1;
  if (i.underdogBlockLikelihood !== undefined) expectedCorners *= 1 - i.underdogBlockLikelihood * 0.08;
  if (i.teamsNeedingGoals) {
    expectedCorners *= 1.04;
    rationale.push("Team(s) chasing the game tend to push more corners late on.");
  }

  const p = poissonOver(Math.max(0.5, expectedCorners), i.line);

  // Corners are volatile — never let a thin World Cup sample look confident.
  let dataConfidence = 0.55;
  if (i.sampleSizeWorldCupMatches <= 2) {
    dataConfidence = 0.35;
    warnings.push(
      `Only ${i.sampleSizeWorldCupMatches} World Cup match${i.sampleSizeWorldCupMatches === 1 ? "" : "es"} of corner data — treat this estimate as low-confidence.`,
    );
  } else if (i.sampleSizeWorldCupMatches >= 4) {
    dataConfidence = 0.65;
  }

  return { probability: clamp01(p), dataConfidence, rationale, warnings };
}

// ---------------------------------------------------------------------------
// 4. Over 0.5 / 1.5 total cards
// ---------------------------------------------------------------------------

export interface OverCardsInputs {
  teamACardsFor: number;
  teamACardsAgainst: number;
  teamBCardsFor: number;
  teamBCardsAgainst: number;
  refereeAvgCardsPerGame?: number;
  /** 0..1 — how much is riding on the result. */
  matchImportance?: number;
  /** 0..1 placeholder for rivalry/physicality intensity. */
  rivalryPhysicality?: number;
  isKnockout: boolean;
  qualificationPressure?: boolean;
  line: 0.5 | 1.5;
}

export function estimateOverCards(i: OverCardsInputs): MarketEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  const teamProfileAvg =
    (i.teamACardsFor + i.teamACardsAgainst + i.teamBCardsFor + i.teamBCardsAgainst) / 2;
  let expectedCards = teamProfileAvg;

  if (i.refereeAvgCardsPerGame !== undefined) {
    expectedCards = expectedCards * 0.6 + i.refereeAvgCardsPerGame * 0.4;
    rationale.push(`Referee averages ${i.refereeAvgCardsPerGame.toFixed(1)} cards/game.`);
  }

  if (i.matchImportance !== undefined) expectedCards *= 1 + i.matchImportance * 0.1;
  if (i.rivalryPhysicality !== undefined) expectedCards *= 1 + i.rivalryPhysicality * 0.1;
  if (i.isKnockout) {
    expectedCards *= 1.08;
    rationale.push("Knockout stakes raise card likelihood.");
  }
  if (i.qualificationPressure) {
    expectedCards *= 1.05;
    rationale.push("Qualification pressure adds an extra edge to the contest.");
  }

  rationale.push(`Expected total cards ≈ ${expectedCards.toFixed(1)}.`);
  const p = poissonOver(Math.max(0.2, expectedCards), i.line);

  if (i.line === 0.5 && p >= 0.9) {
    warnings.push(
      "Over 0.5 cards is often a very high-probability outcome — check the edge carefully, since bookmaker odds are frequently priced too low for it to be worth backing.",
    );
  }

  return { probability: clamp01(p), dataConfidence: 0.6, rationale, warnings };
}

// ---------------------------------------------------------------------------
// 5. Team over 0.5 goals
// ---------------------------------------------------------------------------

export interface TeamOver05GoalsInputs {
  /** Team's average goals scored per game. */
  teamGoalsScoredRate: number;
  /** Opponent's average goals conceded per game. */
  opponentGoalsConcededRate: number;
  /** Share (0..1) of the team's recent matches in which they failed to score. */
  teamFailedToScoreRate?: number;
  /** Share (0..1) of the opponent's recent matches that ended in a clean sheet. */
  opponentCleanSheetRate?: number;
  /** 0..1, 1 = full-strength expected lineup. */
  lineupStrength?: number;
  /** Motivation multiplier from the scoring engine, default 1. */
  motivationMultiplier?: number;
}

export function estimateTeamOver05Goals(i: TeamOver05GoalsInputs): MarketEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  const lambda = (i.teamGoalsScoredRate + i.opponentGoalsConcededRate) / 2;
  let p = 1 - Math.exp(-Math.max(0.05, lambda));
  rationale.push(`Team scoring rate blended with opponent concession rate ≈ ${lambda.toFixed(2)} goals/game.`);

  if (i.teamFailedToScoreRate !== undefined && i.opponentCleanSheetRate !== undefined) {
    const failToScoreEstimate = (i.teamFailedToScoreRate + i.opponentCleanSheetRate) / 2;
    p = p * 0.7 + (1 - failToScoreEstimate) * 0.3;
  }

  if (i.lineupStrength !== undefined) {
    p *= 0.85 + i.lineupStrength * 0.15;
    if (i.lineupStrength < 0.6) {
      warnings.push("Expected lineup looks weakened — treat the attacking estimate with caution.");
    }
  }

  p *= i.motivationMultiplier ?? 1;

  return { probability: clamp01(p), dataConfidence: 0.6, rationale, warnings };
}

// ---------------------------------------------------------------------------
// 6. Player over 0.5 goals (boosted-only per product spec)
// ---------------------------------------------------------------------------

export interface PlayerOver05GoalsInputs {
  likelyStarter: boolean;
  expectedMinutes: number;
  goalsPer90: number;
  xgPer90?: number;
  isPenaltyTaker: boolean;
  /** Team's expected goals for the match, if known. */
  teamExpectedGoals?: number;
  /** 0..100, higher = stronger opponent defense. */
  opponentDefenseRating?: number;
  boostedOdds?: number;
  normalOdds?: number;
}

export interface PlayerOver05GoalsEstimate extends MarketEstimate {
  /** True when the player is not a likely starter, or expected minutes < 60. */
  highRisk: boolean;
  /** normalImpliedProbability - boostedImpliedProbability, when both odds are known. */
  boostValue?: number;
}

export function estimatePlayerOver05Goals(i: PlayerOver05GoalsInputs): PlayerOver05GoalsEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  const perMatchRate = i.xgPer90 !== undefined ? (i.goalsPer90 + i.xgPer90) / 2 : i.goalsPer90;
  const minutesShare = Math.min(1, i.expectedMinutes / 90);
  let lambda = perMatchRate * minutesShare;

  if (i.teamExpectedGoals !== undefined) {
    // Light pull toward the player's plausible share of team xG, without
    // letting it dominate the per-90 signal.
    lambda = lambda * 0.7 + i.teamExpectedGoals * 0.09;
  }
  if (i.opponentDefenseRating !== undefined) {
    lambda *= 1 - (i.opponentDefenseRating - 50) / 250;
  }
  if (i.isPenaltyTaker) {
    lambda *= 1.08;
    rationale.push("Designated penalty taker adds a small scoring bump.");
  }

  rationale.push(
    `Expected minutes ${i.expectedMinutes} at ${perMatchRate.toFixed(2)} goals/90 ≈ ${lambda.toFixed(2)} expected goals.`,
  );
  const p = 1 - Math.exp(-Math.max(0.01, lambda));

  const highRisk = !i.likelyStarter || i.expectedMinutes < 60;
  if (highRisk) {
    warnings.push(
      i.likelyStarter
        ? "Expected minutes under 60 — rotation/substitution risk materially lowers the realistic scoring window."
        : "Player is not a likely starter — treat this as high risk regardless of the headline odds.",
    );
  }

  let boostValue: number | undefined;
  if (i.boostedOdds !== undefined && i.normalOdds !== undefined) {
    const normalImpliedProbability = impliedProbability(i.normalOdds);
    const boostedImpliedProbability = impliedProbability(i.boostedOdds);
    boostValue = normalImpliedProbability - boostedImpliedProbability;
    rationale.push(
      `Boost is worth +${(boostValue * 100).toFixed(1)}pp of implied probability vs the normal price — but the modelled scoring probability above, not the boost size alone, is what should drive the decision.`,
    );
  }

  const dataConfidence = highRisk ? 0.4 : 0.6;

  return { probability: clamp01(p), dataConfidence, rationale, warnings, highRisk, boostValue };
}

// ---------------------------------------------------------------------------
// 7. Double chance
// ---------------------------------------------------------------------------

export interface DoubleChanceInputs {
  /** 0..1, 0 = evenly matched, 1 = huge gap in favour of the favourite. */
  teamStrengthDifference: number;
  /** 0..1, recent-form gap in the same direction. */
  recentFormDifference?: number;
  groupContextFavorsFavorite?: boolean;
  /** Independently estimated draw probability, if available. */
  drawProbabilityEstimate?: number;
}

/** MVP placeholder model — confidence is deliberately capped low. */
export function estimateDoubleChance(i: DoubleChanceInputs): MarketEstimate {
  const rationale: string[] = [];
  const warnings: string[] = [];

  let p = 0.6 + i.teamStrengthDifference * 0.3;
  rationale.push("Placeholder double-chance model based on team strength gap.");

  if (i.recentFormDifference !== undefined) p += i.recentFormDifference * 0.05;
  if (i.groupContextFavorsFavorite) p += 0.02;
  if (i.drawProbabilityEstimate !== undefined) p = Math.max(p, i.drawProbabilityEstimate + 0.5);

  warnings.push(
    "Double chance is an MVP placeholder model — treat confidence as lower unless backed by stronger odds/model data.",
  );

  return { probability: clamp01(p), dataConfidence: 0.45, rationale, warnings };
}
