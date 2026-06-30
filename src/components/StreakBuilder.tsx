"use client";

/**
 * Reusable streak-builder widget: bankroll/target/mode/risk-tolerance inputs,
 * the positive-edge optimizer's three suggested plans, combined odds/
 * probability/final-bankroll outputs, and the mandatory all-in risk warning.
 * Extracted from the original /streak page so the same builder can be reused
 * elsewhere without duplicating the bankroll-simulation logic.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ALL_IN_RISK_WARNING,
  buildStreakPlans,
  combinedStreakProbability,
  kellyFraction,
  legsNeededForTarget,
  requiredMultiplier,
  type StreakPlan,
} from "@/lib/streak";
import type { Recommendation } from "@/types";
import type { FeedMatch, FeedPayload, FeedRecommendation } from "@/lib/feed";
import { ConfidenceBadge, RiskBadge, StreakBadge } from "@/components/badges";
import { StreakSurvivalChart } from "@/components/charts/StreakSurvivalChart";
import { kickoff, odds, pct, signedPct } from "@/lib/format";

type BettingMode = "all_in" | "fixed" | "percentage" | "kelly";

const MODE_LABELS: Record<BettingMode, string> = {
  all_in: "All-in compounding",
  fixed: "Fixed stake",
  percentage: "Percentage stake",
  kelly: "Kelly fraction",
};

/** Map a feed recommendation back to a Recommendation for the streak math. */
function toRecommendation(r: FeedRecommendation, matchId: string): Recommendation {
  return {
    matchId,
    marketKey: r.marketKey as Recommendation["marketKey"],
    marketLabel: r.marketLabel,
    selection: r.selection,
    estimatedProbability: r.estimatedProbability,
    odds: r.odds,
    bookmaker: r.bookmaker,
    impliedProbability: r.impliedProbability,
    edge: r.edge,
    valueScore: r.valueScore,
    riskLevel: r.riskLevel,
    dataConfidence: r.dataConfidence,
    streakSuitability: r.streakSuitability,
    rationale: [r.explanation],
    isBoosted: r.isBoosted,
  };
}

