/**
 * World Cup Streak Value Finder — Core data model.
 *
 * SCOPE: FIFA World Cup ONLY. These types intentionally model national-team
 * tournament football (groups, knockout stages, qualification pressure) and do
 * NOT support clubs, domestic leagues, or other competitions in this MVP.
 *
 * Every interface here is "database-ready": it uses primitive/serializable
 * fields and string ids so it can map directly onto SQL tables or a document
 * store when a real data source is connected later (see README).
 *
 * LANGUAGE RULES (enforced throughout the app, not just here):
 *  - Never describe a bet as "guaranteed".
 *  - Never say "safe" without showing the accompanying risk rating.
 *  - Use: estimated hit probability, value score, streak suitability, risk
 *    rating, data confidence, market edge, avoid / consider / strong candidate.
 */

// ---------------------------------------------------------------------------
// Tournament structure
// ---------------------------------------------------------------------------

/**
 * Stages of a FIFA World Cup (48-team / 12-group format).
 * `group` covers all group-stage matches; the remainder are knockout rounds.
 */
export type WorldCupStage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final";

/** Whether a stage is part of the group phase or the knockout phase. */
export type StagePhase = "group" | "knockout";

/** Group letters for the 12-group World Cup format. */
export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export type MatchStatus = "scheduled" | "live" | "complete";

// ---------------------------------------------------------------------------
// Teams & groups
// ---------------------------------------------------------------------------

/** A national team competing in the World Cup. */
export interface WorldCupTeam {
  id: string;
  /** Full country name, e.g. "Argentina". */
  name: string;
  /** 3-letter FIFA country code, e.g. "ARG". */
  code: string;
  /** Confederation, e.g. "UEFA", "CONMEBOL". */
  confederation: string;
  /** Current FIFA world ranking (lower is stronger). */
  fifaRanking: number;
  /** Group this team is drawn into. */
  groupLetter: GroupLetter;
  /** Emoji flag for lightweight display. */
  flag: string;
}

