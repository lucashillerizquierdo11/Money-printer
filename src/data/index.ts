/**
 * Central mock data store + selectors for the World Cup Streak Value Finder.
 *
 * All World Cup-only. This module assembles the deterministic mock dataset once
 * and exposes typed selectors the pages consume. Replace the generators behind
 * here with real API calls (same shapes) to go live — see the README.
 */

import type {
  GroupLetter,
  OddsSnapshot,
  PlayerPropOdds,
  Recommendation,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
} from "@/types";
import {
  buildRecommendations,
  bestRecommendation,
  type ScoringContext,
} from "@/lib/scoring";
import { buildPlayerGoalRecommendation } from "@/lib/playerProps";
import { standingForTeam } from "@/lib/standings";
import { generateData, generateRecentStats } from "./generate";
import { PLAYERS, getPlayer } from "./players";
import { TEAMS, getTeam } from "./teams";

export { TEAMS, GROUPS, getTeam, getTeamSafe } from "./teams";
export { DATA_SOURCES } from "./sources";
export { PLAYERS, getPlayer } from "./players";

// --- Build the dataset once -----------------------------------------------

const DATA = generateData();

const RECENT_STATS: Record<string, TeamRecentMatchStats> = Object.fromEntries(
  TEAMS.map((team) => [team.id, generateRecentStats(team)]),
);

const TOURNAMENT_STATS: Record<string, TeamTournamentStats> =
  Object.fromEntries(DATA.tournamentStats.map((s) => [s.teamId, s]));

export const MATCHES: WorldCupMatch[] = DATA.matches;
export const ODDS: OddsSnapshot[] = DATA.odds;
export const PLAYER_ODDS: PlayerPropOdds[] = DATA.playerOdds;

// --- Basic selectors ------------------------------------------------------

export function getMatch(id: string): WorldCupMatch | undefined {
  return MATCHES.find((m) => m.id === id);
}

export function getUpcomingMatches(): WorldCupMatch[] {
  return MATCHES.filter((m) => m.status === "scheduled").sort(byKickoff);
}

export function getCompletedMatches(): WorldCupMatch[] {
  return MATCHES.filter((m) => m.status === "complete").sort(byKickoff);
}

export function getGroupMatches(letter: GroupLetter): WorldCupMatch[] {
  return MATCHES.filter(
    (m) => m.stage === "group" && m.groupLetter === letter,
  ).sort(byKickoff);
}

export function getRecentStats(teamId: string): TeamRecentMatchStats {
  return RECENT_STATS[teamId];
}

export function getTournamentStats(teamId: string): TeamTournamentStats {
  return TOURNAMENT_STATS[teamId];
}

export function getOddsForMatch(matchId: string): OddsSnapshot[] {
  return ODDS.filter((o) => o.matchId === matchId);
}

export function getPlayerOddsForMatch(matchId: string): PlayerPropOdds[] {
  return PLAYER_ODDS.filter((o) => o.matchId === matchId);
}

function byKickoff(a: WorldCupMatch, b: WorldCupMatch): number {
  return a.kickoffTime.localeCompare(b.kickoffTime);
}

// --- Scoring selectors ----------------------------------------------------

/** Assemble the full scoring context for a match (or null if unknown). */
export function buildScoringContext(matchId: string): ScoringContext | null {
  const match = getMatch(matchId);
  if (!match) return null;
  const homeTeam = getTeam(match.homeTeam);
  const awayTeam = getTeam(match.awayTeam);
  return {
    match,
    homeTeam,
    awayTeam,
    homeRecent: getRecentStats(homeTeam.id),
    awayRecent: getRecentStats(awayTeam.id),
    homeTournament: getTournamentStats(homeTeam.id),
    awayTournament: getTournamentStats(awayTeam.id),
    homeStanding: standingForTeam(homeTeam.id, match.groupLetter, MATCHES),
    awayStanding: standingForTeam(awayTeam.id, match.groupLetter, MATCHES),
    odds: getOddsForMatch(matchId),
  };
}

/** Team-market recommendations only (no player props), best value first. */
export function getRecommendationsForMatch(matchId: string): Recommendation[] {
  const ctx = buildScoringContext(matchId);
  return ctx ? buildRecommendations(ctx) : [];
}

/**
 * Player-prop recommendations for a match. Per spec, "player over 0.5 goals"
 * only ever surfaces when a boosted-odds quote exists.
 */
export function getPlayerRecommendationsForMatch(matchId: string): Recommendation[] {
  const quotes = getPlayerOddsForMatch(matchId).filter(
    (q) => q.marketKey === "player_over_0_5_goals" && q.isBoosted,
  );
  return quotes
    .map((q) => {
      const player = getPlayer(q.playerId);
      return player ? buildPlayerGoalRecommendation(player, q) : null;
    })
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => b.valueScore - a.valueScore);
}

/** All value candidates for a match: team markets + boosted player props. */
export function getAllRecommendationsForMatch(matchId: string): Recommendation[] {
  return [...getRecommendationsForMatch(matchId), ...getPlayerRecommendationsForMatch(matchId)].sort(
    (a, b) => b.valueScore - a.valueScore,
  );
}

export function getBestRecommendation(matchId: string): Recommendation | null {
  const ctx = buildScoringContext(matchId);
  const teamBest = ctx ? bestRecommendation(ctx) : null;
  const playerBest = getPlayerRecommendationsForMatch(matchId)[0] ?? null;
  if (!teamBest) return playerBest;
  if (!playerBest) return teamBest;
  return playerBest.valueScore > teamBest.valueScore ? playerBest : teamBest;
}

/** Players eligible for a given match (on either roster). */
export function getEligiblePlayers(matchId: string) {
  const match = getMatch(matchId);
  if (!match) return [];
  return PLAYERS.filter((p) => p.teamId === match.homeTeam || p.teamId === match.awayTeam);
}

/**
 * Days of rest a team has had since its last completed World Cup match,
 * relative to a given kickoff. Returns null if the team hasn't played yet
 * in the tournament (no completed match to measure from).
 */
export function getRestDays(teamId: string, beforeKickoffIso: string): number | null {
  const before = new Date(beforeKickoffIso).getTime();
  const played = MATCHES.filter(
    (m) =>
      m.status === "complete" &&
      (m.homeTeam === teamId || m.awayTeam === teamId) &&
      new Date(m.kickoffTime).getTime() < before,
  );
  if (played.length === 0) return null;
  const lastKickoff = played.reduce(
    (latest, m) => Math.max(latest, new Date(m.kickoffTime).getTime()),
    0,
  );
  return Math.round((before - lastKickoff) / (1000 * 60 * 60 * 24));
}

/** Every value candidate (team markets + boosted player props) across all upcoming matches. */
export function getAllUpcomingRecommendations(): Recommendation[] {
  return getUpcomingMatches().flatMap((m) => getAllRecommendationsForMatch(m.id));
}

export { computeAllStandings, computeGroupStandings } from "@/lib/standings";
