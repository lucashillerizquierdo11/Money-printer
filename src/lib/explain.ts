/**
 * Human-readable explanation generator for the Match detail "Explanation
 * panel" — turns a Recommendation's numbers into a sentence in the same
 * structure as the product spec's example:
 *
 *   "Over 5.5 corners is a candidate because both teams' recent matches
 *   average 10.8 total corners, the market hit in 8 of their combined last
 *   10 games, and the offered odds imply 72.5%. Estimated probability is
 *   81%, giving +8.5 percentage-point edge. Risk remains medium because
 *   knockout/group pressure may reduce tempo."
 */

import type { Recommendation, TeamRecentMatchStats } from "@/types";
import { MARKETS, teamHitRate } from "./markets";

function combinedAvgTotal(rec: Recommendation, home: TeamRecentMatchStats, away: TeamRecentMatchStats): number | null {
  switch (rec.marketKey) {
    case "over_0_5_goals":
    case "over_1_5_goals":
    case "both_teams_combined_over_0_5":
      return round1((home.avgTotalGoals + away.avgTotalGoals) / 2);
    case "over_5_5_corners":
    case "over_6_5_corners":
      return round1((home.avgTotalCorners + away.avgTotalCorners) / 2);
    case "over_0_5_cards":
    case "over_1_5_cards":
      return round1((home.avgTotalCards + away.avgTotalCards) / 2);
    default:
      return null;
  }
}

function combinedHitCount(rec: Recommendation, home: TeamRecentMatchStats, away: TeamRecentMatchStats): number | null {
  const homeRate = teamHitRate(home, rec.marketKey);
  const awayRate = teamHitRate(away, rec.marketKey);
  if (homeRate === null || awayRate === null) return null;
  return Math.round(homeRate * home.matches.length + awayRate * away.matches.length);
}

function combinedSampleSize(home: TeamRecentMatchStats, away: TeamRecentMatchStats): number {
  return home.matches.length + away.matches.length;
}

/** Builds a 2-3 sentence plain-English explanation for one recommendation. */
export function buildExplanation(
  rec: Recommendation,
  home: TeamRecentMatchStats,
  away: TeamRecentMatchStats,
  stagePhase: "group" | "knockout",
): string {
  const noun = MARKETS[rec.marketKey].label;
  const verdict = rec.edge > 0 ? "is a candidate" : "is not a candidate";
  const avgTotal = combinedAvgTotal(rec, home, away);
  const hitCount = combinedHitCount(rec, home, away);
  const sampleSize = combinedSampleSize(home, away);

  const reasons: string[] = [];
  if (avgTotal !== null) {
    const metric = rec.marketKey.includes("corner")
      ? "total corners"
      : rec.marketKey.includes("card")
        ? "total cards"
        : "total goals";
    reasons.push(`both teams' recent matches average ${avgTotal} ${metric}`);
  }
  if (hitCount !== null) {
    reasons.push(`the market hit in ${hitCount} of their combined last ${sampleSize} games`);
  }
  reasons.push(`the offered odds imply ${pct(rec.impliedProbability)}`);

  const sentence1 = `${noun} ${verdict} because ${joinReasons(reasons)}.`;
  const sentence2 = `Estimated probability is ${pct(rec.estimatedProbability)}, giving ${signedPct(rec.edge)} edge.`;

  const tempoNote =
    stagePhase === "knockout"
      ? "knockout caution may reduce tempo"
      : "group-stage motivation can push tempo either way";
  const sentence3 = `Risk remains ${rec.riskLevel} because ${tempoNote}.`;

  return [sentence1, sentence2, sentence3].join(" ");
}

function joinReasons(reasons: string[]): string {
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function signedPct(v: number): string {
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s} percentage-point` : `${s} percentage-point`;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
