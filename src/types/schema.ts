/**
 * Forward-looking, normalized data model for the World Cup Streak Value
 * Finder, shaped to map directly onto Supabase/Postgres tables later (one
 * interface per table, foreign keys as plain `*Id` string fields, no
 * embedded/denormalized objects).
 *
 * This is additive and not yet wired into the app — the live pages
 * (`/dashboard`, `/match/[id]`, `/streak`, `/boosts`, `/settings`) continue to
 * run on the existing mock-data shapes in `src/types/index.ts`.
 */

// ---------------------------------------------------------------------------
// WorldCupTeam
// ---------------------------------------------------------------------------

export interface WorldCupTeam {
  id: string;
  name: string;
  fifaCode: string;
  groupLetter: string;
  fifaRanking?: number;
  confederation?: string;
  squadStrengthRating?: number;
  attackRating?: number;
  defenseRating?: number;
  setPieceRating?: number;
  disciplineRating?: number;
}

// ---------------------------------------------------------------------------
// WorldCupMatch
// ---------------------------------------------------------------------------

export type MatchStatus = "scheduled" | "live" | "complete";

export type MatchStage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "final";

export interface WorldCupMatch {
  id: string;
  kickoffTime: string;
  status: MatchStatus;
  stage: MatchStage;
  groupLetter?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  refereeId?: string;
  totalGoals?: number;
  totalCorners?: number;
  totalCards?: number;
  homeCorners?: number;
  awayCorners?: number;
  homeCards?: number;
  awayCards?: number;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
  homeXg?: number;
  awayXg?: number;
}

// ---------------------------------------------------------------------------
// TeamRecentMatchStats
// ---------------------------------------------------------------------------

export type HomeAwayNeutral = "home" | "away" | "neutral";
export type MatchResult = "win" | "draw" | "loss";

export interface TeamRecentMatchStats {
  id: string;
  teamId: string;
  opponent: string;
  date: string;
  competition: string;
  goalsFor: number;
  goalsAgainst: number;
  cornersFor: number;
  cornersAgainst: number;
  cardsFor: number;
  cardsAgainst: number;
  shotsFor?: number;
  shotsAgainst?: number;
  shotsOnTargetFor?: number;
  shotsOnTargetAgainst?: number;
  xgFor?: number;
  xgAgainst?: number;
  homeAwayNeutral: HomeAwayNeutral;
  result: MatchResult;
}

// ---------------------------------------------------------------------------
// TeamTournamentStats
// ---------------------------------------------------------------------------

export interface TeamTournamentStats {
  teamId: string;
  matchesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  cornersFor: number;
  cornersAgainst: number;
  cardsFor: number;
  cardsAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
  shotsOnTargetFor: number;
  shotsOnTargetAgainst: number;
  xgFor?: number;
  xgAgainst?: number;
  cleanSheets: number;
  failedToScore: number;
  over05GoalsHitRate: number;
  over15GoalsHitRate: number;
  over55CornersHitRate: number;
  over65CornersHitRate: number;
  over05CardsHitRate: number;
  over15CardsHitRate: number;
}

// ---------------------------------------------------------------------------
// GroupStanding
// ---------------------------------------------------------------------------

export type QualificationStatus =
  | "likely_qualified"
  | "must_win"
  | "needs_points"
  | "eliminated"
  | "unknown";

export interface GroupStanding {
  groupLetter: string;
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualificationStatus: QualificationStatus;
}

// ---------------------------------------------------------------------------
// Referee
// ---------------------------------------------------------------------------

export interface Referee {
  id: string;
  name: string;
  avgCardsPerGame: number;
  avgFoulsPerGame?: number;
  penaltyRate?: number;
  redCardRate?: number;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: string;
  likelyStarter: boolean;
  expectedMinutes: number;
  penaltyTaker: boolean;
  freeKickTaker: boolean;
  goalsPer90: number;
  shotsPer90: number;
  shotsOnTargetPer90: number;
  xgPer90?: number;
  anytimeGoalBaseProbability?: number;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export type MarketType =
  | "over_05_goals"
  | "over_15_goals"
  | "over_55_corners"
  | "over_65_corners"
  | "over_05_cards"
  | "over_15_cards"
  | "team_over_05_goals"
  | "double_chance"
  | "draw_no_bet"
  | "player_over_05_goals"
  | "player_shot_on_target"
  | "bet_builder";

export interface Market {
  id: string;
  matchId: string;
  type: MarketType;
  teamId?: string;
  playerId?: string;
  line?: number;
  description: string;
}

// ---------------------------------------------------------------------------
// OddsSnapshot
// ---------------------------------------------------------------------------

export interface OddsSnapshot {
  id: string;
  marketId: string;
  bookmaker: string;
  decimalOdds: number;
  timestamp: string;
  isBoosted: boolean;
  normalOdds?: number;
  boostedOdds?: number;
  maxStake?: number;
  terms?: string;
}

// ---------------------------------------------------------------------------
// MarketEvaluation
// ---------------------------------------------------------------------------

export type MarketRecommendation = "avoid" | "watch" | "consider" | "strong_candidate";

export interface MarketEvaluation {
  marketId: string;
  estimatedProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  varianceScore: number;
  riskScore: number;
  valueScore: number;
  streakSuitabilityScore: number;
  dataConfidence: number;
  recommendation: MarketRecommendation;
  explanation: string;
  avoidReason?: string;
}

// ---------------------------------------------------------------------------
// StreakPlan
// ---------------------------------------------------------------------------

export type StakingMode = "all_in" | "fixed" | "percentage" | "kelly";

export type StreakWarningLevel = "low" | "medium" | "high";

export interface StreakPlan {
  startingBankroll: number;
  targetBankroll: number;
  selectedMarketIds: string[];
  stakingMode: StakingMode;
  expectedFinalBankroll: number;
  combinedProbability: number;
  totalRequiredWins: number;
  averageOdds: number;
  warningLevel: StreakWarningLevel;
}
