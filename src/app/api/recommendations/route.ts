/**
 * GET /api/recommendations
 *
 * Server route that runs the scoring pipeline against the *active* data
 * provider and returns ranked recommendations per upcoming match. The
 * dashboard fetches this so its edge/EV columns reflect live data when an API
 * is configured, and falls back to the built-in mock otherwise.
 *
 * - Mock active        → reuse the existing mock selectors (exact parity with
 *                        the previous synchronous dashboard).
 * - Live provider OK   → score the merged live dataset.
 * - Live but unpriced  → fall back to mock payload with an explanatory note,
 *                        so the dashboard is never left empty.
 */

import { NextResponse } from "next/server";
import { loadDataset } from "@/data/providers";
import { recommendationsFromDataset } from "@/lib/datasetScoring";
import { getAllRecommendationsForMatch, getTeam, getUpcomingMatches } from "@/data";
import type { Recommendation, WorldCupMatch, WorldCupTeam } from "@/types";

// Always recompute provider selection per request; the inner provider fetches
// still cache/revalidate on their own (see each provider's `next.revalidate`).
export const dynamic = "force-dynamic";

interface MatchRow {
  id: string;
  homeName: string;
  homeFlag: string;
  awayName: string;
  awayFlag: string;
  kickoffTime: string;
  stage: string;
  groupLetter?: string;
  /** Whether a /match/[id] detail page exists for this id (mock ids only). */
  linkable: boolean;
  recommendations: Recommendation[];
}

function mockPayload(note?: string) {
  const matches: MatchRow[] = getUpcomingMatches().map((m) => {
    const home = getTeam(m.homeTeam);
    const away = getTeam(m.awayTeam);
    return {
      id: m.id,
      homeName: home.name,
      homeFlag: home.flag,
      awayName: away.name,
      awayFlag: away.flag,
      kickoffTime: m.kickoffTime,
      stage: m.stage,
      groupLetter: m.groupLetter,
      linkable: true,
      recommendations: getAllRecommendationsForMatch(m.id),
    };
  });
  return {
    provider: { id: "mock", name: "Built-in mock generators", role: "graph" as const },
    live: false,
    note,
    matches,
  };
}

export async function GET() {
  const { dataset, activeProvider, live, error } = await loadDataset();

  if (!live) {
    // Mock active, or a live provider that failed — serve mock for parity.
    return NextResponse.json(mockPayload(error ? `Live fetch failed: ${error}` : undefined));
  }

  const scored = recommendationsFromDataset(dataset);
  const totalRecs = scored.reduce((acc, s) => acc + s.recommendations.length, 0);
  if (totalRecs === 0) {
    return NextResponse.json(
      mockPayload(
        `${activeProvider.name} returned fixtures but no priced markets the model can score — showing mock data. Add an odds source (e.g. API-Football or The Odds API) for live edges.`,
      ),
    );
  }

  const teamsById = new Map<string, WorldCupTeam>((dataset.teams ?? []).map((t) => [t.id, t]));
  const upcoming = scored
    .slice()
    .sort((a, b) => a.match.kickoffTime.localeCompare(b.match.kickoffTime));

  const matches: MatchRow[] = upcoming.map(({ match, recommendations }: { match: WorldCupMatch; recommendations: Recommendation[] }) => {
    const home = teamsById.get(match.homeTeam);
    const away = teamsById.get(match.awayTeam);
    return {
      id: match.id,
      homeName: home?.name ?? match.homeTeam,
      homeFlag: home?.flag ?? "🏳️",
      awayName: away?.name ?? match.awayTeam,
      awayFlag: away?.flag ?? "🏳️",
      kickoffTime: match.kickoffTime,
      stage: match.stage,
      groupLetter: match.groupLetter,
      linkable: false,
      recommendations,
    };
  });

  return NextResponse.json({
    provider: { id: activeProvider.id, name: activeProvider.name, role: activeProvider.role },
    live: true,
    matches,
  });
}
