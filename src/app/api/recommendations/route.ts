/**
 * GET /api/recommendations — the "potential bets" feed.
 *
 * Runs the scoring pipeline against the active provider composition and
 * returns the honest feed shape (see src/lib/feed.ts): provider info, live/
 * demo/configured flags, real-data flags, warnings/errors, counts and the
 * scored matches. Mock data only appears when demo mode is enabled, and is
 * always flagged `demo` — it is never silently presented as real bets.
 */

import { NextResponse } from "next/server";
import { loadDataset } from "@/data/providers";
import { buildFeedMatches, datasetHasMarketData, type DatasetQuality } from "@/lib/datasetScoring";
import type { FeedPayload } from "@/lib/feed";

// Recompute provider selection per request; inner provider fetches still cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const { dataset, status } = await loadDataset();

  const { corners, cards } = datasetHasMarketData(dataset);
  const quality: DatasetQuality = {
    demo: status.demo,
    statsReal: status.statsReal,
    oddsReal: status.oddsReal,
    hasCornersData: status.demo ? true : corners,
    hasCardsData: status.demo ? true : cards,
    fixturesProvider: status.provider.id,
  };

  const matches = status.live || status.demo ? buildFeedMatches(dataset, quality) : [];
  const recommendationCount = matches.reduce((acc, m) => acc + m.recommendations.length, 0);

  const payload: FeedPayload = {
    provider: {
      id: status.provider.id,
      name: status.provider.name,
      role: status.provider.role,
      covers: status.provider.covers,
      missingKinds: status.provider.missingKinds,
    },
    live: status.live,
    demo: status.demo,
    configured: status.configured,
    lastUpdated: status.lastUpdated,
    warnings: status.warnings,
    errors: status.errors,
    flags: {
      oddsReal: status.oddsReal,
      fixturesReal: status.fixturesReal,
      statsReal: status.statsReal,
    },
    counts: {
      fixtures: status.fixtureCount,
      odds: status.oddsCount,
      recommendations: recommendationCount,
    },
    matches,
  };

  return NextResponse.json(payload);
}
