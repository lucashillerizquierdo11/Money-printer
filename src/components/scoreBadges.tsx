/**
 * Numeric-threshold badges for the dashboard UI — distinct from the
 * enum-based badges in `badges.tsx` (RiskBadge/ConfidenceBadge there key off
 * the 3-tier RiskLevel/DataConfidence app types). These operate directly on
 * raw 0..1 probability/edge/confidence and 0..100 risk-score numbers per the
 * dashboard spec's exact colour-tier rules, so they live under their own
 * names to avoid colliding with the existing badges.
 */

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

/** 90%+ very high · 80–89% high · 70–79% medium · below 70% risky. */
export function ProbabilityBadge({ probability }: { probability: number }) {
  const pct = probability * 100;
  if (pct >= 90) return <Badge label="Very high" className="bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50" />;
  if (pct >= 80) return <Badge label="High" className="bg-sky-900/60 text-sky-200 ring-1 ring-sky-700/50" />;
  if (pct >= 70) return <Badge label="Medium" className="bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50" />;
  return <Badge label="Risky" className="bg-rose-900/60 text-rose-200 ring-1 ring-rose-700/50" />;
}

/** Edge >= +8% strong · +5% to +8% good · +2% to +5% small · <= 0 negative. */
export function EdgeBadge({ edge }: { edge: number }) {
  const pct = edge * 100;
  if (pct <= 0) return <Badge label="Negative edge" className="bg-rose-900/60 text-rose-200 ring-1 ring-rose-700/50" />;
  if (pct < 2) return <Badge label="Negligible edge" className="bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50" />;
  if (pct < 5) return <Badge label="Small edge" className="bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50" />;
  if (pct < 8) return <Badge label="Good edge" className="bg-sky-900/60 text-sky-200 ring-1 ring-sky-700/50" />;
  return <Badge label="Strong edge" className="bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50" />;
}

/** 0..100 risk score, 4 tiers: Low / Medium / High / Extreme. */
export function RiskScoreBadge({ score }: { score: number }) {
  if (score < 25) return <Badge label="Low risk" className="bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50" />;
  if (score < 50) return <Badge label="Medium risk" className="bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50" />;
  if (score < 75) return <Badge label="High risk" className="bg-rose-900/60 text-rose-200 ring-1 ring-rose-700/50" />;
  return <Badge label="Extreme risk" className="bg-rose-950 text-rose-300 ring-1 ring-rose-800" />;
}

/** 0..1 data confidence, 4 tiers: High / Medium / Low / Mock (when the source isn't a live feed). */
export function DataConfidenceBadge({ confidence, mock }: { confidence: number; mock?: boolean }) {
  if (mock) return <Badge label="Mock data" className="bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50" />;
  if (confidence >= 0.8) return <Badge label="High confidence" className="bg-sky-900/60 text-sky-200 ring-1 ring-sky-700/50" />;
  if (confidence >= 0.55) return <Badge label="Medium confidence" className="bg-slate-700/60 text-slate-200 ring-1 ring-slate-500/50" />;
  return <Badge label="Low confidence" className="bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50" />;
}
