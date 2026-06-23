"use client";

/**
 * /streak — bankroll compounding planner. Suggests legs across upcoming
 * matches that meet the user's filters, shows how many legs are needed to
 * hit a target bankroll under different staking modes, and always leads with
 * the survival-probability framing rather than the payout multiplier alone.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { getAllUpcomingRecommendations, getMatch, getTeam } from "@/data";
import { combinedStreakProbability, kellyFraction, legsNeededForTarget, requiredMultiplier } from "@/lib/streak";
import type { Recommendation } from "@/types";
import { ConfidenceBadge, RiskBadge, StreakBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, odds, pct, signedPct } from "@/lib/format";

type BettingMode = "all_in" | "fixed" | "percentage" | "kelly";

const MODE_LABELS: Record<BettingMode, string> = {
  all_in: "All-in compounding",
  fixed: "Fixed stake",
  percentage: "Percentage stake",
  kelly: "Kelly fraction",
};

export default function StreakPage() {
  const allRecs = useMemo(() => getAllUpcomingRecommendations(), []);

  const [startingBankroll, setStartingBankroll] = useState(100);
  const [targetBankroll, setTargetBankroll] = useState(10000);
  const [mode, setMode] = useState<BettingMode>("all_in");
  const [percentageStake, setPercentageStake] = useState(0.25);
  const [minProb, setMinProb] = useState(0.6);
  const [minEdge, setMinEdge] = useState(0);
  const [maxLegs, setMaxLegs] = useState(10);
  const [minOdds, setMinOdds] = useState(1.01);
  const [maxOdds, setMaxOdds] = useState(3);
  const [includeBoosts, setIncludeBoosts] = useState(true);

  const filtered = allRecs
    .filter((r) => r.estimatedProbability >= minProb)
    .filter((r) => r.edge >= minEdge)
    .filter((r) => r.odds >= minOdds && r.odds <= maxOdds)
    .filter((r) => includeBoosts || !r.isBoosted);

  // One leg per match (correlated legs from the same match shouldn't stack).
  const bestPerMatch = new Map<string, Recommendation>();
  for (const r of filtered) {
    const existing = bestPerMatch.get(r.matchId);
    if (!existing || r.valueScore > existing.valueScore) bestPerMatch.set(r.matchId, r);
  }
  const candidates = [...bestPerMatch.values()]
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, maxLegs);

  const required = requiredMultiplier(startingBankroll, targetBankroll);
  const legsNeeded = legsNeededForTarget(candidates.map((r) => r.odds), required, maxLegs);
  const suggestedLegs = candidates.slice(0, Math.max(legsNeeded, Math.min(1, candidates.length)));

  const combinedOdds = suggestedLegs.reduce((acc, r) => acc * r.odds, 1);
  const survivalProbability = combinedStreakProbability(
    suggestedLegs.map((r) => ({ estimatedProbability: r.estimatedProbability })),
  );
  const targetReached = combinedOdds * startingBankroll >= targetBankroll;

  const finalBankroll = simulateBankroll(mode, suggestedLegs, startingBankroll, percentageStake);

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

      <section className="card grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <NumberField label="Starting bankroll (kr)" value={startingBankroll} min={1} step={10} onChange={setStartingBankroll} />
        <NumberField label="Target bankroll (kr)" value={targetBankroll} min={1} step={100} onChange={setTargetBankroll} />
        <Field label="Betting mode">
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as BettingMode)}>
            {Object.entries(MODE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
        {mode === "percentage" && (
          <NumberField
            label="Stake % of bankroll per leg"
            value={Math.round(percentageStake * 100)}
            min={1}
            max={100}
            step={5}
            onChange={(v) => setPercentageStake(v / 100)}
            suffix="%"
          />
        )}
        <NumberField label="Min. acceptable estimated probability" value={Math.round(minProb * 100)} min={0} max={100} step={1} onChange={(v) => setMinProb(v / 100)} suffix="%" />
        <NumberField label="Min. acceptable edge" value={Math.round(minEdge * 1000) / 10} min={-20} max={20} step={0.5} onChange={(v) => setMinEdge(v / 100)} suffix="pp" />
        <NumberField label="Maximum number of legs" value={maxLegs} min={1} max={20} step={1} onChange={setMaxLegs} />
        <NumberField label="Minimum odds" value={minOdds} min={1.01} max={10} step={0.01} onChange={setMinOdds} />
        <NumberField label="Maximum odds" value={maxOdds} min={1.01} max={20} step={0.1} onChange={setMaxOdds} />
        <Toggle label="Include boosts" checked={includeBoosts} onChange={setIncludeBoosts} />
      </section>

      {mode === "all_in" && (
        <div className="rounded-xl border border-rose-700/60 bg-rose-950/40 p-4 text-sm font-medium text-rose-200">
          ⚠️ All-in compounding has high risk. One loss resets the bankroll.
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold text-white">Outputs</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Required multiplier" value={`${required.toFixed(1)}×`} />
          <Stat label="Legs needed" value={String(legsNeeded)} />
          <Stat label="Combined odds (suggested legs)" value={odds(combinedOdds)} />
          <Stat
            label="Expected final bankroll if all win"
            value={`${finalBankroll.toFixed(0)} kr`}
            warn={!targetReached}
          />
          <Stat label="Probability of completing streak" value={pct(survivalProbability)} />
          <Stat label="Worst-case risk" value={worstCaseLabel(mode)} warn />
        </div>
        {!targetReached && (
          <p className="text-xs text-amber-300">
            ⚠️ Even with all {suggestedLegs.length} suggested legs winning, the
            projected bankroll does not reach your {targetBankroll} kr target —
            widen your filters (lower min. probability, raise max. odds, or
            allow more legs) to find a path, accepting more risk in the process.
          </p>
        )}
        <p className="text-xs text-zinc-400">
          Alternative safer plan: cash out partial winnings along the way, or
          switch to {mode === "all_in" ? "a fixed or percentage stake" : "all-in only once you have a strong run of high-confidence legs"} —
          either reduces how much of the bankroll is exposed to a single loss
          compared to rolling 100% of it forward every leg.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Suggested candidate legs</h2>
        {suggestedLegs.length === 0 ? (
          <p className="text-sm text-zinc-400">No candidates match your filters — widen them to see suggestions.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-pitch-700">
            <table className="data w-full min-w-[900px]">
              <thead className="bg-pitch-800">
                <tr>
                  <th className="th">Match</th>
                  <th className="th">Market</th>
                  <th className="th">Est. prob.</th>
                  <th className="th">Odds</th>
                  <th className="th">Edge</th>
                  <th className="th">Risk</th>
                  <th className="th">Confidence</th>
                  <th className="th">Streak fit</th>
                </tr>
              </thead>
              <tbody>
                {suggestedLegs.map((r) => {
                  const match = getMatch(r.matchId)!;
                  const home = getTeam(match.homeTeam);
                  const away = getTeam(match.awayTeam);
                  return (
                    <tr key={`${r.matchId}:${r.marketKey}:${r.selection ?? ""}`}>
                      <td className="td whitespace-nowrap">
                        <Link href={`/match/${match.id}`} className="text-emerald-300 hover:underline">
                          {home.flag} {home.name} v {away.name} {away.flag}
                        </Link>
                        <div className="text-xs text-zinc-500">{kickoff(match.kickoffTime)}</div>
                      </td>
                      <td className="td">{r.marketLabel}{r.isBoosted ? " 🚀" : ""}</td>
                      <td className="td font-medium text-white">{pct(r.estimatedProbability)}</td>
                      <td className="td">{odds(r.odds)}</td>
                      <td className={`td ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signedPct(r.edge)}</td>
                      <td className="td"><RiskBadge level={r.riskLevel} /></td>
                      <td className="td"><ConfidenceBadge level={r.dataConfidence} /></td>
                      <td className="td"><StreakBadge level={r.streakSuitability} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DisclaimerFootnote />
    </div>
  );
}

function simulateBankroll(
  mode: BettingMode,
  legs: Recommendation[],
  startingBankroll: number,
  percentageStake: number,
): number {
  let bankroll = startingBankroll;
  for (const leg of legs) {
    let stake: number;
    switch (mode) {
      case "all_in":
        stake = bankroll;
        break;
      case "fixed":
        stake = startingBankroll / legs.length;
        break;
      case "percentage":
        stake = bankroll * percentageStake;
        break;
      case "kelly":
        stake = bankroll * kellyFraction(leg.estimatedProbability, leg.odds);
        break;
    }
    bankroll += stake * (leg.odds - 1);
  }
  return bankroll;
}

function worstCaseLabel(mode: BettingMode): string {
  switch (mode) {
    case "all_in":
      return "Lose 100% on first loss";
    case "fixed":
      return "Lose only that leg's flat stake";
    case "percentage":
      return "Lose only that leg's % stake";
    case "kelly":
      return "Lose only the Kelly-sized stake";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="input w-full"
        />
        {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
      </div>
    </Field>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 self-end text-xs text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-semibold ${warn ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
