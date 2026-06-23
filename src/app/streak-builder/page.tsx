"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getAllRecommendationsForMatch, getTeam, getUpcomingMatches } from "@/data";
import { buildStreakSummary } from "@/lib/streak";
import type { Recommendation, StreakLeg } from "@/types";
import { RiskBadge, ConfidenceBadge, StreakBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, odds, pct, signedPct, stageLabel } from "@/lib/format";

type LegKey = string;

function legKey(matchId: string, rec: Recommendation): LegKey {
  return `${matchId}::${rec.marketKey}::${rec.selection ?? ""}`;
}

export default function StreakBuilderPage() {
  const upcoming = useMemo(() => getUpcomingMatches(), []);
  const candidatesByMatch = useMemo(
    () =>
      upcoming.map((m) => ({
        match: m,
        recs: getAllRecommendationsForMatch(m.id).slice(0, 4),
      })),
    [upcoming],
  );

  const [selected, setSelected] = useState<Map<LegKey, StreakLeg>>(new Map());
  const [bankroll, setBankroll] = useState(100);

  function toggleLeg(matchId: string, rec: Recommendation) {
    const key = legKey(matchId, rec);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          matchId,
          marketKey: rec.marketKey,
          marketLabel: rec.marketLabel,
          selection: rec.selection,
          estimatedProbability: rec.estimatedProbability,
          odds: rec.odds,
          riskLevel: rec.riskLevel,
          dataConfidence: rec.dataConfidence,
        });
      }
      return next;
    });
  }

  const legs = [...selected.values()];
  const summary = legs.length > 0 ? buildStreakSummary(legs, bankroll) : null;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-white">Streak Builder</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pick legs across upcoming matches to test a compounding streak. This
          shows the estimated probability of each leg winning and the chance
          the WHOLE streak survives — never a guaranteed outcome, and one loss
          on any leg resets the streak to zero.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold text-white">Starting bankroll</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            value={bankroll}
            onChange={(e) => setBankroll(Math.max(1, Number(e.target.value) || 0))}
            className="w-32 rounded border border-pitch-700 bg-pitch-900 px-3 py-1.5 text-white"
          />
          <div className="flex gap-2 text-xs">
            {[100, 400, 1000].map((amount) => (
              <button
                key={amount}
                onClick={() => setBankroll(amount)}
                className="rounded bg-pitch-700 px-2 py-1 text-zinc-300 hover:bg-pitch-600 hover:text-white"
              >
                {amount} kr
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Used only to illustrate the projected payout if every leg in the
          streak wins — this is not a recommendation to stake this amount.
        </p>
      </section>

      {summary && <StreakSummaryCard summary={summary} onRemove={(k) => removeLeg(setSelected, k)} legs={legs} />}

      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white">Candidate legs by match</h2>
        {candidatesByMatch.map(({ match, recs }) => {
          const home = getTeam(match.homeTeam);
          const away = getTeam(match.awayTeam);
          if (recs.length === 0) return null;
          return (
            <div key={match.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/match/${match.id}`} className="font-medium text-emerald-300 hover:underline">
                  {home.flag} {home.name} v {away.name} {away.flag}
                </Link>
                <span className="text-xs text-zinc-500">
                  {stageLabel(match.stage, match.groupLetter)} · {kickoff(match.kickoffTime)}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-pitch-700">
                <table className="data w-full min-w-[760px]">
                  <thead className="bg-pitch-800">
                    <tr>
                      <th className="th"></th>
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
                    {recs.map((r) => {
                      const key = legKey(match.id, r);
                      const checked = selected.has(key);
                      return (
                        <tr key={key} className={checked ? "bg-emerald-950/30" : ""}>
                          <td className="td">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLeg(match.id, r)}
                            />
                          </td>
                          <td className="td">{r.marketLabel}</td>
                          <td className="td font-medium text-white">{pct(r.estimatedProbability)}</td>
                          <td className="td">{odds(r.odds)}</td>
                          <td className={`td ${r.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {signedPct(r.edge)}
                          </td>
                          <td className="td"><RiskBadge level={r.riskLevel} /></td>
                          <td className="td"><ConfidenceBadge level={r.dataConfidence} /></td>
                          <td className="td"><StreakBadge level={r.streakSuitability} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <DisclaimerFootnote />
    </div>
  );
}

function removeLeg(
  setSelected: React.Dispatch<React.SetStateAction<Map<LegKey, StreakLeg>>>,
  key: LegKey,
) {
  setSelected((prev) => {
    const next = new Map(prev);
    next.delete(key);
    return next;
  });
}

function StreakSummaryCard({
  summary,
  legs,
  onRemove,
}: {
  summary: ReturnType<typeof buildStreakSummary>;
  legs: StreakLeg[];
  onRemove: (key: LegKey) => void;
}) {
  return (
    <section className="card space-y-3 border-emerald-700/50 bg-emerald-950/20">
      <h2 className="text-lg font-semibold text-white">
        Your streak — {legs.length} leg{legs.length > 1 ? "s" : ""}
      </h2>
      <ul className="space-y-1 text-sm text-zinc-300">
        {legs.map((l) => {
          const key = `${l.matchId}::${l.marketKey}::${l.selection ?? ""}`;
          return (
            <li key={key} className="flex items-center justify-between gap-2">
              <span>
                {l.marketLabel} — {pct(l.estimatedProbability)} @ {odds(l.odds)}
              </span>
              <button
                onClick={() => onRemove(key)}
                className="text-xs text-rose-300 hover:underline"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
        <span>
          Combined survival probability:{" "}
          <strong className="text-white">{pct(summary.combinedSurvivalProbability)}</strong>
        </span>
        <span>
          Combined odds: <strong className="text-white">{odds(summary.combinedOdds)}</strong>
        </span>
        <span>
          Projected payout from {summary.startingBankroll} kr:{" "}
          <strong className="text-white">{summary.projectedPayout.toFixed(0)} kr</strong>
        </span>
      </div>
      {summary.lowerRiskAlternativeSuggested && (
        <p className="text-xs text-amber-300">
          ⚠️ A lower-risk staking strategy may suit this streak better — see notes below.
        </p>
      )}
      <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-400">
        {summary.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
