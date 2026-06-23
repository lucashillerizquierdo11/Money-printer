/**
 * /boosts — bookmaker odds-boost finder. Per the product spec, a player-goal
 * candidate only ever exists when a boost is active, so this page surfaces
 * every active boosted quote for upcoming matches and the "true boost value"
 * — how much extra implied probability the boost is worth versus the
 * bookmaker's normal (non-boosted) price for the same market.
 */

import {
  PLAYER_ODDS,
  getMatch,
  getPlayer,
  getTeam,
  getUpcomingMatches,
} from "@/data";
import { buildPlayerGoalRecommendation } from "@/lib/playerProps";
import { BoostCard } from "@/components/BoostCard";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { recommendationLabelOf } from "@/lib/value";
import { kickoff } from "@/lib/format";
import type { PlayerPropOdds } from "@/types";

export default function BoostsPage() {
  const upcomingIds = new Set(getUpcomingMatches().map((m) => m.id));
  const boosted = PLAYER_ODDS.filter(
    (q): q is PlayerPropOdds & { normalOdds: number } =>
      q.isBoosted && q.normalOdds !== undefined && upcomingIds.has(q.matchId),
  );

  const rows = boosted
    .map((quote) => {
      const player = getPlayer(quote.playerId);
      const match = getMatch(quote.matchId);
      if (!player || !match) return null;
      const rec = buildPlayerGoalRecommendation(player, quote);
      if (!rec) return null;
      const normalImplied = 1 / quote.normalOdds;
      const boostedImplied = quote.impliedProbability;
      const trueBoostValue = normalImplied - boostedImplied;
      const recommendationLabel = recommendationLabelOf({
        estimatedProbability: rec.estimatedProbability,
        edge: rec.edge,
        dataConfidence: rec.dataConfidence,
        valueScore: rec.valueScore,
      });
      return { quote, player, match, rec, trueBoostValue, recommendationLabel };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.rec.valueScore - a.rec.valueScore);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Boost Finder</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Active bookmaker odds boosts on upcoming matches. Break-even
          probability is <code>1 / boosted odds</code> — a boost is only worth
          chasing when the model&apos;s estimated true probability beats that
          number, e.g. Mbappé over 0.5 goals boosted to 3.00 has a break-even
          probability of 33.33%; an estimated 44% true probability gives a
          +10.67 percentage-point edge. Boost value alone is never a
          guarantee — check the risk rating too.
        </p>
      </section>

      {rows.length === 0 ? (
        <section className="card">
          <p className="text-sm text-zinc-400">No active boosts right now.</p>
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ quote, player, match, rec, trueBoostValue, recommendationLabel }) => {
            const home = getTeam(match.homeTeam);
            const away = getTeam(match.awayTeam);
            return (
              <div key={quote.id} className="space-y-2">
                <p className="text-xs text-zinc-500">
                  {quote.bookmaker} · {home.flag} {home.name} v {away.name} {away.flag} · {kickoff(match.kickoffTime)}
                </p>
                <BoostCard
                  player={player}
                  quote={quote}
                  rec={rec}
                  trueBoostValue={trueBoostValue}
                  recommendationLabel={recommendationLabel}
                />
              </div>
            );
          })}
        </div>
      )}

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-white">Boost terms</h2>
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-400">
          {rows.map(({ quote }) =>
            quote.terms ? (
              <li key={quote.id}>{quote.terms}</li>
            ) : null,
          )}
        </ul>
      </section>

      <DisclaimerFootnote />
    </div>
  );
}
