import type { Recommendation } from "@/types";
import { RiskBadge, RecommendationBadge, StreakBadge } from "@/components/badges";
import { recommendationLabelOf } from "@/lib/value";
import { expectedValue } from "@/lib/probability";
import { odds as fmtOdds, pct, signedPct } from "@/lib/format";

/**
 * Generic market-evaluation table: Market / Odds / Implied % / Estimated % /
 * Edge / EV / Risk / Streak score / Recommendation. Used by the dashboard and
 * anywhere else a flat list of priced markets needs the full picture.
 */
export function MarketEvaluationTable({ rows }: { rows: Recommendation[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">No candidates match your filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-pitch-700">
      <table className="data w-full min-w-[900px]">
        <thead className="bg-pitch-800">
          <tr>
            <th className="th">Market</th>
            <th className="th">Odds</th>
            <th className="th">Implied %</th>
            <th className="th">Estimated %</th>
            <th className="th">Edge</th>
            <th className="th">EV</th>
            <th className="th">Risk</th>
            <th className="th">Streak score</th>
            <th className="th">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ev = expectedValue(r.odds, r.estimatedProbability);
            const recommendation = recommendationLabelOf({
              estimatedProbability: r.estimatedProbability,
              edge: r.edge,
              dataConfidence: r.dataConfidence,
              valueScore: r.valueScore,
            });
            return (
              <tr key={`${r.matchId}:${r.marketKey}:${r.selection ?? ""}`}>
                <td className="td whitespace-nowrap">
                  {r.marketLabel}
                  {r.isBoosted ? " 🚀" : ""}
                </td>
                <td className="td">{fmtOdds(r.odds)}</td>
                <td className="td text-zinc-400">{pct(r.impliedProbability, 1)}</td>
                <td className="td font-medium text-white">{pct(r.estimatedProbability, 1)}</td>
                <td className={`td font-medium ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {signedPct(r.edge)}
                </td>
                <td className={`td ${ev >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signedPct(ev)}</td>
                <td className="td"><RiskBadge level={r.riskLevel} /></td>
                <td className="td"><StreakBadge level={r.streakSuitability} /></td>
                <td className="td"><RecommendationBadge level={recommendation} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