/** A World Cup group of national teams. */
export interface WorldCupGroup {
  letter: GroupLetter;
  name: string; // "Group A"
  teamIds: string[];
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

/**
 * A single World Cup match. Knockout matches leave `groupLetter` undefined.
 * Score and aggregate stat fields are only populated once a match is complete
 * (or live), matching how a real fixtures+results feed would behave.
 */
export interface WorldCupMatch {
  id: string;
  /** ISO-8601 kickoff timestamp. */
  kickoffTime: string;
  stage: WorldCupStage;
  /** Only set for group-stage matches. */
  groupLetter?: GroupLetter;
  homeTeam: string; // team id
  awayTeam: string; // team id
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
  totalGoals?: number;
  totalCorners?: number;
  totalCards?: number;
  venue?: string;
}

// ---------------------------------------------------------------------------
// Team statistics
// ---------------------------------------------------------------------------

/** Per-match line item used inside last-5 form summaries. */
export interface RecentMatchLine {
  opponent: string; // team name (free text — opponents may be non-WC sides)
  date: string; // ISO date
  goalsFor: number;
  goalsAgainst: number;
  corners: number;
  cards: number;
  shotsFor: number;
  shotsOnTarget: number;
  /** Match-total corners/cards (own + approximated opponent), stored once at generation time. */
  totalCorners: number;
  totalCards: number;
  result: "W" | "D" | "L";
}

/**
 * A national team's last-5 international matches, with rolled-up averages.
 * "International" = friendlies + qualifiers + tournament games, NOT club games.
 */
export interface TeamRecentMatchStats {
  teamId: string;
  matches: RecentMatchLine[]; // most recent first, up to 5
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgTotalGoals: number;
  avgCornersFor: number;
  avgCornersAgainst: number;
  avgTotalCorners: number;
  avgCardsFor: number;
  avgCardsAgainst: number;
  avgTotalCards: number;
  avgShotsFor: number;
  avgShotsOnTarget: number;
  /** Count of the last 5 matches with goalsAgainst === 0. */
  cleanSheets: number;
  /** Count of the last 5 matches with goalsFor === 0. */
  failedToScore: number;
}

/** A national team's performance in the current World Cup so far. */
export interface TeamTournamentStats {
  teamId: string;
  matchesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  cornersFor: number;
  cornersAgainst: number;
  cardsFor: number;
  cardsAgainst: number;
  avgTotalGoals: number;
  avgTotalCorners: number;
  avgTotalCards: number;
}

// ---------------------------------------------------------------------------
// Markets, odds & recommendations
// ---------------------------------------------------------------------------

/** Category groups for the supported markets. */
export type MarketCategory =
  | "goals"
  | "corners"
  | "cards"
  | "team_goals"
  | "result"
  | "player_props";

/** Stable keys for every market supported in the MVP. */
export type MarketKey =
  | "over_0_5_goals"
  | "over_1_5_goals"
  | "over_5_5_corners"
  | "over_6_5_corners"
  | "over_0_5_cards"
  | "over_1_5_cards"
  | "favorite_team_over_0_5"
  | "both_teams_combined_over_0_5"
  | "double_chance"
  | "draw_no_bet"
  | "player_over_0_5_goals"
  | "player_shot_on_target"
  | "1x2";

/** Definition of a betting market the dashboard can analyse. */
export interface Market {
  key: MarketKey;
  label: string;
  category: MarketCategory;
  /** Numeric line where relevant (e.g. 0.5, 5.5). */
  line?: number;
  /**
   * Whether this market is part of the streak-candidate focus (high hit
   * probability, low variance). 1X2 is shown for context only and is
   * intentionally NOT a streak-candidate focus market.
   */
  isStreakFocus: boolean;
  /** True only for markets that require a player-prop / boosted-odds quote. */
  requiresPlayerOdds?: boolean;
  description: string;
}

/** A bookmaker odds quote for one market on one match at a point in time. */
export interface OddsSnapshot {
  id: string;
  matchId: string;
  marketKey: MarketKey;
  /** Optional selection within a market (e.g. team id for team-to-score). */
  selection?: string;
  bookmaker: string;
  /** Decimal odds. */
  odds: number;
  /** 1 / odds, expressed 0..1. */
  impliedProbability: number;
  /** ISO timestamp the quote was captured. */
  capturedAt: string;
}

/**
 * Discrete risk rating shown to the user. Never shown without context — the
 * app must never call something "safe" without also surfacing this rating.
 */
export type RiskLevel = "low" | "medium" | "high";

/** Confidence in the underlying data feeding a recommendation. */
export type DataConfidence = "high" | "medium" | "low";

/**
 * How suitable a candidate is for a streak/compounding strategy: high hit
 * probability, low variance, and not a "trap" (low odds with little/no edge).
 */
export type StreakSuitability = "strong_candidate" | "consider" | "avoid";

/**
 * 4-tier general recommendation label shown on the Dashboard/Boost finder.
 * Distinct from `StreakSuitability` only in that it adds a middle "watch"
 * tier for candidates worth tracking but not yet acting on.
 */
export type RecommendationLabel = "avoid" | "watch" | "consider" | "strong_candidate";

/**
 * A model-estimated value candidate for a single match + market.
 * NOTE: this is research output, never a guarantee. UI must use language such
 * as "estimated hit probability" / "value score" / "strong candidate" and
 * must always show the risk rating alongside it — never call a bet "safe"
 * without showing the risk.
 */
export interface Recommendation {
  matchId: string;
  marketKey: MarketKey;
  marketLabel: string;
  selection?: string;
  /** Model-estimated hit probability, 0..1. */
  estimatedProbability: number;
  /** Decimal odds used. */
  odds: number;
  /** Bookmaker implied probability, 0..1. */
  impliedProbability: number;
  /** estimatedProbability - impliedProbability (market edge). */
  edge: number;
  /** 0..100 composite score blending probability, edge, variance & confidence. */
  valueScore: number;
  riskLevel: RiskLevel;
  dataConfidence: DataConfidence;
  streakSuitability: StreakSuitability;
  /**
   * Set when the market looks "safe" on the surface (very low odds) but
   * carries little or no edge, or low data confidence — a classic trap for
   * streak bettors chasing short-priced "locks".
   */
  trapWarning?: string;
  /** Human-readable factors behind the estimate. */
  rationale: string[];
  /** True only for markets priced from a bookmaker-boosted quote (player props). */
  isBoosted?: boolean;
}

// ---------------------------------------------------------------------------
// Player props
// ---------------------------------------------------------------------------

/** A national-team player, for the optional player-prop markets. */
export interface WorldCupPlayer {
  id: string;
  teamId: string;
  name: string;
  position: "GK" | "DF" | "MF" | "FW";
  /** Average goals per international appearance, mock value. */
  avgGoalsPerMatch: number;
  /** Average shots on target per appearance, mock value. */
  avgShotsOnTarget: number;
}

/**
 * A bookmaker quote for a player-prop market. `isBoosted` must be true for
 * "player over 0.5 goals" to ever appear as a candidate per the product spec
 * — un-boosted player-goal markets are not supported in the MVP.
 */
export interface PlayerPropOdds {
  id: string;
  matchId: string;
  playerId: string;
  marketKey: "player_over_0_5_goals" | "player_shot_on_target";
  bookmaker: string;
  odds: number;
  impliedProbability: number;
  isBoosted: boolean;
  /** The bookmaker's regular (non-boosted) price for the same market, when `isBoosted`. */
  normalOdds?: number;
  /** Mock max stake the boost applies to, in the user's currency, when `isBoosted`. */
  maxStake?: number;
  /** Mock boost terms text, when `isBoosted`. */
  terms?: string;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Bet builder (single match, multiple legs)
// ---------------------------------------------------------------------------

/** One leg inside a bet-builder combination, referencing a priced recommendation. */
export interface BetBuilderLeg {
  marketKey: MarketKey;
  marketLabel: string;
  selection?: string;
  estimatedProbability: number;
  odds: number;
}

/**
 * A calculated bet-builder combination. Legs from the SAME match are usually
 * correlated (e.g. "over 1.5 goals" + "both teams combined over 0.5 goals"),
 * so naively multiplying probabilities understates the true joint probability
 * and the combined market odds overstate the payout. `hiddenRisk` surfaces
 * that gap to the user instead of hiding it.
 */
export interface BetBuilderSummary {
  matchId: string;
  legs: BetBuilderLeg[];
  /** Naive product of independent leg probabilities — a lower bound when legs are correlated. */
  naiveCombinedProbability: number;
  /** Combined bookmaker odds (product of leg odds). */
  combinedOdds: number;
  /** 1 / combinedOdds. */
  combinedImpliedProbability: number;
  /** naiveCombinedProbability - combinedImpliedProbability. */
  edge: number;
  /** Explanation of why correlated legs make the naive probability unreliable. */
  hiddenRisk: string[];
}

// ---------------------------------------------------------------------------
// Streak builder (multiple legs across matches)
// ---------------------------------------------------------------------------

/** One leg selected into a cross-match streak. */
export interface StreakLeg {
  matchId: string;
  marketKey: MarketKey;
  marketLabel: string;
  selection?: string;
  estimatedProbability: number;
  odds: number;
  riskLevel: RiskLevel;
  dataConfidence: DataConfidence;
}

/**
 * Computed outcome of a multi-leg streak: each leg must win for the streak to
 * survive, and a single loss resets the bankroll progress to zero (or to the
 * last cashed-out point). This is intentionally framed around survival
 * probability, not "expected winnings" — the tool never promises profit.
 */
export interface StreakSummary {
  legs: StreakLeg[];
  /** Product of each leg's estimated probability — chance the WHOLE streak survives. */
  combinedSurvivalProbability: number;
  /** Product of each leg's decimal odds — the multiplier if every leg wins. */
  combinedOdds: number;
  /** Starting bankroll the user enters, in their chosen currency. */
  startingBankroll: number;
  /** startingBankroll * combinedOdds, assuming full stake-and-roll each leg. */
  projectedPayout: number;
  /** Whether a flat/partial staking strategy is flagged as lower-risk than full roll-over. */
  lowerRiskAlternativeSuggested: boolean;
  notes: string[];
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Standings & data sources
// ---------------------------------------------------------------------------

/**
 * Qualification context for a team within its group. Feeds the motivation
 * component of the risk score because team intent shifts late in a group.
 */
export type QualificationPressure =
  | "must_win"
  | "likely_needs_points"
  | "already_qualified"
  | "already_eliminated"
  | "in_contention";

/** A single row of a group standings table. */
export interface GroupStanding {
  teamId: string;
  groupLetter: GroupLetter;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** 1-based position within the group. */
  position: number;
  qualificationPressure: QualificationPressure;
}

// ---------------------------------------------------------------------------
// User-tunable scoring weights (Settings page)
// ---------------------------------------------------------------------------

/**
 * User-adjustable weights for the value-score formula and app-wide thresholds.
 * Recent/tournament form, market hit-rate, motivation and lineup-confidence
 * weights are blended into a single "probability weight" because those
 * factors are already combined upstream into `estimatedProbability` by the
 * scoring engine — the slider scales how much that headline probability
 * counts toward the value score, relative to edge/variance/confidence.
 */
export interface ScoringSettings {
  recentFormWeight: number;
  tournamentFormWeight: number;
  oddsValueWeight: number;
  marketHitRateWeight: number;
  motivationWeight: number;
  lineupConfidenceWeight: number;
  dataConfidenceWeight: number;
  streakSafetyWeight: number;
  /** Maximum bonus points a boosted market can add to its value score. */
  boostBonusCap: number;
  /** Candidates below this edge (0..1) are filtered out app-wide. */
  minEdgeThreshold: number;
  /** Candidates below this estimated probability (0..1) are filtered out app-wide. */
  minEstimatedProbabilityThreshold: number;
}

/** Pluggable real-world data feed (mocked in the MVP). See README. */
export interface DataSource {
  id: string;
  name: string;
  kind: "fixtures" | "results" | "match_stats" | "corners_cards" | "odds";
  /** Whether a live integration is wired up. Always false in the MVP. */
  connected: boolean;
  /** Baseline confidence the source contributes when used. */
  confidence: DataConfidence;
  description: string;
}
