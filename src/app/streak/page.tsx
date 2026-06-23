/**
 * /streak — bankroll compounding planner. Suggests legs across upcoming
 * matches that meet the user's filters, shows how many legs are needed to
 * hit a target bankroll under different staking modes, and always leads with
 * the survival-probability framing rather than the payout multiplier alone.
 */

import { StreakBuilder } from "@/components/StreakBuilder";
import { DisclaimerFootnote } from "@/components/Disclaimer";

export default function StreakPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Streak Builder</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Build a bankroll-compounding path across upcoming matches. The
          combined survival probability is always shown next to the payout —
          a streak is only as strong as its weakest leg, and one loss resets
          progress under the all-in mode.
        </p>
      </section>

      <StreakBuilder />

      <DisclaimerFootnote />
    </div>
  );
}
