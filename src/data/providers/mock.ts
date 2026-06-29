/**
 * Mock provider — wraps the deterministic generators in `src/data/generate.ts`.
 *
 * This is the always-available baseline: it covers every data kind so the app
 * is fully functional with zero configuration, and it is what every real
 * provider's output is merged over (a real fixtures feed overlays the mock
 * fixtures, while mock odds/stats keep filling the kinds that feed has no data
 * for). It is deterministic, so renders are stable and SSR-safe.
 */

import type { TeamRecentMatchStats } from "@/types";
import { generateData, generateRecentStats } from "../generate";
import { GROUPS, TEAMS } from "../teams";
import type { ProviderDataset, StatsProvider } from "./types";

export function buildMockDataset(): ProviderDataset {
  const data = generateData();
  const recentStats: Record<string, TeamRecentMatchStats> = Object.fromEntries(
    TEAMS.map((team) => [team.id, generateRecentStats(team)]),
  );
  return {
    teams: TEAMS,
    groups: GROUPS,
    matches: data.matches,
    recentStats,
    tournamentStats: data.tournamentStats,
    odds: data.odds,
    playerOdds: data.playerOdds,
  };
}

export const mockProvider: StatsProvider = {
  meta: {
    id: "mock",
    name: "Built-in mock generators",
    role: "graph",
    covers: ["fixtures", "results", "match_stats", "corners_cards", "odds", "player_odds"],
    isConfigured: true,
    description:
      "Deterministic, seeded mock data for the full 48-team World Cup — fixtures, results, last-5 form, tournament stats, odds and boosted player props. Always available, no API key required.",
  },
  async load() {
    return buildMockDataset();
  },
};
