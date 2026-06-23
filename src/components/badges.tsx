/** Small colour-coded badges for risk, confidence, streak suitability and qualification pressure. */

import type { DataConfidence, QualificationPressure, RiskLevel, StreakSuitability } from "@/types";
import { PRESSURE_LABELS } from "@/lib/standings";

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50",
  medium: "bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50",
  high: "bg-rose-900/60 text-rose-200 ring-1 ring-rose-700/50",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge label={`${level} risk`} className={RISK_STYLES[level]} />;
}

const STREAK_LABELS: Record<StreakSuitability, string> = {
  strong_candidate: "Strong candidate",
  consider: "Consider",
  avoid: "Avoid",
};

const STREAK_STYLES: Record<StreakSuitability, string> = {
  strong_candidate: "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50",
  consider: "bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50",
  avoid: "bg-rose-900/60 text-rose-200 ring-1 ring-rose-700/50",
};

export function StreakBadge({ level }: { level: StreakSuitability }) {
  return <Badge label={STREAK_LABELS[level]} className={STREAK_STYLES[level]} />;
}

const CONFIDENCE_STYLES: Record<DataConfidence, string> = {
  high: "bg-sky-900/60 text-sky-200 ring-1 ring-sky-700/50",
  medium: "bg-slate-700/60 text-slate-200 ring-1 ring-slate-500/50",
  low: "bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50",
};

export function ConfidenceBadge({ level }: { level: DataConfidence }) {
  return <Badge label={`${level} confidence`} className={CONFIDENCE_STYLES[level]} />;
}

const PRESSURE_STYLES: Record<QualificationPressure, string> = {
  must_win: "bg-rose-900/60 text-rose-200 ring-1 ring-rose-700/50",
  likely_needs_points: "bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50",
  in_contention: "bg-slate-700/60 text-slate-200 ring-1 ring-slate-500/50",
  already_qualified: "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50",
  already_eliminated: "bg-zinc-800/70 text-zinc-400 ring-1 ring-zinc-600/50",
};

export function PressureBadge({ level }: { level: QualificationPressure }) {
  return <Badge label={PRESSURE_LABELS[level]} className={PRESSURE_STYLES[level]} />;
}
