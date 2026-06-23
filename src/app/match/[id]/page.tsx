import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MATCHES,
  computeGroupStandings,
  getMatch,
  getPlayerRecommendationsForMatch,
  getRecentStats,
  getRecommendationsForMatch,
  getTeam,
  getTournamentStats,
} from "@/data";
import { buildBetBuilderSummary } from "@/lib/betBuilder";
import type {
  Recommendation,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupTeam,
} from "@/types";
import { realisedHitRate } from "@/lib/markets";
import { ConfidenceBadge, PressureBadge, RiskBadge, StreakBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, odds, pct, shortDate, signedPct, stageLabel } from "@/lib/format";

export function generateStaticParams() {
  return MATCHES.map((m) => ({ id: m.id }));
}

export default function MatchDetailPage({ params }: { params: { id: string } }) {
  const match = getMatch(params.id);
  if (!match) notFound();

  const home = getTeam(match.homeTeam);
  const away = getTeam(match.awayTeam);
  const recs = getRecommendationsForMatch(match.id);
  const playerRecs = getPlayerRecommendationsForMatch(match.id);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">
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

      <ValueCandidates recs={recs} />

      <PlayerProps recs={playerRecs} />

      <BetBuilder matchId={match.id} recs={recs} playerRecs={playerRecs} />

      <TeamComparison home={home} away={away} />

      {match.groupLetter && <GroupContext match={match} />}

      <div className="grid gap-6 md:grid-cols-2">
        <RecentForm team={home} />
        <RecentForm team={away} />
      </div>

      <HitRates home={home} away={away} />

      <DisclaimerFootnote />
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
      <div className="card border-emerald-700/50 bg-emerald-950/20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-emerald-300">
            Top value candidate
          </span>
          <RiskBadge level={best.riskLevel} />
          <ConfidenceBadge level={best.dataConfidence} />
          <StreakBadge level={best.streakSuitability} />
        </div>
        <p className="mt-2 text-xl font-semibold text-white">{best.marketLabel}</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
          <span>Est. probability: <strong className="text-white">{pct(best.estimatedProbability)}</strong></span>
          <span>Odds: <strong className="text-white">{odds(best.odds)}</strong></span>
          <span>Implied: {pct(best.impliedProbability)}</span>
          <span className={best.edge >= 0 ? "text-emerald-300" : "text-rose-300"}>
            Edge: {signedPct(best.edge)}
          </span>
          <span>Value score: <strong className="text-white">{best.valueScore}</strong>/100</span>
        </div>
        {best.trapWarning && (
          <p className="mt-2 text-xs text-amber-300">⚠️ {best.trapWarning}</p>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
          {best.rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border border-pitch-700">
        <table className="data w-full min-w-[760px]">
          <thead className="bg-pitch-800">
            <tr>
              <th className="th">Market</th>
              <th className="th">Est. prob.</th>
              <th className="th">Odds</th>
              <th className="th">Implied</th>
              <th className="th">Edge</th>
              <th className="th">Value</th>
              <th className="th">Risk</th>
              <th className="th">Confidence</th>
              <th className="th">Streak fit</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((r) => (
              <tr key={r.marketKey + (r.selection ?? "")}>
                <td className="td">{r.marketLabel}</td>
                <td className="td font-medium text-white">{pct(r.estimatedProbability)}</td>
                <td className="td">{odds(r.odds)}</td>
                <td className="td text-zinc-400">{pct(r.impliedProbability)}</td>
                <td className={`td ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {signedPct(r.edge)}
                </td>
                <td className="td text-zinc-300">{r.valueScore}</td>
                <td className="td"><RiskBadge level={r.riskLevel} /></td>
                <td className="td"><ConfidenceBadge level={r.dataConfidence} /></td>
                <td className="td"><StreakBadge level={r.streakSuitability} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
              {r.rate === null ? "—" : pct(r.rate)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function num(v: number): string {
  return v.toFixed(2);
}
