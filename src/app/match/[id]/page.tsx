import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MATCHES,
  buildScoringContext,
  computeGroupStandings,
  getMatch,
  getPlayerRecommendationsForMatch,
  getRecentStats,
  getRecommendationsForMatch,
  getRestDays,
  getTeam,
  getTournamentStats,
} from "@/data";
import { buildBetBuilderSummary } from "@/lib/betBuilder";
import { buildExplanation } from "@/lib/explain";
import { motivationAdjustment } from "@/lib/scoring";
import type {
  Recommendation,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";
import { realisedHitRate, teamHitRate, tournamentHitRateForMarket } from "@/lib/markets";
import { PressureBadge, RecommendationBadge, RiskBadge, StreakBadge, ConfidenceBadge } from "@/components/badges";
import { recommendationLabelOf } from "@/lib/value";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { RecommendationCard } from "@/components/RecommendationCard";
import { MarketEvaluationTable } from "@/components/MarketEvaluationTable";
import { CardsTrendChart, CornersTrendChart, GoalsTrendChart } from "@/components/charts/TrendCharts";
import { MarketHitRateChart } from "@/components/charts/MarketHitRateChart";
import { kickoff, odds, pct, shortDate, signedPct, stageLabel } from "@/lib/format";
import { loadDataset, type DatasetStatus, type ProviderDataset } from "@/data/providers";
import { buildFeedMatches, datasetHasMarketData, type DatasetQuality } from "@/lib/datasetScoring";
import type { FeedMatch } from "@/lib/feed";

export function generateStaticParams() {
  return MATCHES.map((m) => ({ id: m.id }));
}

// Allow live fixture ids (not in the mock set) to render on demand.
export const dynamicParams = true;
export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const { dataset, status } = await loadDataset();
  const liveMatch = (dataset.matches ?? []).find((m) => m.id === params.id);
  const mockMatch = getMatch(params.id);

  if (status.live && liveMatch) {
    return <LiveMatchDetail match={liveMatch} dataset={dataset} status={status} />;
  }
  if (!status.live && mockMatch) {
    return <MockMatchDetail match={mockMatch} demo={status.demo} />;
  }
  notFound();
}

// --- Live match detail ------------------------------------------------------

