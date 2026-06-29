/**
 * Run the scoring engine over a normalized `ProviderDataset` (live or mock),
 * rather than the hardcoded mock singletons in `@/data`. This is what lets a
 * live provider's fixtures/stats/odds flow through the exact same
 * `buildRecommendations` pipeline the mock data uses, so the dashboard's
 * edge/EV columns are computed identically regardless of source.
 *
 * Group standings (used only for the motivation nudge) are left undefined for
 * dataset scoring — they require the mock group definitions — so motivation
 * treats every side as still-motivated. The core probability/edge/EV math is
 * unaffected.
 */

import type { ProviderDataset } from "@/data/providers";
import { buildRecommendations } from "@/lib/scoring";
import type {
  Recommendation,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";

export interface DatasetMatchRecommendations {
  match: WorldCupMatch;
  recommendations: Recommendation[];
}

function emptyRecent(teamId: string): TeamRecentMatchStats {
  return {
    teamId,
    matches: [],
    avgGoalsFor: 0,
    avgGoalsAgainst: 0,
    avgTotalGoals: 0,
    avgCornersFor: 0,
    avgCornersAgainst: 0,
    avgTotalCorners: 0,
    avgCardsFor: 0,
    avgCardsAgainst: 0,
    avgTotalCards: 0,
    avgShotsFor: 0,
    avgShotsOnTarget: 0,
    cleanSheets: 0,
    failedToScore: 0,
  };
}

function emptyTournament(teamId: string): TeamTournamentStats {
  return {
    teamId,
    matchesPlayed: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cornersFor: 0,
    cornersAgainst: 0,
    cardsFor: 0,
    cardsAgainst: 0,
    avgTotalGoals: 0,
    avgTotalCorners: 0,
    avgTotalCards: 0,
  };
}

/** Build recommendations for every scheduled match in a dataset, best value first. */
export function recommendationsFromDataset(dataset: ProviderDataset): DatasetMatchRecommendations[] {
  const teamsById = new Map<string, WorldCupTeam>((dataset.teams ?? []).map((t) => [t.id, t]));
  const recent = dataset.recentStats ?? {};
  const tournamentById = new Map<string, TeamTournamentStats>(
    (dataset.tournamentStats ?? []).map((s) => [s.teamId, s]),
  );
  const oddsByMatch = new Map<string, typeof dataset.odds>();
  for (const o of dataset.odds ?? []) {
    const list = oddsByMatch.get(o.matchId) ?? [];
    list.push(o);
    oddsByMatch.set(o.matchId, list);
  }

  const out: DatasetMatchRecommendations[] = [];
  for (const match of dataset.matches ?? []) {
    if (match.status !== "scheduled") continue;
    const homeTeam = teamsById.get(match.homeTeam);
    const awayTeam = teamsById.get(match.awayTeam);
    if (!homeTeam || !awayTeam) continue;

    const recommendations = buildRecommendations({
      match,
      homeTeam,
      awayTeam,
      homeRecent: recent[homeTeam.id] ?? emptyRecent(homeTeam.id),
      awayRecent: recent[awayTeam.id] ?? emptyRecent(awayTeam.id),
      homeTournament: tournamentById.get(homeTeam.id) ?? emptyTournament(homeTeam.id),
      awayTournament: tournamentById.get(awayTeam.id) ?? emptyTournament(awayTeam.id),
      odds: oddsByMatch.get(match.id) ?? [],
    });

    out.push({ match, recommendations });
  }

  return out;
}
