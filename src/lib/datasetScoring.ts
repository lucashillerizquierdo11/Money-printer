/**
 * Run the scoring engine over a normalized `ProviderDataset` (live or mock)
 * and turn it into the honest "potential bets" feed.
 *
 * Beyond running the same `buildRecommendations` pipeline as the mock data,
 * this layer enforces honesty for live data:
 *  - confidence is capped LOW when stats are estimated/missing;
 *  - corners/cards markets can't be strong candidates without real
 *    corners/cards data;
 *  - "positive edge" is reported separately from "recommended" (a strong
 *    candidate also needs acceptable confidence, risk and real odds);
 *  - every recommendation carries a plain-English explanation and a
 *    source breakdown.
 */

import type { ProviderDataset } from "@/data/providers";
import { buildRecommendations } from "@/lib/scoring";
import { recommendationLabelOf } from "@/lib/value";
import type { FeedMatch, FeedRecommendation, SourceBreakdown } from "@/lib/feed";
import type {
  DataConfidence,
  Recommendation,
  RecommendationLabel,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";

export interface DatasetMatchRecommendations {
  match: WorldCupMatch;
  recommendations: Recommendation[];
}

/** What the dataset can actually back up, used to gate confidence + labels. */
export interface DatasetQuality {
  demo: boolean;
  statsReal: boolean;
  oddsReal: boolean;
  hasCornersData: boolean;
  hasCardsData: boolean;
  /** Provider id behind the fixtures. */
  fixturesProvider: string;
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

/** Build raw recommendations for every scheduled match in a dataset. */
export function recommendationsFromDataset(dataset: ProviderDataset): DatasetMatchRecommendations[] {
  const teamsById = new Map<string, WorldCupTeam>((dataset.teams ?? []).map((t) => [t.id, t]));
  const recent = dataset.recentStats ?? {};
  const tournamentById = new Map<string, TeamTournamentStats>(
    (dataset.tournamentStats ?? []).map((s) => [s.teamId, s]),
  );
  const oddsByMatch = new Map<string, NonNullable<ProviderDataset["odds"]>>();
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

function isCornersMarket(key: string): boolean {
  return key.includes("corner");
}
function isCardsMarket(key: string): boolean {
  return key.includes("card");
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function signedPct(v: number): string {
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s} pp` : `${s} pp`;
}

type StatsKind = SourceBreakdown["stats"];

function enrichRecommendation(rec: Recommendation, quality: DatasetQuality): FeedRecommendation {
  const corners = isCornersMarket(rec.marketKey);
  const cards = isCardsMarket(rec.marketKey);

  // --- Confidence gating ---
  let confidence: DataConfidence = rec.dataConfidence;
  const dataNotes: string[] = [];
  let statsKind: StatsKind;

  if (quality.demo) {
    statsKind = "mock";
  } else if ((corners && !quality.hasCornersData) || (cards && !quality.hasCardsData)) {
    confidence = "low";
    statsKind = "none";
    dataNotes.push(
      corners
        ? "No real corner data is available yet, so this estimate is weak."
        : "No real card data is available yet, so this estimate is weak.",
    );
  } else if (!quality.statsReal) {
    confidence = "low";
    statsKind = "estimated";
    dataNotes.push("Few or no completed fixtures yet — stats are estimated and confidence is capped low.");
  } else {
    statsKind = "real";
  }

  // --- Recommendation label, gated by confidence/odds ---
  let label: RecommendationLabel = recommendationLabelOf({
    estimatedProbability: rec.estimatedProbability,
    edge: rec.edge,
    dataConfidence: confidence,
    valueScore: rec.valueScore,
  });
  if (label === "strong_candidate" && confidence === "low") label = "consider";
  if (!quality.oddsReal && !quality.demo && (label === "consider" || label === "strong_candidate")) {
    label = "watch";
  }

  const positiveEdge = rec.edge > 0;

  // --- Explanation ---
  const verdict =
    !positiveEdge
      ? "No edge versus the offered price — not a value candidate."
      : label === "strong_candidate"
        ? "Positive edge with acceptable confidence and risk — a potential value candidate."
        : label === "consider"
          ? "Positive edge, but confidence or risk holds it back — a positive-edge candidate worth reviewing."
          : "Positive edge but low confidence — needs review before acting.";

  const sentences: string[] = [
    `Estimated probability ${pct(rec.estimatedProbability)} vs bookmaker-implied ${pct(rec.impliedProbability)} → ${signedPct(rec.edge)} edge.`,
  ];
  if (statsKind === "real") sentences.push("Estimate uses real recent and tournament results for both teams.");
  else if (statsKind === "mock") sentences.push("Demo data — illustrative only, not a real recommendation.");
  sentences.push(...dataNotes);
  sentences.push(verdict);
  sentences.push(`Risk rated ${rec.riskLevel} from the estimated probability and the size of the edge.`);
  if (rec.bookmaker) sentences.push(`Odds from ${rec.bookmaker}.`);

  const sourceBreakdown: SourceBreakdown = {
    fixtures: quality.fixturesProvider,
    odds: rec.bookmaker ?? (quality.demo ? "mock" : "none"),
    stats: statsKind,
  };

  return {
    marketKey: rec.marketKey,
    marketLabel: rec.marketLabel,
    selection: rec.selection,
    bookmaker: rec.bookmaker,
    odds: rec.odds,
    impliedProbability: rec.impliedProbability,
    estimatedProbability: rec.estimatedProbability,
    edge: rec.edge,
    valueScore: rec.valueScore,
    riskLevel: rec.riskLevel,
    dataConfidence: confidence,
    streakSuitability: rec.streakSuitability,
    recommendationLabel: label,
    positiveEdge,
    explanation: sentences.join(" "),
    sourceBreakdown,
    isBoosted: rec.isBoosted,
    isDemo: quality.demo || undefined,
  };
}

/** Build the dashboard/streak feed matches from a dataset + its quality flags. */
export function buildFeedMatches(dataset: ProviderDataset, quality: DatasetQuality): FeedMatch[] {
  const teamsById = new Map<string, WorldCupTeam>((dataset.teams ?? []).map((t) => [t.id, t]));
  const scored = recommendationsFromDataset(dataset)
    .slice()
    .sort((a, b) => a.match.kickoffTime.localeCompare(b.match.kickoffTime));

  return scored.map(({ match, recommendations }) => {
    const home = teamsById.get(match.homeTeam);
    const away = teamsById.get(match.awayTeam);
    const enriched = recommendations
      .map((r) => enrichRecommendation(r, quality))
      .sort((a, b) => b.valueScore - a.valueScore);
    return {
      id: match.id,
      homeName: home?.name ?? match.homeTeam,
      homeFlag: home?.flag ?? "🏳️",
      awayName: away?.name ?? match.awayTeam,
      awayFlag: away?.flag ?? "🏳️",
      kickoffTime: match.kickoffTime,
      stage: match.stage,
      groupLetter: match.groupLetter,
      linkable: true,
      recommendations: enriched,
    };
  });
}

/** Whether a dataset has any real corners/cards data among its finished matches. */
export function datasetHasMarketData(dataset: ProviderDataset): { corners: boolean; cards: boolean } {
  let corners = false;
  let cards = false;
  for (const m of dataset.matches ?? []) {
    if (m.totalCorners != null) corners = true;
    if (m.totalCards != null) cards = true;
    if (corners && cards) break;
  }
  return { corners, cards };
}
