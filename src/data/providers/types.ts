/**
 * Pluggable data-provider abstraction.
 *
 * The app's normalized model lives in `@/types`. A *provider* knows how to
 * supply some subset of that model — fixtures, results, match stats,
 * corners/cards, odds, player-prop odds — from a particular source (a real
 * HTTP API, or the built-in deterministic mock generators).
 *
 * Adding a new API later is intentionally a small, local change: implement
 * `StatsProvider`, declare which `DataKind`s it `covers`, and register it in
 * `providers/index.ts`. Nothing else in the app needs to know where the data
 * came from — every provider returns the same TypeScript shapes.
 */

import type {
  OddsSnapshot,
  PlayerPropOdds,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupGroup,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";

/** The categories of data a provider can supply, mirroring `DataSource.kind`. */
export type DataKind =
  | "fixtures"
  | "results"
  | "match_stats"
  | "corners_cards"
  | "odds"
  | "player_odds";

/**
 * How a provider contributes to the merged dataset:
 *  - "graph"        supplies the entity graph (teams + matches, usually with
 *                   stats and/or odds). Used as the base to score against.
 *  - "odds-overlay" supplies only odds, matched onto an existing graph by team
 *                   name. Useful to drop sharper prices onto a stats source.
 */
export type ProviderRole = "graph" | "odds-overlay";

export interface ProviderMeta {
  /** Stable id, also the value accepted by the `DATA_PROVIDER` env var. */
  id: string;
  name: string;
  role: ProviderRole;
  /** Which data kinds this provider is able to supply. */
  covers: DataKind[];
  /**
   * Whether the provider is ready to use right now (e.g. its API key is set).
   * The mock provider is always configured; real ones depend on env vars.
   */
  isConfigured: boolean;
  description: string;
  /** Link to the provider's API docs, for the data-sources page. */
  docsUrl?: string;
}

/**
 * A partial slice of the normalized model. A provider only fills the slices
 * it `covers`; the resolver merges these over the mock baseline so the app
 * always has a complete, coherent dataset to render.
 */
export interface ProviderDataset {
  teams?: WorldCupTeam[];
  groups?: WorldCupGroup[];
  matches?: WorldCupMatch[];
  recentStats?: Record<string, TeamRecentMatchStats>;
  tournamentStats?: TeamTournamentStats[];
  odds?: OddsSnapshot[];
  playerOdds?: PlayerPropOdds[];
}

export interface StatsProvider {
  meta: ProviderMeta;
  /**
   * Fetch the slices this provider covers. May throw on a hard failure
   * (network, auth, bad payload) — the resolver catches and falls back to
   * mock, so callers never have to handle provider errors themselves.
   */
  load(): Promise<ProviderDataset>;
}
