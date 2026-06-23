import type { PlayerPropOdds, Recommendation, RecommendationLabel, WorldCupPlayer } from "@/types";
import { RecommendationBadge } from "@/components/badges";
import { EdgeBadge } from "@/components/scoreBadges";
import { odds as fmtOdds, pct } from "@/lib/format";

/**
 * Bookmaker odds-boost card: player, market, normal vs boosted odds,
 * break-even probability, estimated probability, true boost value rating,
 * max stake and final recommendation.
 */
export function BoostCard({
  player,
  quote,
  rec,
  trueBoostValue,
  recommendationLabel,
}: {
  player: WorldCupPlayer;
  quote: PlayerPropOdds & { normalOdds: number };
  rec: Recommendation;
  trueBoostValue: number;
  recommendationLabel: RecommendationLabel;
}) {
  const breakEvenProbability = quote.impliedProbability;

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{player.name}</p>
          <p className="text-sm text-zinc-400">{rec.marketLabel}</p>
        </div>
        <RecommendationBadge level={recommendationLabel} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-zinc-400 line-through">{fmtOdds(quote.normalOdds)}</span>
        <span className="font-semibold text-emerald-300">{fmtOdds(quote.odds)}</span>
        <span className="text-xs text-zinc-500">normal → boosted</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
        <Stat label="Break-even probability" value={pct(breakEvenProbability, 1)} />
        <Stat label="Estimated probability" value={pct(rec.estimatedProbability, 1)} />
        <Stat label="True boost value" value={<EdgeBadge edge={trueBoostValue} />} />
        <Stat label="Max stake" value={quote.maxStake ? `${quote.maxStake} kr` : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="mt-0.5 font-medium text-white">{value}</p>
    </div>
  );
}
