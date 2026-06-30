/**
 * Dataset merge + stat derivation.
 *
 * The resolver turns whatever the active provider returns into a single,
 * coherent `ProviderDataset` to score against:
 *  - a "graph" provider (teams + matches) becomes the base; any missing
 *    recent/tournament stats are derived from its own finished matches, and
 *    odds/player-odds default to empty when it doesn't supply them.
 *  - an "odds-overlay" provider's odds are matched onto the mock baseline
 *    graph by team name, so real prices ride on top of the mock stats.
 */

import type {
  OddsSnapshot,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";
import type { ProviderDataset } from "./types";

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Normalize a team name for fuzzy cross-provider matching ("United States" ~ "usa"). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function matchKey(homeName: string, awayName: string): string {
  return `${normalizeName(homeName)}@${normalizeName(awayName)}`;
}

/**
 * Build last-5-style recent form and current-tournament stats for every team
 * purely from a set of (finished) matches. Used when a real graph provider
 * supplies fixtures/results but not pre-aggregated stats. Per-team corners and
 * cards are approximated as half the match total, since match records only
 * carry combined totals.
 */
export function deriveTeamStats(
  matches: WorldCupMatch[],
  teams: WorldCupTeam[],
): { recentStats: Record<string, TeamRecentMatchStats>; tournamentStats: TeamTournamentStats[] } {
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const finished = matches
    .filter((m) => m.status === "complete" && m.homeScore !== undefined && m.awayScore !== undefined)
    .sort((a, b) => b.kickoffTime.localeCompare(a.kickoffTime));

  const recentStats: Record<string, TeamRecentMatchStats> = {};
  const tournamentStats: TeamTournamentStats[] = [];

  for (const team of teams) {
    const games = finished.filter((m) => m.homeTeam === team.id || m.awayTeam === team.id);

    // --- Tournament aggregate (all finished games) ---
    let tGF = 0, tGA = 0, tCornersFor = 0, tCornersAgainst = 0, tCardsFor = 0, tCardsAgainst = 0;
    for (const m of games) {
      const isHome = m.homeTeam === team.id;
      const gf = (isHome ? m.homeScore : m.awayScore) ?? 0;
      const ga = (isHome ? m.awayScore : m.homeScore) ?? 0;
      const halfCorners = (m.totalCorners ?? 0) / 2;
      const halfCards = (m.totalCards ?? 0) / 2;
      tGF += gf; tGA += ga;
      tCornersFor += halfCorners; tCornersAgainst += halfCorners;
      tCardsFor += halfCards; tCardsAgainst += halfCards;
    }
    const played = games.length;
    const p = Math.max(1, played);
    tournamentStats.push({
      teamId: team.id,
      matchesPlayed: played,
      goalsFor: tGF,
      goalsAgainst: tGA,
      cornersFor: Math.round(tCornersFor),
      cornersAgainst: Math.round(tCornersAgainst),
      cardsFor: Math.round(tCardsFor),
      cardsAgainst: Math.round(tCardsAgainst),
      avgTotalGoals: round1((tGF + tGA) / p),
      avgTotalCorners: round1((tCornersFor + tCornersAgainst) / p),
      avgTotalCards: round1((tCardsFor + tCardsAgainst) / p),
    });

    // --- Recent form (last 5 finished games) ---
    const last5 = games.slice(0, 5).map((m) => {
      const isHome = m.homeTeam === team.id;
      const goalsFor = (isHome ? m.homeScore : m.awayScore) ?? 0;
      const goalsAgainst = (isHome ? m.awayScore : m.homeScore) ?? 0;
      const totalCorners = m.totalCorners ?? 0;
      const totalCards = m.totalCards ?? 0;
      const oppId = isHome ? m.awayTeam : m.homeTeam;
      return {
        opponent: nameById.get(oppId) ?? oppId,
        date: m.kickoffTime.slice(0, 10),
        goalsFor,
        goalsAgainst,
        corners: Math.round(totalCorners / 2),
        cards: Math.round(totalCards / 2),
        shotsFor: 0,
        shotsOnTarget: 0,
        totalCorners,
        totalCards,
        result: (goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D") as "W" | "D" | "L",
      };
    });

    const n = Math.max(1, last5.length);
    const sum = (fn: (m: (typeof last5)[number]) => number) => last5.reduce((acc, m) => acc + fn(m), 0);
    recentStats[team.id] = {
      teamId: team.id,
      matches: last5,
      avgGoalsFor: round1(sum((m) => m.goalsFor) / n),
      avgGoalsAgainst: round1(sum((m) => m.goalsAgainst) / n),
      avgTotalGoals: round1(sum((m) => m.goalsFor + m.goalsAgainst) / n),
      avgCornersFor: round1(sum((m) => m.corners) / n),
      avgCornersAgainst: round1(sum((m) => m.corners) / n),
      avgTotalCorners: round1(sum((m) => m.totalCorners) / n),
      avgCardsFor: round1(sum((m) => m.cards) / n),
      avgCardsAgainst: round1(sum((m) => m.cards) / n),
      avgTotalCards: round1(sum((m) => m.totalCards) / n),
      avgShotsFor: 0,
      avgShotsOnTarget: 0,
      cleanSheets: last5.filter((m) => m.goalsAgainst === 0).length,
      failedToScore: last5.filter((m) => m.goalsFor === 0).length,
    };
  }

  return { recentStats, tournamentStats };
}

/** Use a live entity graph as the base, deriving any stats it didn't supply. */
export function buildGraphDataset(live: ProviderDataset): ProviderDataset {
  const teams = live.teams ?? [];
  const matches = live.matches ?? [];
  const needsStats = !live.recentStats || !live.tournamentStats;
  const derived = needsStats ? deriveTeamStats(matches, teams) : null;
  return {
    teams,
    groups: live.groups,
    matches,
    recentStats: live.recentStats ?? derived!.recentStats,
    tournamentStats: live.tournamentStats ?? derived!.tournamentStats,
    odds: live.odds ?? [],
    playerOdds: live.playerOdds ?? [],
  };
}

/**
 * Overlay an odds-only provider's prices onto a base entity graph (the mock
 * baseline, or a real graph from another provider), matching the overlay's
 * odds to base matches by normalized team name. The overlay must carry minimal
 * `matches` + `teams` so we can recover each odds row's team names. Returns a
 * new dataset; the base's stats/fixtures are untouched.
 */
export function overlayOdds(base: ProviderDataset, live: ProviderDataset): ProviderDataset {
  const overlayTeamName = new Map((live.teams ?? []).map((t) => [t.id, t.name]));
  const overlayMatch = new Map((live.matches ?? []).map((m) => [m.id, m]));

  // Group overlay odds by normalized (home@away) key.
  const oddsByKey = new Map<string, OddsSnapshot[]>();
  for (const o of live.odds ?? []) {
    const m = overlayMatch.get(o.matchId);
    if (!m) continue;
    const homeName = overlayTeamName.get(m.homeTeam) ?? m.homeTeam;
    const awayName = overlayTeamName.get(m.awayTeam) ?? m.awayTeam;
    const key = matchKey(homeName, awayName);
    const list = oddsByKey.get(key) ?? [];
    list.push(o);
    oddsByKey.set(key, list);
  }

  const baseTeamName = new Map((base.teams ?? []).map((t) => [t.id, t.name]));
  const mergedOdds: OddsSnapshot[] = [];
  for (const m of base.matches ?? []) {
    if (m.status !== "scheduled") continue;
    const homeName = baseTeamName.get(m.homeTeam) ?? m.homeTeam;
    const awayName = baseTeamName.get(m.awayTeam) ?? m.awayTeam;
    const overlay = oddsByKey.get(matchKey(homeName, awayName)) ?? [];
    const overlaidKeys = new Set(overlay.map((o) => `${o.marketKey}:${o.selection ?? ""}`));
    // Re-point overlay odds at the base match id.
    for (const o of overlay) {
      mergedOdds.push({ ...o, matchId: m.id, id: `${m.id}:${o.marketKey}:overlay` });
    }
    // Keep base odds for markets the overlay didn't cover.
    for (const o of (base.odds ?? []).filter((b) => b.matchId === m.id)) {
      if (!overlaidKeys.has(`${o.marketKey}:${o.selection ?? ""}`)) mergedOdds.push(o);
    }
  }

  return { ...base, odds: mergedOdds };
}
