import Link from "next/link";
import type { Recommendation } from "@/types";
import { RiskBadge, StreakBadge } from "@/components/badges";
import { EdgeBadge } from "@/components/scoreBadges";
import { kickoff, stageLabel } from "@/lib/format";

/**
 * Compact match summary card — teams, kickoff, stage, top recommended market
 * and its risk/edge/streak badges. Takes display-friendly props so it works
 * for both mock matches (which have a detail page) and live-API matches
 * (which don't, so `linkable` is false and the card doesn't link out).
 */
export interface MatchCardProps {
  id: string;
  homeName: string;
  homeFlag: string;
  awayName: string;
  awayFlag: string;
  kickoffTime: string;
  stage: string;
  groupLetter?: string;
  topRecommendation: Recommendation | null;
  linkable?: boolean;
}

export function MatchCard(props: MatchCardProps) {
  const { id, homeName, homeFlag, awayName, awayFlag, kickoffTime, stage, groupLetter, topRecommendation, linkable = true } = props;

  const inner = (
    <>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{stageLabel(stage, groupLetter)}</span>
        <span>{kickoff(kickoffTime)}</span>
      </div>

      <p className="text-base font-semibold text-white">
        {homeFlag} {homeName} <span className="text-zinc-500">v</span> {awayName} {awayFlag}
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
    </>
  );

  if (linkable) {
    return (
      <Link href={`/match/${id}`} className="card block space-y-3 transition hover:border-emerald-700/50">
        {inner}
      </Link>
    );
  }
  return <div className="card space-y-3">{inner}</div>;
}
