import type { Recommendation, TeamRecentMatchStats } from "@/types";
import { buildExplanation } from "@/lib/explain";

/** Readable, plain-English explanation panel for a list of recommendations. */
export function ExplanationPanel({
  recs,
  homeRecent,
  awayRecent,
  stagePhase,
}: {
  recs: Recommendation[];
  homeRecent: TeamRecentMatchStats;
  awayRecent: TeamRecentMatchStats;
  stagePhase: "group" | "knockout";
}) {
  if (recs.length === 0) return null;
  return (
    <div className="space-y-3">
      {recs.map((r) => (
        <div key={`${r.marketKey}:${r.selection ?? ""}`} className="card">
          <p className="text-sm text-zinc-300">{buildExplanation(r, homeRecent, awayRecent, stagePhase)}</p>
        </div>
      ))}
    </div>
  );
}
