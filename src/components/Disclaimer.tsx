/** Research disclaimer shown across the app. This tool never promises profit. */

export function DisclaimerBanner() {
  return (
    <div className="border-b border-amber-800/40 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200/90">
      ⚠️ Research tool, not financial advice. Estimates are “estimated safer
      picks”, never guaranteed bets. The goal is to help avoid bad bets — not to
      promise profit. Bet responsibly.
    </div>
  );
}

export function DisclaimerFootnote() {
  return (
    <p className="mt-8 text-xs leading-relaxed text-zinc-500">
      <strong className="text-zinc-400">Disclaimer:</strong> The World Cup
      SafeBet Dashboard is a research and educational tool for FIFA World Cup
      matches only. Probabilities and “estimated safer picks” are model estimates
      based on mock data and may be wrong. Nothing here is a guaranteed bet or
      financial advice. Past performance and hit rates do not predict future
      results. Only ever stake what you can afford to lose, and check your local
      laws on betting.
    </p>
  );
}