function LiveMatchDetail({
  match,
  dataset,
  status,
}: {
  match: WorldCupMatch;
  dataset: ProviderDataset;
  status: DatasetStatus;
}) {
  const teamsById = new Map((dataset.teams ?? []).map((t) => [t.id, t]));
  const home = teamsById.get(match.homeTeam);
  const away = teamsById.get(match.awayTeam);
  const { corners, cards } = datasetHasMarketData(dataset);
  const quality: DatasetQuality = {
    demo: false,
    statsReal: status.statsReal,
    oddsReal: status.oddsReal,
    hasCornersData: corners,
    hasCardsData: cards,
    fixturesProvider: status.provider.id,
  };
  const feedMatch: FeedMatch | undefined = buildFeedMatches(dataset, quality).find((m) => m.id === match.id);
  const recs = feedMatch?.recommendations ?? [];
  const homeRecent = dataset.recentStats?.[match.homeTeam];
  const awayRecent = dataset.recentStats?.[match.awayTeam];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">← Back to dashboard</Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {home?.flag} {home?.name ?? match.homeTeam} <span className="text-zinc-500">v</span>{" "}
          {away?.name ?? match.awayTeam} {away?.flag}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {stageLabel(match.stage, match.groupLetter)} · {kickoff(match.kickoffTime)}
          {match.venue ? ` · ${match.venue}` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        Live data via {status.provider.name}.
        {!status.statsReal && " Stats are estimated (few/no completed fixtures yet), so confidence is capped low."}
      </div>
      {status.warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-300">⚠️ {w}</p>
      ))}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Potential value candidates</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No priced markets the model can score for this fixture yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-pitch-700">
            <table className="data w-full min-w-[900px]">
              <thead className="bg-pitch-800">
                <tr>
                  <th className="th">Market</th>
                  <th className="th">Bookmaker</th>
                  <th className="th">Odds</th>
                  <th className="th">Implied</th>
                  <th className="th">Est. prob.</th>
                  <th className="th">Edge</th>
                  <th className="th">Risk</th>
                  <th className="th">Confidence</th>
                  <th className="th">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={`${r.marketKey}:${r.selection ?? ""}`} title={r.explanation}>
                    <td className="td">{r.marketLabel}</td>
                    <td className="td text-zinc-400">{r.bookmaker ?? "—"}</td>
                    <td className="td">{odds(r.odds)}</td>
                    <td className="td text-zinc-400">{pct(r.impliedProbability, 1)}</td>
                    <td className="td font-medium text-white">{pct(r.estimatedProbability, 1)}</td>
                    <td className={`td ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signedPct(r.edge)}</td>
                    <td className="td"><RiskBadge level={r.riskLevel} /></td>
                    <td className="td"><ConfidenceBadge level={r.dataConfidence} /></td>
                    <td className="td"><RecommendationBadge level={r.recommendationLabel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Why these candidates</h2>
          <div className="space-y-3">
            {recs.slice(0, 6).map((r) => (
              <div key={`${r.marketKey}:${r.selection ?? ""}`} className="card">
                <p className="text-sm font-medium text-white">{r.marketLabel}</p>
                <p className="mt-1 text-sm text-zinc-300">{r.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(homeRecent?.matches.length || awayRecent?.matches.length) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Recent form trends</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {homeRecent && homeRecent.matches.length > 0 && (
              <GoalsTrendChart matches={homeRecent.matches} teamLabel={home?.name ?? "Home"} />
            )}
            {awayRecent && awayRecent.matches.length > 0 && (
              <GoalsTrendChart matches={awayRecent.matches} teamLabel={away?.name ?? "Away"} />
            )}
          </div>
        </section>
      )}

      <DisclaimerFootnote />
    </div>
  );
}

// --- Mock / demo match detail ----------------------------------------------

function MockMatchDetail({ match, demo }: { match: WorldCupMatch; demo: boolean }) {
  const home = getTeam(match.homeTeam);
  const away = getTeam(match.awayTeam);
  const recs = getRecommendationsForMatch(match.id);
  const playerRecs = getPlayerRecommendationsForMatch(match.id);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {home.flag} {home.name} <span className="text-zinc-500">v</span> {away.name}{" "}
          {away.flag}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {stageLabel(match.stage, match.groupLetter)} · {kickoff(match.kickoffTime)}
          {match.venue ? ` · ${match.venue}` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
        {demo
          ? "Demo data — illustrative mock numbers, not real betting recommendations."
          : "No live provider is configured, so this page shows built-in demo data. Add API keys to see real fixtures and odds."}
      </div>

      <MatchOverview match={match} home={home} away={away} />

      <ValueCandidates recs={recs} />

      <PlayerProps recs={playerRecs} />

      <BetBuilder matchId={match.id} recs={recs} playerRecs={playerRecs} />

      <TeamComparison home={home} away={away} />

      <TrendCharts home={home} away={away} />

      {match.groupLetter && <GroupContext match={match} />}

      <MarketAnalysis match={match} home={home} away={away} recs={recs} />

      <ExplanationPanel match={match} home={home} away={away} recs={recs} />

      <div className="grid gap-6 md:grid-cols-2">
        <RecentForm team={home} />
        <RecentForm team={away} />
      </div>

      <HitRates home={home} away={away} />

      <DisclaimerFootnote />
    </div>
  );
}

// --- Match overview ---------------------------------------------------------

function MatchOverview({
  match,
  home,
  away,
}: {
  match: WorldCupMatch;
  home: WorldCupTeam;
  away: WorldCupTeam;
}) {
  const ctx = buildScoringContext(match.id);
  const adj = ctx ? motivationAdjustment(ctx) : null;
  const homeRest = getRestDays(home.id, match.kickoffTime);
  const awayRest = getRestDays(away.id, match.kickoffTime);

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold text-white">Match overview</h2>
      <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
        <Overview label="Kickoff" value={kickoff(match.kickoffTime)} />
        <Overview label="Stage" value={stageLabel(match.stage, match.groupLetter)} />
        <Overview
          label="Qualification situation"
          value={
            ctx?.homeStanding && ctx?.awayStanding
              ? `${home.code}: ${PRESSURE_TEXT[ctx.homeStanding.qualificationPressure]} · ${away.code}: ${PRESSURE_TEXT[ctx.awayStanding.qualificationPressure]}`
              : "Not applicable (knockout stage)"
          }
        />
        <Overview
          label="Rest days"
          value={`${home.code}: ${homeRest ?? "first match"} · ${away.code}: ${awayRest ?? "first match"}`}
        />
        <Overview label="Venue" value={match.venue ?? "Not yet announced"} />
        <Overview label="Weather" value="Not yet available — connect a weather feed." />
      </div>
      {adj && adj.notes.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Motivation pressure</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {adj.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const PRESSURE_TEXT: Record<string, string> = {
  must_win: "must win",
  likely_needs_points: "likely needs points",
  already_qualified: "already qualified",
  already_eliminated: "already eliminated",
  in_contention: "in contention",
};

function Overview({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

// --- Value candidates ------------------------------------------------------

function ValueCandidates({ recs }: { recs: Recommendation[] }) {
  if (recs.length === 0) {
    return (
      <section className="card">
        <p className="text-sm text-zinc-400">
          This match has already been played — no upcoming markets to price.
        </p>
      </section>
    );
  }
  const [best, ...rest] = recs;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Value candidates</h2>
      <RecommendationCard rec={best} />
      <MarketEvaluationTable rows={rest} />
    </section>
  );
}

// --- Player props ----------------------------------------------------------

function PlayerProps({ recs }: { recs: Recommendation[] }) {
  if (recs.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Player props (boosted only)</h2>
      <p className="text-xs text-zinc-500">
        Per spec, a player-goal candidate only ever appears here when a bookmaker
        boost is active on that market — un-boosted player markets are never shown
        as candidates.
      </p>
      <div className="overflow-x-auto rounded-xl border border-pitch-700">
        <table className="data w-full min-w-[700px]">
          <thead className="bg-pitch-800">
            <tr>
              <th className="th">Market</th>
              <th className="th">Est. prob.</th>
              <th className="th">Odds</th>
              <th className="th">Edge</th>
              <th className="th">Value</th>
              <th className="th">Streak fit</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.marketKey + (r.selection ?? "")}>
                <td className="td">{r.marketLabel}</td>
                <td className="td font-medium text-white">{pct(r.estimatedProbability)}</td>
                <td className="td">{odds(r.odds)}</td>
                <td className={`td ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {signedPct(r.edge)}
                </td>
                <td className="td text-zinc-300">{r.valueScore}</td>
                <td className="td"><StreakBadge level={r.streakSuitability} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Bet builder -------------------------------------------------------------

function BetBuilder({
  matchId,
  recs,
  playerRecs,
}: {
  matchId: string;
  recs: Recommendation[];
  playerRecs: Recommendation[];
}) {
  const legs = [...recs, ...playerRecs].slice(0, 3);
  if (legs.length < 2) return null;
  const summary = buildBetBuilderSummary(matchId, legs);

  return (
    <section className="card space-y-2">
      <h2 className="text-lg font-semibold text-white">
        Example bet builder — top {legs.length} candidates combined
      </h2>
      <p className="text-xs text-zinc-500">
        Combining legs from the same match multiplies the odds, but the legs are
        often correlated — the naive combined probability below is optimistic,
        not a guarantee.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
        {summary.legs.map((l) => (
          <li key={l.marketKey + (l.selection ?? "")}>{l.marketLabel}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
        <span>
          Naive combined probability:{" "}
          <strong className="text-white">{pct(summary.naiveCombinedProbability)}</strong>
        </span>
        <span>Combined odds: <strong className="text-white">{odds(summary.combinedOdds)}</strong></span>
        <span>Combined implied: {pct(summary.combinedImpliedProbability)}</span>
        <span className={summary.edge >= 0 ? "text-emerald-300" : "text-rose-300"}>
          Edge: {signedPct(summary.edge)}
        </span>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-amber-300">
        {summary.hiddenRisk.map((w, i) => (
          <li key={i}>⚠️ {w}</li>
        ))}
      </ul>
    </section>
  );
}

// --- Market analysis --------------------------------------------------------

function MarketAnalysis({
  match,
  home,
  away,
  recs,
}: {
  match: WorldCupMatch;
  home: WorldCupTeam;
  away: WorldCupTeam;
  recs: Recommendation[];
}) {
  if (recs.length === 0) return null;
  const hr = getRecentStats(home.id);
  const ar = getRecentStats(away.id);
  const completed = MATCHES.filter(
    (m) =>
      m.status === "complete" &&
      (m.homeTeam === home.id || m.awayTeam === home.id || m.homeTeam === away.id || m.awayTeam === away.id),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Market analysis</h2>
      <div className="overflow-x-auto rounded-xl border border-pitch-700">
        <table className="data w-full min-w-[1200px]">
          <thead className="bg-pitch-800">
            <tr>
              <th className="th">Market</th>
              <th className="th">Hit rate {home.code} (last 5)</th>
              <th className="th">Hit rate {away.code} (last 5)</th>
              <th className="th">Tournament hit rate</th>
              <th className="th">Combined est. prob.</th>
              <th className="th">Odds</th>
              <th className="th">Implied</th>
              <th className="th">Edge</th>
              <th className="th">Variance rating</th>
              <th className="th">Streak fit</th>
              <th className="th">Final recommendation</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => {
              const homeRate = teamHitRate(hr, r.marketKey);
              const awayRate = teamHitRate(ar, r.marketKey);
              const tournamentRate = tournamentHitRateForMarket(completed, r.marketKey);
              return (
                <tr key={r.marketKey + (r.selection ?? "")}>
                  <td className="td whitespace-nowrap">{r.marketLabel}</td>
                  <td className="td">{homeRate === null ? "—" : pct(homeRate)}</td>
                  <td className="td">{awayRate === null ? "—" : pct(awayRate)}</td>
                  <td className="td">{tournamentRate === null ? "—" : pct(tournamentRate)}</td>
                  <td className="td font-medium text-white">{pct(r.estimatedProbability)}</td>
                  <td className="td">{odds(r.odds)}</td>
                  <td className="td text-zinc-400">{pct(r.impliedProbability)}</td>
                  <td className={`td ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signedPct(r.edge)}</td>
                  <td className="td"><RiskBadge level={r.riskLevel} /></td>
                  <td className="td"><StreakBadge level={r.streakSuitability} /></td>
                  <td className="td">
                    <RecommendationBadge
                      level={recommendationLabelOf({
                        estimatedProbability: r.estimatedProbability,
                        edge: r.edge,
                        dataConfidence: r.dataConfidence,
                        valueScore: r.valueScore,
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Stage context for this match: {stageLabel(match.stage, match.groupLetter)}.
      </p>
    </section>
  );
}

// --- Explanation panel -------------------------------------------------------

function ExplanationPanel({
  match,
  home,
  away,
  recs,
}: {
  match: WorldCupMatch;
  home: WorldCupTeam;
  away: WorldCupTeam;
  recs: Recommendation[];
}) {
  if (recs.length === 0) return null;
  const hr = getRecentStats(home.id);
  const ar = getRecentStats(away.id);
  const stagePhase = match.stage === "group" ? "group" : "knockout";

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Why these recommendations</h2>
      <div className="space-y-3">
        {recs.slice(0, 5).map((r) => (
          <div key={r.marketKey + (r.selection ?? "")} className="card">
            <p className="text-sm text-zinc-300">{buildExplanation(r, hr, ar, stagePhase)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Team comparison ------------------------------------------------------

function TeamComparison({ home, away }: { home: WorldCupTeam; away: WorldCupTeam }) {
  const hr = getRecentStats(home.id);
  const ar = getRecentStats(away.id);
  const ht = getTournamentStats(home.id);
  const at = getTournamentStats(away.id);

  const rows: [string, string, string][] = [
    ["FIFA ranking", `#${home.fifaRanking}`, `#${away.fifaRanking}`],
    ["Confederation", home.confederation, away.confederation],
    ["— Last 5 internationals —", "", ""],
    ["Avg goals for", num(hr.avgGoalsFor), num(ar.avgGoalsFor)],
    ["Avg goals against", num(hr.avgGoalsAgainst), num(ar.avgGoalsAgainst)],
    ["Total goals / match", num(hr.avgTotalGoals), num(ar.avgTotalGoals)],
    ["Avg corners for", num(hr.avgCornersFor), num(ar.avgCornersFor)],
    ["Avg corners against", num(hr.avgCornersAgainst), num(ar.avgCornersAgainst)],
    ["Total corners / match", num(hr.avgTotalCorners), num(ar.avgTotalCorners)],
    ["Avg cards for", num(hr.avgCardsFor), num(ar.avgCardsFor)],
    ["Avg cards against", num(hr.avgCardsAgainst), num(ar.avgCardsAgainst)],
    ["Total cards / match", num(hr.avgTotalCards), num(ar.avgTotalCards)],
    ["Clean sheets (last 5)", String(hr.cleanSheets), String(ar.cleanSheets)],
    ["Failed to score (last 5)", String(hr.failedToScore), String(ar.failedToScore)],
    ["Avg shots / match", num(hr.avgShotsFor), num(ar.avgShotsFor)],
    ["Avg shots on target / match", num(hr.avgShotsOnTarget), num(ar.avgShotsOnTarget)],
    ["xG / match", "Not yet available", "Not yet available"],
    ["— Current World Cup —", "", ""],
    ...tournamentRows(ht, at),
  ];

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Team comparison</h2>
      <div className="overflow-hidden rounded-xl border border-pitch-700">
        <table className="data w-full">
          <thead className="bg-pitch-800">
            <tr>
              <th className="th text-right">{home.flag} {home.name}</th>
              <th className="th text-center">Metric</th>
              <th className="th">{away.name} {away.flag}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, h, a], i) =>
              h === "" && a === "" ? (
                <tr key={i} className="bg-pitch-800/60">
                  <td className="td text-center text-xs uppercase tracking-wide text-zinc-500" colSpan={3}>
                    {label.replace(/—/g, "").trim()}
                  </td>
                </tr>
              ) : (
                <tr key={i}>
                  <td className="td text-right font-medium text-white">{h}</td>
                  <td className="td text-center text-zinc-400">{label}</td>
                  <td className="td font-medium text-white">{a}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function tournamentRows(
  ht: TeamTournamentStats,
  at: TeamTournamentStats,
): [string, string, string][] {
  if (ht.matchesPlayed === 0 && at.matchesPlayed === 0) {
    return [["Tournament data", "Not yet available", "Not yet available"]];
  }
  return [
    ["WC matches played", String(ht.matchesPlayed), String(at.matchesPlayed)],
    ["WC goals for", String(ht.goalsFor), String(at.goalsFor)],
    ["WC goals against", String(ht.goalsAgainst), String(at.goalsAgainst)],
    ["WC total goals / match", num(ht.avgTotalGoals), num(at.avgTotalGoals)],
    ["WC corners (for/against)", `${ht.cornersFor}/${ht.cornersAgainst}`, `${at.cornersFor}/${at.cornersAgainst}`],
    ["WC total corners / match", num(ht.avgTotalCorners), num(at.avgTotalCorners)],
    ["WC cards (for/against)", `${ht.cardsFor}/${ht.cardsAgainst}`, `${at.cardsFor}/${at.cardsAgainst}`],
    ["WC total cards / match", num(ht.avgTotalCards), num(at.avgTotalCards)],
  ];
}

// --- Trend charts ----------------------------------------------------------

function TrendCharts({ home, away }: { home: WorldCupTeam; away: WorldCupTeam }) {
  const hr = getRecentStats(home.id);
  const ar = getRecentStats(away.id);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Recent form trends</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <GoalsTrendChart matches={hr.matches} teamLabel={home.name} />
        <GoalsTrendChart matches={ar.matches} teamLabel={away.name} />
        <CornersTrendChart matches={hr.matches} teamLabel={home.name} />
        <CornersTrendChart matches={ar.matches} teamLabel={away.name} />
        <CardsTrendChart matches={hr.matches} teamLabel={home.name} />
        <CardsTrendChart matches={ar.matches} teamLabel={away.name} />
      </div>
    </section>
  );
}

// --- Group context --------------------------------------------------------

function GroupContext({ match }: { match: WorldCupMatch }) {
  const standings = computeGroupStandings(match.groupLetter!, MATCHES);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">
        Group {match.groupLetter} context
      </h2>
      <div className="overflow-x-auto rounded-xl border border-pitch-700">
        <table className="data w-full min-w-[640px]">
          <thead className="bg-pitch-800">
            <tr>
              <th className="th">#</th>
              <th className="th">Team</th>
              <th className="th">P</th>
              <th className="th">W</th>
              <th className="th">D</th>
              <th className="th">L</th>
              <th className="th">GF</th>
              <th className="th">GA</th>
              <th className="th">GD</th>
              <th className="th">Pts</th>
              <th className="th">Pressure</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => {
              const team = getTeam(row.teamId);
              const involved = row.teamId === match.homeTeam || row.teamId === match.awayTeam;
              return (
                <tr key={row.teamId} className={involved ? "bg-emerald-950/30" : ""}>
                  <td className="td">{row.position}</td>
                  <td className="td whitespace-nowrap">{team.flag} {team.name}</td>
                  <td className="td">{row.played}</td>
                  <td className="td">{row.wins}</td>
                  <td className="td">{row.draws}</td>
                  <td className="td">{row.losses}</td>
                  <td className="td">{row.goalsFor}</td>
                  <td className="td">{row.goalsAgainst}</td>
                  <td className="td">{row.goalDifference}</td>
                  <td className="td font-semibold text-white">{row.points}</td>
                  <td className="td"><PressureBadge level={row.qualificationPressure} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Recent form ----------------------------------------------------------

function RecentForm({ team }: { team: WorldCupTeam }) {
  const stats: TeamRecentMatchStats = getRecentStats(team.id);
  return (
    <section className="card">
      <h3 className="mb-3 font-semibold text-white">
        {team.flag} {team.name} — last 5 internationals
      </h3>
      <table className="data w-full">
        <thead>
          <tr>
            <th className="th">Date</th>
            <th className="th">Opponent</th>
            <th className="th">GF</th>
            <th className="th">GA</th>
            <th className="th">Cor</th>
            <th className="th">Cards</th>
            <th className="th">Res</th>
          </tr>
        </thead>
        <tbody>
          {stats.matches.map((m, i) => (
            <tr key={i}>
              <td className="td whitespace-nowrap text-zinc-400">{shortDate(m.date)}</td>
              <td className="td whitespace-nowrap">{m.opponent}</td>
              <td className="td">{m.goalsFor}</td>
              <td className="td">{m.goalsAgainst}</td>
              <td className="td">{m.corners}</td>
              <td className="td">{m.cards}</td>
              <td className="td">
                <span className={resultColor(m.result)}>{m.result}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function resultColor(r: "W" | "D" | "L"): string {
  return r === "W" ? "text-emerald-300" : r === "L" ? "text-rose-300" : "text-zinc-400";
}

// --- Hit rates ------------------------------------------------------------

function HitRates({ home, away }: { home: WorldCupTeam; away: WorldCupTeam }) {
  // Combine both teams' completed World Cup matches for realised hit rates.
  const completed = MATCHES.filter(
    (m) =>
      m.status === "complete" &&
      (m.homeTeam === home.id ||
        m.awayTeam === home.id ||
        m.homeTeam === away.id ||
        m.awayTeam === away.id),
  );

  const rows = [
    { label: "Over 0.5 goals", rate: realisedHitRate(completed, (m) => (m.totalGoals ?? 0) > 0.5) },
    { label: "Over 1.5 goals", rate: realisedHitRate(completed, (m) => (m.totalGoals ?? 0) > 1.5) },
    { label: "Over 5.5 corners", rate: realisedHitRate(completed, (m) => (m.totalCorners ?? 0) > 5.5) },
    { label: "Over 6.5 corners", rate: realisedHitRate(completed, (m) => (m.totalCorners ?? 0) > 6.5) },
    { label: "Over 0.5 cards", rate: realisedHitRate(completed, (m) => (m.totalCards ?? 0) > 0.5) },
    { label: "Over 1.5 cards", rate: realisedHitRate(completed, (m) => (m.totalCards ?? 0) > 1.5) },
  ];

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-white">Market hit rates</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Realised across {completed.length} completed World Cup matches involving
        either team. Past hit rates do not predict future results.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="card flex items-center justify-between">
            <span className="text-sm text-zinc-300">{r.label}</span>
            <span className="text-lg font-semibold text-white">
              {r.rate === null ? "—" : pct(r.rate, 1)}
            </span>
          </div>
        ))}
      </div>
      <MarketHitRateChart rows={rows.filter((r): r is { label: string; rate: number } => r.rate !== null)} />
    </section>
  );
}

function num(v: number): string {
  return v.toFixed(2);
}
