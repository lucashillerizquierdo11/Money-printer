"use client";

/**
 * /dashboard — every upcoming World Cup match and its candidate markets,
 * filterable by date, stage, market type, probability/edge/risk thresholds,
 * boost-only and streak-suitability-only toggles.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { getAllRecommendationsForMatch, getBestRecommendation, getTeam, getUpcomingMatches } from "@/data";
import { MARKET_LIST } from "@/lib/markets";
import { applySettingsToRecommendation, passesSettingsThresholds, type ScoredRecommendation } from "@/lib/settings";
import { useSettings } from "@/components/SettingsProvider";
import type { RiskLevel, WorldCupMatch } from "@/types";
import { MatchCard } from "@/components/MatchCard";
import { ConfidenceBadge, RecommendationBadge, RiskBadge, StreakBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, odds, pct, shortDate, signedPct, stageLabel } from "@/lib/format";

interface Row {
  match: WorldCupMatch;
  rec: ScoredRecommendation;
}

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export default function DashboardPage() {
  const { settings } = useSettings();
  const upcoming = useMemo(() => getUpcomingMatches(), []);

  const allRows = useMemo<Row[]>(
    () =>
      upcoming.flatMap((match) =>
        getAllRecommendationsForMatch(match.id).map((rec) => ({
          match,
          rec: applySettingsToRecommendation(rec, settings),
        })),
      ),
    [upcoming, settings],
  );

  const [dateFilter, setDateFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [minProb, setMinProb] = useState(0);
  const [minEdge, setMinEdge] = useState(-100);
  const [maxRisk, setMaxRisk] = useState<RiskLevel>("high");
  const [boostedOnly, setBoostedOnly] = useState(false);
  const [streakSuitableOnly, setStreakSuitableOnly] = useState(false);
  const [hideNegativeEdge, setHideNegativeEdge] = useState(true);

  const dateOptions = useMemo(
    () => [...new Set(upcoming.map((m) => shortDate(m.kickoffTime)))],
    [upcoming],
  );
  const stageOptions = useMemo(
    () => [...new Set(upcoming.map((m) => stageLabel(m.stage, m.groupLetter)))],
    [upcoming],
  );

  const rows = allRows.filter(({ match, rec }) => {
    if (!passesSettingsThresholds(rec, settings)) return false;
    if (dateFilter !== "all" && shortDate(match.kickoffTime) !== dateFilter) return false;
    if (stageFilter !== "all" && stageLabel(match.stage, match.groupLetter) !== stageFilter) return false;
    if (marketFilter !== "all" && rec.marketKey !== marketFilter) return false;
    if (rec.estimatedProbability < minProb) return false;
    if (rec.edge * 100 < minEdge) return false;
    if (RISK_ORDER[rec.riskLevel] > RISK_ORDER[maxRisk]) return false;
    if (boostedOnly && !rec.isBoosted) return false;
    if (streakSuitableOnly && rec.streakSuitability === "avoid") return false;
    if (hideNegativeEdge && rec.edge <= 0) return false;
    return true;
  });

  rows.sort((a, b) => b.rec.valueScore - a.rec.valueScore);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          All upcoming World Cup matches and their candidate markets, ranked by
          value score. Filter below — nothing here is a guaranteed bet, so
          always check the risk rating and data confidence next to a row.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Upcoming matches</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {upcoming.slice(0, 8).map((match) => {
            const home = getTeam(match.homeTeam);
            const away = getTeam(match.awayTeam);
            return (
              <MatchCard
                key={match.id}
                match={match}
                home={home}
                away={away}
                topRecommendation={getBestRecommendation(match.id)}
              />
            );
          })}
        </div>
      </section>

      <section className="card grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Date">
          <select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All dates</option>
            {dateOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Group / stage">
          <select className="select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="all">All stages</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Market type">
          <select className="select" value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
            <option value="all">All markets</option>
            {MARKET_LIST.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Min. estimated probability">
          <input
            type="number"
            min={0}
            max={100}
            className="input"
            value={Math.round(minProb * 100)}
            onChange={(e) => setMinProb(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)}
          />
        </Field>
        <Field label="Min. edge (pp)">
          <input
            type="number"
            className="input"
            value={minEdge}
            onChange={(e) => setMinEdge(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Max. risk">
          <select className="select" value={maxRisk} onChange={(e) => setMaxRisk(e.target.value as RiskLevel)}>
            <option value="low">Low only</option>
            <option value="medium">Medium or below</option>
            <option value="high">High or below (no filter)</option>
          </select>
        </Field>
        <Toggle label="Only boosted markets" checked={boostedOnly} onChange={setBoostedOnly} />
        <Toggle label="Only streak-suitable bets" checked={streakSuitableOnly} onChange={setStreakSuitableOnly} />
        <Toggle label="Hide negative-edge bets" checked={hideNegativeEdge} onChange={setHideNegativeEdge} />
      </section>

      <section>
        <p className="mb-2 text-xs text-zinc-500">{rows.length} candidates match your filters.</p>
        <div className="overflow-x-auto rounded-xl border border-pitch-700">
          <table className="data w-full min-w-[1200px]">
            <thead className="bg-pitch-800">
              <tr>
                <th className="th">Kickoff</th>
                <th className="th">Stage</th>
                <th className="th">Match</th>
                <th className="th">Market</th>
                <th className="th">Odds</th>
                <th className="th">Implied</th>
                <th className="th">Est. prob.</th>
                <th className="th">Edge</th>
                <th className="th">Risk score</th>
                <th className="th">Streak fit</th>
                <th className="th">Confidence</th>
                <th className="th">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ match, rec }) => {
                const home = getTeam(match.homeTeam);
                const away = getTeam(match.awayTeam);
                return (
                  <tr key={`${match.id}:${rec.marketKey}:${rec.selection ?? ""}`}>
                    <td className="td whitespace-nowrap text-zinc-300">{kickoff(match.kickoffTime)}</td>
                    <td className="td whitespace-nowrap text-zinc-300">{stageLabel(match.stage, match.groupLetter)}</td>
                    <td className="td whitespace-nowrap">
                      <Link href={`/match/${match.id}`} className="text-emerald-300 hover:underline">
                        {home.flag} {home.name} v {away.name} {away.flag}
                      </Link>
                    </td>
                    <td className="td">{rec.marketLabel}{rec.isBoosted ? " 🚀" : ""}</td>
                    <td className="td">{odds(rec.odds)}</td>
                    <td className="td text-zinc-400">{pct(rec.impliedProbability, 1)}</td>
                    <td className="td font-medium text-white">{pct(rec.estimatedProbability, 1)}</td>
                    <td className={`td font-medium ${rec.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {signedPct(rec.edge)}
                    </td>
                    <td className="td"><RiskBadge level={rec.riskLevel} /></td>
                    <td className="td"><StreakBadge level={rec.streakSuitability} /></td>
                    <td className="td"><ConfidenceBadge level={rec.dataConfidence} /></td>
                    <td className="td"><RecommendationBadge level={rec.recommendationLabel} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <DisclaimerFootnote />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 self-end text-xs text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