export function StreakBuilder() {
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recommendations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Request failed (HTTP ${r.status})`))))
      .then((data: FeedPayload) => {
        if (!cancelled) setFeed(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const [includeLowConfidence, setIncludeLowConfidence] = useState(false);

  const matchInfo = useMemo(
    () => new Map<string, FeedMatch>((feed?.matches ?? []).map((m) => [m.id, m])),
    [feed],
  );

  /**
   * Only real-odds, positive-edge, non-avoid legs are eligible. Low-confidence
   * legs are excluded unless the user opts in. This is the core honesty gate
   * for streak building.
   */
  const allRecs = useMemo<Recommendation[]>(() => {
    if (!feed) return [];
    const out: Recommendation[] = [];
    for (const m of feed.matches) {
      for (const r of m.recommendations) {
        if (!r.positiveEdge) continue;
        if (r.recommendationLabel === "avoid") continue;
        if (!includeLowConfidence && r.dataConfidence === "low") continue;
        out.push(toRecommendation(r, m.id));
      }
    }
    return out;
  }, [feed, includeLowConfidence]);

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

  const optimizerResult = useMemo(
    () => buildStreakPlans(allRecs, startingBankroll, targetBankroll),
    [allRecs, startingBankroll, targetBankroll],
  );

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-700/60 bg-rose-950/40 p-4 text-sm text-rose-200">
        Couldn&apos;t load candidates: {loadError}
      </div>
    );
  }
  if (!feed) {
    return <div className="card animate-pulse text-sm text-zinc-400">Loading candidate legs…</div>;
  }
  if (!feed.configured && !feed.demo) {
    return (
      <div className="rounded-xl border border-pitch-700 bg-pitch-800/40 p-5 text-sm text-zinc-400">
        No live provider configured, so there are no real candidate legs to build a streak from. Add API
        keys in <code>.env.local</code> (see the{" "}
        <Link href="/sources" className="text-emerald-300 hover:underline">Data Sources</Link> page), or
        enable demo mode with <code>NEXT_PUBLIC_ALLOW_DEMO_DATA=true</code>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-rose-700/60 bg-rose-950/40 p-4 text-sm font-medium text-rose-200">
        ⚠️ This tool estimates probabilities. It cannot guarantee results. A high
        estimated hit probability is not a guaranteed outcome. All-in staking
        compounds the risk — one losing leg resets the entire streak to zero.
      </div>

      {feed.demo && (
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Demo data — these legs are illustrative mock candidates, not real bets.
        </div>
      )}
      {feed.live && !feed.flags.statsReal && (
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Live odds are connected but stats are estimated, so most legs are low-confidence. Enable
          &ldquo;include low-confidence&rdquo; below to see them.
        </div>
      )}

      <section className="card grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <NumberField label="Starting bankroll (kr)" value={startingBankroll} min={1} step={10} onChange={setStartingBankroll} />
        <NumberField label="Target bankroll (kr)" value={targetBankroll} min={1} step={100} onChange={setTargetBankroll} />
        <Field label="Mode / risk tolerance">
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
        <NumberField label="Minimum probability" value={Math.round(minProb * 100)} min={0} max={100} step={1} onChange={(v) => setMinProb(v / 100)} suffix="%" />
        <NumberField label="Minimum edge" value={Math.round(minEdge * 1000) / 10} min={-20} max={20} step={0.5} onChange={(v) => setMinEdge(v / 100)} suffix="pp" />
        <NumberField label="Maximum number of legs" value={maxLegs} min={1} max={20} step={1} onChange={setMaxLegs} />
        <NumberField label="Minimum odds" value={minOdds} min={1.01} max={10} step={0.01} onChange={setMinOdds} />
        <NumberField label="Maximum odds" value={maxOdds} min={1.01} max={20} step={0.1} onChange={setMaxOdds} />
        <Toggle label="Include boosts" checked={includeBoosts} onChange={setIncludeBoosts} />
        <Toggle label="Include low-confidence candidates" checked={includeLowConfidence} onChange={setIncludeLowConfidence} />
      </section>

      {mode === "all_in" && (
        <div className="rounded-xl border border-rose-700/60 bg-rose-950/40 p-4 text-sm font-medium text-rose-200">
          ⚠️ {ALL_IN_RISK_WARNING}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Streak optimizer</h2>
        <p className="text-sm text-zinc-400">
          Three candidate streak paths built automatically from every
          positive-edge market across upcoming matches (one leg per match —
          correlated legs from the same match are never stacked).
        </p>
        {!optimizerResult.hasPositiveEdgePath ? (
          <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm font-medium text-amber-200">
            ⚠️ {optimizerResult.message}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {optimizerResult.plans.map((plan) => (
              <StreakPlanCard key={plan.strategy} plan={plan} />
            ))}
          </div>
        )}
      </section>

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
          <Stat label="Combined probability all legs hit" value={pct(survivalProbability, 1)} />
          <Stat label="Risk warning" value={worstCaseLabel(mode)} warn />
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

      {suggestedLegs.length > 0 && (
        <StreakSurvivalChart legProbabilities={suggestedLegs.map((r) => r.estimatedProbability)} />
      )}

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
                  const info = matchInfo.get(r.matchId);
                  const label = info
                    ? `${info.homeFlag} ${info.homeName} v ${info.awayName} ${info.awayFlag}`
                    : r.matchId;
                  return (
                    <tr key={`${r.matchId}:${r.marketKey}:${r.selection ?? ""}`}>
                      <td className="td whitespace-nowrap">
                        {info?.linkable ? (
                          <Link href={`/match/${r.matchId}`} className="text-emerald-300 hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span>{label}</span>
                        )}
                        {info && <div className="text-xs text-zinc-500">{kickoff(info.kickoffTime)}</div>}
                      </td>
                      <td className="td">{r.marketLabel}{r.isBoosted ? " 🚀" : ""}</td>
                      <td className="td font-medium text-white">{pct(r.estimatedProbability, 1)}</td>
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
    </div>
  );
}

function StreakPlanCard({ plan }: { plan: StreakPlan }) {
  return (
    <div className="card space-y-3">
      <div>
        <h3 className="font-semibold text-white">{plan.label}</h3>
        <p className="mt-1 text-xs text-zinc-400">{plan.rationale}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Combined odds" value={odds(plan.combinedOdds)} />
        <Stat
          label="Expected final bankroll"
          value={`${plan.expectedFinalBankroll.toFixed(0)} kr`}
          warn={!plan.targetReached}
        />
        <Stat label="Combined probability" value={pct(plan.combinedProbability, 1)} />
        <Stat label="Legs" value={String(plan.legs.length)} />
      </div>

      {!plan.targetReached && (
        <p className="text-xs text-amber-300">
          ⚠️ Even with every leg in this plan winning, the projected bankroll
          falls short of your target.
        </p>
      )}

      {plan.legs.length === 0 ? (
        <p className="text-xs text-zinc-500">No eligible legs for this plan.</p>
      ) : (
        <div className="space-y-1.5">
          {plan.legs.map((leg) => (
            <div
              key={`${leg.matchId}:${leg.marketLabel}:${leg.selection ?? ""}`}
              className="flex items-center justify-between gap-2 rounded border border-pitch-700 bg-pitch-900/60 px-2 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <Link href={`/match/${leg.matchId}`} className="block truncate text-emerald-300 hover:underline">
                  {leg.marketLabel}
                  {leg.isBoosted ? " 🚀" : ""}
                </Link>
                <div className="text-zinc-500">
                  {pct(leg.estimatedProbability, 1)} prob · {signedPct(leg.edge)} edge
                </div>
              </div>
              <div className="whitespace-nowrap font-medium text-white">{odds(leg.odds)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-rose-300">⚠️ Biggest risk: {plan.biggestRisk}</p>
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
