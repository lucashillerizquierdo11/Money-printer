import Link from "next/link";
import type { Recommendation, WorldCupMatch, WorldCupTeam } from "@/types";
import { RiskBadge, StreakBadge } from "@/components/badges";
import { EdgeBadge } from "@/components/scoreBadges";
import { kickoff, stageLabel } from "@/lib/format";

/**
 * Compact match summary card — teams, kickoff, stage, top recommended market
 * and its risk/edge/streak badges. Links through to the full match page.
 */
export function MatchCard({
  match,
  home,
  away,
  topRecommendation,
}: {
  match: WorldCupMatch;
  home: WorldCupTeam;
  away: WorldCupTeam;
  topRecommendation: Recommendation | null;
}) {
  return (
    <Link href={`/match/${match.id}`} className="card block space-y-3 transition hover:border-emerald-700/50">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{stageLabel(match.stage, match.groupLetter)}</span>
        <span>{kickoff(match.kickoffTime)}</span>
      </div>

      <p className="text-base font-semibold text-white">
        {home.flag} {home.name} <span className="text-zinc-500">v</span> {away.name} {away.flag}
      </p>

      {topRecommendation ? (
        <div className="space-y-2">
          <p className="truncate text-sm text-zinc-300">
            {topRecommendation.marketLabel}
            {topRecommendation.isBoosted ? " 🚀" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <RiskBadge level={topRecommendation.riskLevel} />
            <EdgeBadge edge={topRecommendation.edge} />
            <StreakBadge level={topRecommendation.streakSuitability} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No candidate markets yet.</p>
      )}
    </Link>
  );
}
