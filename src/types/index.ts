/**
 * World Cup SafeBet Dashboard — Core data model.
 *
 * SCOPE: FIFA World Cup ONLY. These types intentionally model national-team
 * tournament football (groups, knockout stages, qualification pressure) and do
 * NOT support clubs, domestic leagues, or other competitions in this MVP.
 *
 * Every interface here is "database-ready": it uses primitive/serializable
 * fields and string ids so it can map directly onto SQL tables or a document
 * store when a real data source is connected later (see README).
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

/** Category groups for the supported low-risk markets. */
export type MarketCategory =
  | "goals"
  | "corners"
  | "cards"
  | "team_goals"
  | "result";

/** Stable keys for every market supported in the MVP. */
export type MarketKey =
  | "over_0_5_goals"
  | "over_1_5_goals"
  | "over_5_5_corners"
  | "over_6_5_corners"
  | "over_0_5_cards"
  | "over_1_5_cards"
  | "team_to_score_over_0_5"
  | "double_chance"
  | "draw_no_bet"
  | "1x2";

/** Definition of a betting market the dashboard can analyse. */
export interface Market {
  key: MarketKey;
  label: string;
  category: MarketCategory;
  /** Numeric line where relevant (e.g. 0.5, 5.5). */
  line?: number;
  /**
   * Whether this market is part of the "safer pick" focus. 1X2 is shown for
   * context only and is intentionally NOT a safe-bet focus market.
   */
  isSafeFocus: boolean;
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

/** Discrete risk buckets shown to the user. */
export type RiskLevel = "low" | "medium" | "high";

/** Confidence in the underlying data feeding a recommendation. */
export type DataConfidence = "high" | "medium" | "low";

/**
 * A model-estimated "safer pick" for a single match + market.
 * NOTE: this is research output, never a guarantee. UI must use language such
 * as "estimated safer pick" and surface the research disclaimer.
 */
export interface Recommendation {
  matchId: string;
  marketKey: MarketKey;
  marketLabel: string;
  selection?: string;
  /** Model probability the market hits, 0..1. */
  estimatedProbability: number;
  /** Decimal odds used. */
  odds: number;
  /** Bookmaker implied probability, 0..1. */
  impliedProbability: number;
  /** estimatedProbability - impliedProbability. */
  edge: number;
  riskLevel: RiskLevel;
  dataConfidence: DataConfidence;
  /** Human-readable factors behind the estimate. */
  rationale: string[];
}

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
