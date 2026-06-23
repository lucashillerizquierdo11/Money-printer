/**
 * Central mock data store + selectors for the World Cup SafeBet Dashboard.
 *
 * All World Cup-only. This module assembles the deterministic mock dataset once
 * and exposes typed selectors the pages consume. Replace the generators behind
 * here with real API calls (same shapes) to go live — see the README.
 */

import type {
  GroupLetter,
  OddsSnapshot,
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
import { standingForTeam } from "@/lib/standings";
import { generateData, generateRecentStats } from "./generate";
import { TEAMS, getTeam } from "./teams";

export { TEAMS, GROUPS, getTeam, getTeamSafe } from "./teams";
export { DATA_SOURCES } from "./sources";

// --- Build the dataset once -----------------------------------------------

const DATA = generateData();

const RECENT_STATS: Record<string, TeamRecentMatchStats> = Object.fromEntries(
  TEAMS.map((team) => [team.id, generateRecentStats(team)]),
);

const TOURNAMENT_STATS: Record<string, TeamTournamentStats> =
  Object.fromEntries(DATA.tournamentStats.map((s) => [s.teamId, s]));

export const MATCHES: WorldCupMatch[] = DATA.matches;
export const ODDS: OddsSnapshot[] = DATA.odds;

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

export function getRecommendationsForMatch(matchId: string): Recommendation[] {
  const ctx = buildScoringContext(matchId);
  return ctx ? buildRecommendations(ctx) : [];
}

export function getBestRecommendation(matchId: string): Recommendation | null {
  const ctx = buildScoringContext(matchId);
  return ctx ? bestRecommendation(ctx) : null;
}

export { computeAllStandings, computeGroupStandings } from "@/lib/standings";
