/**
 * Mock player props — national team players only.
 *
 * Per the product spec, "player over 0.5 goals" only ever surfaces as a
 * candidate when a boosted-odds quote exists; "star player shot on target" is
 * an optional placeholder market with a thinner mock dataset.
 */

import type { PlayerPropOdds, WorldCupPlayer } from "@/types";

export const PLAYERS: WorldCupPlayer[] = [
  p("messi", "argentina", "Lionel Messi", "FW", 0.78, 1.9),
  p("mbappe", "france", "Kylian Mbappé", "FW", 0.81, 2.4),
  p("kane", "england", "Harry Kane", "FW", 0.72, 1.8),
  p("vinicius", "brazil", "Vinícius Júnior", "FW", 0.66, 2.1),
  p("haaland-nor", "norway", "Erling Haaland", "FW", 0.88, 2.0),
  p("lewandowski-pol", "poland", "Robert Lewandowski", "FW", 0.7, 1.7),
  p("musiala", "germany", "Jamal Musiala", "MF", 0.5, 1.6),
  p("son", "south-korea", "Son Heung-min", "FW", 0.6, 1.9),
];

function p(
  id: string,
  teamId: string,
  name: string,
  position: WorldCupPlayer["position"],
  avgGoalsPerMatch: number,
  avgShotsOnTarget: number,
): WorldCupPlayer {
  return { id, teamId, name, position, avgGoalsPerMatch, avgShotsOnTarget };
}

const BOOKMAKERS = ["SafeBook", "OddsHub", "LineMaster"];

/**
 * Generate mock player-prop odds for a match where at least one PLAYERS entry
 * belongs to the home or away team. Goal markets are only marked boosted ~40%
 * of the time, matching the "boosted only" rule — un-boosted quotes are
 * generated too so the UI can demonstrate why they're filtered out.
 */
export function generatePlayerOdds(
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  rand: () => number,
): PlayerPropOdds[] {
  const eligible = PLAYERS.filter(
    (pl) => pl.teamId === homeTeamId || pl.teamId === awayTeamId,
  );
  const odds: PlayerPropOdds[] = [];

  for (const player of eligible) {
    const fairGoalProb = clamp(1 - Math.exp(-player.avgGoalsPerMatch), 0.05, 0.95);
    const isBoosted = rand() < 0.4;
    // Boosted lines are nudged toward the bettor (lower bookmaker margin, sometimes below fair).
    const margin = isBoosted ? 1 + rand() * 0.02 - 0.01 : 1 + 0.05 + rand() * 0.06;
    const bookProb = clamp(fairGoalProb * margin, 0.03, 0.97);
    const goalOdds = round2(1 / bookProb);

    odds.push({
      id: `${matchId}:player_over_0_5_goals:${player.id}`,
      matchId,
      playerId: player.id,
      marketKey: "player_over_0_5_goals",
      bookmaker: BOOKMAKERS[Math.floor(rand() * BOOKMAKERS.length)],
      odds: goalOdds,
      impliedProbability: round3(1 / goalOdds),
      isBoosted,
      capturedAt: new Date().toISOString(),
    });

    const fairShotProb = clamp(1 - Math.exp(-player.avgShotsOnTarget * 0.7), 0.1, 0.97);
    const shotOdds = round2(1 / clamp(fairShotProb * (1 + 0.06), 0.05, 0.97));
    odds.push({
      id: `${matchId}:player_shot_on_target:${player.id}`,
      matchId,
      playerId: player.id,
      marketKey: "player_shot_on_target",
      bookmaker: BOOKMAKERS[Math.floor(rand() * BOOKMAKERS.length)],
      odds: shotOdds,
      impliedProbability: round3(1 / shotOdds),
      isBoosted: false,
      capturedAt: new Date().toISOString(),
    });
  }

  return odds;
}

export function getPlayer(id: string): WorldCupPlayer | undefined {
  return PLAYERS.find((pl) => pl.id === id);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
