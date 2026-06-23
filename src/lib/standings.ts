/**
 * Group standings + qualification-pressure logic.
 *
 * Qualification pressure captures team motivation, which the scoring model uses
 * because intent shifts late in a group: teams chasing points tend to attack,
 * already-qualified teams may rotate, and eliminated teams can switch off.
 */

import type {
  GroupLetter,
  GroupStanding,
  QualificationPressure,
  WorldCupMatch,
} from "@/types";
import { GROUPS } from "@/data/teams";

/** Group-stage matchdays in the format (each team plays 3 group games). */
const GROUP_MATCHDAYS = 3;

/** Build the full standings table for one group from its completed matches. */
export function computeGroupStandings(
  groupLetter: GroupLetter,
  matches: WorldCupMatch[],
): GroupStanding[] {
  const group = GROUPS.find((g) => g.letter === groupLetter);
  if (!group) return [];

  const rows = new Map<string, GroupStanding>();
  for (const teamId of group.teamIds) {
    rows.set(teamId, {
      teamId,
      groupLetter,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      position: 0,
      qualificationPressure: "in_contention",
    });
  }

  const groupMatches = matches.filter(
    (m) =>
      m.stage === "group" &&
      m.groupLetter === groupLetter &&
      m.status === "complete" &&
      m.homeScore !== undefined &&
      m.awayScore !== undefined,
  );

  for (const m of groupMatches) {
    const home = rows.get(m.homeTeam);
    const away = rows.get(m.awayTeam);
    if (!home || !away) continue;
    const hs = m.homeScore!;
    const as = m.awayScore!;
    home.played++; away.played++;
    home.goalsFor += hs; home.goalsAgainst += as;
    away.goalsFor += as; away.goalsAgainst += hs;
    if (hs > as) {
      home.wins++; home.points += 3; away.losses++;
    } else if (hs < as) {
      away.wins++; away.points += 3; home.losses++;
    } else {
      home.draws++; away.draws++; home.points++; away.points++;
    }
  }

  const standings = [...rows.values()].map((r) => ({
    ...r,
    goalDifference: r.goalsFor - r.goalsAgainst,
  }));

  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor,
  );

  const matchesRemaining = GROUP_MATCHDAYS - maxPlayed(standings);
  standings.forEach((row, i) => {
    row.position = i + 1;
    row.qualificationPressure = pressureFor(row, standings, matchesRemaining);
  });

  return standings;
}

function maxPlayed(standings: GroupStanding[]): number {
  return standings.reduce((max, r) => Math.max(max, r.played), 0);
}

/**
 * Classify a team's qualification pressure. In the 12-group format the top two
 * of each group advance, plus the best third-placed sides — so 2nd is "safe-ish"
 * and 3rd is "in contention". Thresholds are deliberately simple for the MVP.
 */
function pressureFor(
  row: GroupStanding,
  standings: GroupStanding[],
  matchesRemaining: number,
): QualificationPressure {
  const maxRemainingPoints = matchesRemaining * 3;
  const leaderPoints = standings[0].points;
  const secondPoints = standings[1]?.points ?? 0;

  // Already qualified: cannot be caught for a top-2 place.
  const thirdPoints = standings[2]?.points ?? 0;
  if (row.position <= 2 && row.points > thirdPoints + maxRemainingPoints) {
    return "already_qualified";
  }
  // Already eliminated: cannot reach a top-3 spot even winning out.
  if (row.points + maxRemainingPoints < thirdPoints && row.position >= 3) {
    return "already_eliminated";
  }
  if (matchesRemaining === 0) {
    // Final standings: 1–2 qualify, 3 in contention via best-third, 4 out.
    if (row.position <= 2) return "already_qualified";
    if (row.position === 3) return "likely_needs_points";
    return "already_eliminated";
  }
  // Must win: bottom half and trailing the qualification line.
  if (row.position >= 3 && row.points < secondPoints) {
    return row.points + maxRemainingPoints <= leaderPoints
      ? "must_win"
      : "likely_needs_points";
  }
  if (row.position <= 2) return "likely_needs_points";
  return "in_contention";
}

/** Convenience: standings for every group. */
export function computeAllStandings(
  matches: WorldCupMatch[],
): Record<GroupLetter, GroupStanding[]> {
  const out = {} as Record<GroupLetter, GroupStanding[]>;
  for (const group of GROUPS) {
    out[group.letter] = computeGroupStandings(group.letter, matches);
  }
  return out;
}

/** Look up a single team's standing row (or undefined if not group stage). */
export function standingForTeam(
  teamId: string,
  groupLetter: GroupLetter | undefined,
  matches: WorldCupMatch[],
): GroupStanding | undefined {
  if (!groupLetter) return undefined;
  return computeGroupStandings(groupLetter, matches).find(
    (r) => r.teamId === teamId,
  );
}

export const PRESSURE_LABELS: Record<QualificationPressure, string> = {
  must_win: "Must win",
  likely_needs_points: "Likely needs points",
  already_qualified: "Already qualified",
  already_eliminated: "Already eliminated",
  in_contention: "In contention",
};
