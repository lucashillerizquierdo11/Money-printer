import Link from "next/link";
import {
  getBestRecommendation,
  getTeam,
  getUpcomingMatches,
} from "@/data";
import type { WorldCupMatch } from "@/types";
import { RiskBadge, ConfidenceBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, odds, pct, signedPct, stageLabel } from "@/lib/format";

export default function DashboardPage() {
  const upcoming = getUpcomingMatches();
  const groupMatches = upcoming.filter((m) => m.stage === "group");
  const knockoutMatches = upcoming.filter((m) => m.stage !== "group");

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-white">Upcoming World Cup Matches</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Compare relatively low-risk betting markets per game. The headline pick
          is an <em>estimated safer pick</em> — never a guaranteed bet.
        </p>
      </section>

      <MatchTable title="Group Stage" matches={groupMatches} />
      <MatchTable title="Knockout Stage" matches={knockoutMatches} />

      <DisclaimerFootnote />
    </div>
  );
}

function MatchTable({ title, matches }: { title: string; matches: WorldCupMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">
        {title}{" "}
        <span className="text-sm font-normal text-zinc-500">
          ({matches.length} matches)
        </span>
      </h2>
      <div className="overflow-x-auto rounded-xl border border-pitch-700">
        <table className="data w-full min-w-[900px]">
          <thead className="bg-pitch-800">
            <tr>
              <th className="th">Date / time</th>
              <th className="th">Stage</th>
              <th className="th">Match</th>
              <th className="th">Best low-risk market</th>
              <th className="th">Est. prob.</th>
              <th className="th">Odds</th>
              <th className="th">Implied</th>
              <th className="th">Edge</th>
              <th className="th">Risk</th>
              <th className="th">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatchRow({ match }: { match: WorldCupMatch }) {
  const home = getTeam(match.homeTeam);
  const away = getTeam(match.awayTeam);
  const rec = getBestRecommendation(match.id);

  const selectionTeam =
    rec?.selection && rec.marketKey === "team_to_score_over_0_5"
      ? getTeam(rec.selection).name
      : undefined;

  return (
    <tr>
      <td className="td whitespace-nowrap text-zinc-300">{kickoff(match.kickoffTime)}</td>
      <td className="td whitespace-nowrap text-zinc-300">
        {stageLabel(match.stage, match.groupLetter)}
      </td>
      <td className="td whitespace-nowrap">
        <Link href={`/match/${match.id}`} className="text-emerald-300 hover:underline">
          {home.flag} {home.name} v {away.name} {away.flag}
        </Link>
      </td>
      <td className="td">
        {rec ? (
          <span>
            {rec.marketLabel}
            {selectionTeam ? ` — ${selectionTeam}` : ""}
          </span>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </td>
      <td className="td font-medium text-white">{rec ? pct(rec.estimatedProbability) : "—"}</td>
      <td className="td">{rec ? odds(rec.odds) : "—"}</td>
      <td className="td text-zinc-400">{rec ? pct(rec.impliedProbability) : "—"}</td>
      <td className={`td font-medium ${edgeColor(rec?.edge)}`}>
        {rec ? signedPct(rec.edge) : "—"}
      </td>
      <td className="td">{rec ? <RiskBadge level={rec.riskLevel} /> : "—"}</td>
      <td className="td">{rec ? <ConfidenceBadge level={rec.dataConfidence} /> : "—"}</td>
    </tr>
  );
}

function edgeColor(edge?: number): string {
  if (edge === undefined) return "";
  if (edge > 0.01) return "text-emerald-300";
  if (edge < -0.01) return "text-rose-300";
  return "text-zinc-300";
}
