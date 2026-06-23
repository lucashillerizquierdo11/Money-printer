import type { Recommendation } from "@/types";
import { ConfidenceBadge } from "@/components/badges";
import { odds as fmtOdds, pct, signedPct } from "@/lib/format";

/**
 * Single-market recommendation card: market, odds, estimated probability,
 * edge, why it's recommended (rationale), main risks (trap warning + risk
 * rating), and data confidence.
 */
export function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold text-white">
          {rec.marketLabel}
          {rec.isBoosted ? " 🚀" : ""}
        </p>
        <ConfidenceBadge level={rec.dataConfidence} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
        <span>Odds: <strong className="text-white">{fmtOdds(rec.odds)}</strong></span>
        <span>Est. probability: <strong className="text-white">{pct(rec.estimatedProbability, 1)}</strong></span>
        <span className={rec.edge >= 0 ? "text-emerald-300" : "text-rose-300"}>Edge: {signedPct(rec.edge)}</span>
      </div>

      {rec.rationale.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Why it&apos;s recommended</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {rec.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Main risks</p>
        <p className="mt-1 text-sm text-zinc-300">
          {rec.riskLevel} risk
          {rec.trapWarning ? ` — ${rec.trapWarning}` : "."}
        </p>
      </div>
    </div>
  );
}
