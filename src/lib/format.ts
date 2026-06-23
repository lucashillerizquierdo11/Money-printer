/** Small display formatters shared across pages. */

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPct(value: number, digits = 1): string {
  const s = (value * 100).toFixed(digits);
  return value >= 0 ? `+${s}%` : `${s}%`;
}

export function odds(value: number): string {
  return value.toFixed(2);
}

export function kickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

const STAGE_LABELS: Record<string, string> = {
  group: "Group",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "Third-place",
  final: "Final",
};

export function stageLabel(stage: string, groupLetter?: string): string {
  if (stage === "group" && groupLetter) return `Group ${groupLetter}`;
  return STAGE_LABELS[stage] ?? stage;
}
