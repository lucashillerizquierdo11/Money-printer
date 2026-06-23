/**
 * Research disclaimer shown across the app.
 *
 * This tool never claims a bet is "guaranteed" and never calls anything
 * "safe" without also showing its risk rating. Streak math is framed around
 * survival probability and how one loss resets — not promised profit.
 */

export function DisclaimerBanner() {
  return (
    <div className="border-b border-amber-800/40 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200/90">
      ⚠️ Research tool, not financial advice. No bet here is “guaranteed” — every
      candidate shows an estimated hit probability and a risk rating. Streaking
      bets compounds risk fast: one loss resets the whole streak. Bet
      responsibly.
    </div>
  );
}

export function DisclaimerFootnote() {
  return (
    <p className="mt-8 text-xs leading-relaxed text-zinc-500">
      <strong className="text-zinc-400">Disclaimer:</strong> World Cup Streak
      Value Finder is a research and educational tool for FIFA World Cup
      matches only. Estimated hit probabilities, value scores and streak
      suitability labels are model estimates based on mock data and may be
      wrong. Nothing here is a guaranteed bet or financial advice, and nothing
      here is called "safe" without a risk rating attached. Compounding a
      bankroll through a betting streak is high-variance: a single loss resets
      progress to zero. Past hit rates do not predict future results. Only
      ever stake what you can afford to lose, and check your local laws on
      betting.
    </p>
  );
}
