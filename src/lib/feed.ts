/**
 * Shared types for the /api/recommendations "potential bets" feed.
 *
 * These are the contract between the server route (which scores the active
 * provider's dataset) and the client surfaces that render it (dashboard,
 * streak builder, match detail). Everything here is plain JSON-serializable.
 *
 * Honesty rules encoded in the shape:
 *  - `live` vs `demo` are explicit and mutually exclusive; a candidate is only
 *    ever shown as real when it is backed by real odds (`flags.oddsReal`).
 *  - every recommendation carries its own `explanation` and `sourceBreakdown`
 *    so the UI can show exactly what data produced the number.
 */

import type {
  DataConfidence,
  RecommendationLabel,
  RiskLevel,
  StreakSuitability,
} from "@/types";
import type { DataKind } from "@/data/providers/types";

/** Where each part of a recommendation came from. */
export interface SourceBreakdown {
  /** Provider id that supplied the fixture. */
  fixtures: string;
  /** Bookmaker (or provider id) behind the odds, or "none". */
  odds: string;
  /** Quality of the stats behind the probability estimate. */
  stats: "real" | "estimated" | "mock" | "none";
}

export interface FeedRecommendation {
  marketKey: string;
  marketLabel: string;
  selection?: string;
  bookmaker?: string;
  odds: number;
  impliedProbability: number;
  estimatedProbability: number;
  edge: number;
  valueScore: number;
  riskLevel: RiskLevel;
  dataConfidence: DataConfidence;
  streakSuitability: StreakSuitability;
  recommendationLabel: RecommendationLabel;
  /** edge > 0 — separate from "recommended", which also needs confidence/risk. */
  positiveEdge: boolean;
  explanation: string;
  sourceBreakdown: SourceBreakdown;
  isBoosted?: boolean;
  /** True when this row is demo/mock data, never a real betting recommendation. */
  isDemo?: boolean;
}

export interface FeedMatch {
  id: string;
  homeName: string;
  homeFlag: string;
  awayName: string;
  awayFlag: string;
  kickoffTime: string;
  stage: string;
  groupLetter?: string;
  /** Whether a /match/[id] detail page can render for this id. */
  linkable: boolean;
  recommendations: FeedRecommendation[];
}

export interface FeedProviderInfo {
  id: string;
  name: string;
  role: string;
  covers: DataKind[];
  missingKinds: DataKind[];
}

export interface FeedFlags {
  /** Real bookmaker odds are in use. */
  oddsReal: boolean;
  /** Real fixtures (not mock) are in use. */
  fixturesReal: boolean;
  /** Probability estimates are backed by real results, not mock/empty data. */
  statsReal: boolean;
}

export interface FeedCounts {
  fixtures: number;
  odds: number;
  recommendations: number;
}

export interface FeedPayload {
  provider: FeedProviderInfo;
  /** A real provider's data is in use. */
  live: boolean;
  /** Mock/demo data is in use (explicitly enabled, clearly labeled). */
  demo: boolean;
  /** Any real provider is configured (has an API key). */
  configured: boolean;
  lastUpdated: string;
  warnings: string[];
  errors: string[];
  flags: FeedFlags;
  counts: FeedCounts;
  matches: FeedMatch[];
}
