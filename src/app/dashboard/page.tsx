"use client";

/**
 * /dashboard — "Potential value candidates" for upcoming World Cup fixtures.
 *
 * Live-first: data comes from /api/recommendations, which scores the active
 * provider. There is no mock first paint — if no provider is configured the
 * page says so; if a provider fails it shows the error; demo data is only ever
 * shown when explicitly enabled, and always labeled. A candidate is only shown
 * as real when it is backed by real odds.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MARKET_LIST } from "@/lib/markets";
import type { DataConfidence, RiskLevel } from "@/types";
import type { FeedMatch, FeedPayload, FeedRecommendation } from "@/lib/feed";
import { MatchCard } from "@/components/MatchCard";
import { ConfidenceBadge, RecommendationBadge, RiskBadge, StreakBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, odds, pct, shortDate, signedPct, stageLabel } from "@/lib/format";

interface Row {
  match: FeedMatch;
  rec: FeedRecommendation;
}

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const CONF_ORDER: Record<DataConfidence, number> = { low: 0, medium: 1, high: 2 };

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; feed: FeedPayload };

export default function DashboardPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recommendations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Request failed (HTTP ${r.status})`))))
      .then((feed: FeedPayload) => {
        if (!cancelled) setState({ kind: "ready", feed });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Potential value candidates</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upcoming World Cup markets where the model&apos;s estimated probability
          beats the bookmaker&apos;s implied probability. This is betting
          research, not advice — nothing here is guaranteed, and every row shows
          the odds, the edge, the risk and the data behind it.
        </p>
      </section>

      {state.kind === "loading" && <LoadingState />}
      {state.kind === "error" && <ErrorState message={state.message} />}
      {state.kind === "ready" && <DashboardBody feed={state.feed} />}

      <DisclaimerFootnote />
    </div>
  );
}

function DashboardBody({ feed }: { feed: FeedPayload }) {
  const [dateFilter, setDateFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [bookmakerFilter, setBookmakerFilter] = useState("all");
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState(true);
  const [minEdge, setMinEdge] = useState(0);
  const [minProb, setMinProb] = useState(0);
  const [maxRisk, setMaxRisk] = useState<RiskLevel>("high");
  const [minConfidence, setMinConfidence] = useState<DataConfidence>("low");

  const allRows = useMemo<Row[]>(
    () => feed.matches.flatMap((match) => match.recommendations.map((rec) => ({ match, rec }))),
    [feed],
  );

  const dateOptions = useMemo(
    () => [...new Set(feed.matches.map((m) => shortDate(m.kickoffTime)))],
    [feed],
  );
  const stageOptions = useMemo(
    () => [...new Set(feed.matches.map((m) => stageLabel(m.stage, m.groupLetter)))],
    [feed],
  );
  const bookmakerOptions = useMemo(
    () => [...new Set(allRows.map((r) => r.rec.bookmaker).filter((b): b is string => !!b))],
    [allRows],
  );

  const topMatches = useMemo(
    () =>
      feed.matches
        .map((m) => ({ match: m, top: [...m.recommendations].sort((a, b) => b.valueScore - a.valueScore)[0] ?? null }))
        .filter((m) => m.top)
        .slice(0, 8),
    [feed],
  );

  const rows = allRows
    .filter(({ match, rec }) => {
      if (onlyPositiveEdge && !rec.positiveEdge) return false;
      if (dateFilter !== "all" && shortDate(match.kickoffTime) !== dateFilter) return false;
      if (stageFilter !== "all" && stageLabel(match.stage, match.groupLetter) !== stageFilter) return false;
      if (marketFilter !== "all" && rec.marketKey !== marketFilter) return false;
      if (bookmakerFilter !== "all" && rec.bookmaker !== bookmakerFilter) return false;
      if (rec.edge * 100 < minEdge) return false;
      if (rec.estimatedProbability * 100 < minProb) return false;
      if (RISK_ORDER[rec.riskLevel] > RISK_ORDER[maxRisk]) return false;
      if (CONF_ORDER[rec.dataConfidence] < CONF_ORDER[minConfidence]) return false;
      return true;
    })
    .sort((a, b) => b.rec.valueScore - a.rec.valueScore);

  const notConfigured = !feed.configured && !feed.demo && feed.matches.length === 0;

  return (
    <>
      <SourceBanner feed={feed} />

      {notConfigured ? (
        <SetupState />
      ) : (
        <>
          {topMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Upcoming matches</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {topMatches.map(({ match, top }) => (
                  <MatchCard
                    key={match.id}
                    id={match.id}
                    homeName={match.homeName}
                    homeFlag={match.homeFlag}
                    awayName={match.awayName}
                    awayFlag={match.awayFlag}
                    kickoffTime={match.kickoffTime}
                    stage={match.stage}
                    groupLetter={match.groupLetter}
                    topRecommendation={top}
                    linkable={match.linkable}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="card grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Date">
              <select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                <option value="all">All dates</option>
                {dateOptions.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
            </Field>
            <Field label="Group / stage">
              <select className="select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="all">All stages</option>
                {stageOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </Field>
            <Field label="Market type">
              <select className="select" value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
                <option value="all">All markets</option>
                {MARKET_LIST.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
              </select>
            </Field>
            <Field label="Bookmaker / source">
              <select className="select" value={bookmakerFilter} onChange={(e) => setBookmakerFilter(e.target.value)}>
                <option value="all">Any source</option>
                {bookmakerOptions.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>
            </Field>
            <Field label="Min. estimated probability (%)">
              <input type="number" min={0} max={100} className="input" value={minProb}
                onChange={(e) => setMinProb(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Min. edge (pp)">
              <input type="number" className="input" value={minEdge} onChange={(e) => setMinEdge(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Max. risk">
              <select className="select" value={maxRisk} onChange={(e) => setMaxRisk(e.target.value as RiskLevel)}>
                <option value="low">Low only</option>
                <option value="medium">Medium or below</option>
                <option value="high">High or below</option>
              </select>
            </Field>
            <Field label="Min. confidence">
              <select className="select" value={minConfidence} onChange={(e) => setMinConfidence(e.target.value as DataConfidence)}>
                <option value="low">Any</option>
                <option value="medium">Medium or above</option>
                <option value="high">High only</option>
              </select>
            </Field>
            <Toggle label="Only positive edge" checked={onlyPositiveEdge} onChange={setOnlyPositiveEdge} />
          </section>

          <section>
            <p className="mb-2 text-xs text-zinc-500">{rows.length} candidates match your filters.</p>
            {rows.length === 0 ? (
              <NoCandidatesState live={feed.live} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-pitch-700">
                <table className="data w-full min-w-[1280px]">
                  <thead className="bg-pitch-800">
                    <tr>
                      <th className="th">Kickoff</th>
                      <th className="th">Stage</th>
                      <th className="th">Match</th>
                      <th className="th">Market</th>
                      <th className="th">Source</th>
                      <th className="th">Odds</th>
                      <th className="th">Implied</th>
                      <th className="th">Est. prob.</th>
                      <th className="th">Edge</th>
                      <th className="th">Risk</th>
                      <th className="th">Confidence</th>
                      <th className="th">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ match, rec }) => (
                      <tr key={`${match.id}:${rec.marketKey}:${rec.selection ?? ""}`} title={rec.explanation}>
                        <td className="td whitespace-nowrap text-zinc-300">{kickoff(match.kickoffTime)}</td>
                        <td className="td whitespace-nowrap text-zinc-300">{stageLabel(match.stage, match.groupLetter)}</td>
                        <td className="td whitespace-nowrap">
                          {match.linkable ? (
                            <Link href={`/match/${match.id}`} className="text-emerald-300 hover:underline">
                              {match.homeFlag} {match.homeName} v {match.awayName} {match.awayFlag}
                            </Link>
                          ) : (
                            <span>{match.homeFlag} {match.homeName} v {match.awayName} {match.awayFlag}</span>
                          )}
                        </td>
                        <td className="td">{rec.marketLabel}{rec.isBoosted ? " 🚀" : ""}</td>
                        <td className="td whitespace-nowrap"><SourceTag rec={rec} /></td>
                        <td className="td">{odds(rec.odds)}</td>
                        <td className="td text-zinc-400">{pct(rec.impliedProbability, 1)}</td>
                        <td className="td font-medium text-white">{pct(rec.estimatedProbability, 1)}</td>
                        <td className={`td font-medium ${rec.edge >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signedPct(rec.edge)}</td>
                        <td className="td"><RiskBadge level={rec.riskLevel} /></td>
                        <td className="td"><ConfidenceBadge level={rec.dataConfidence} /></td>
                        <td className="td"><RecommendationBadge level={rec.recommendationLabel} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

// --- States ----------------------------------------------------------------

function LoadingState() {
  return (
    <div className="card animate-pulse text-sm text-zinc-400">Loading live potential bets…</div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-700/60 bg-rose-950/40 p-4 text-sm text-rose-200">
      <p className="font-medium">Couldn&apos;t load the recommendations feed.</p>
      <p className="mt-1 text-xs text-rose-300/80">{message}</p>
    </div>
  );
}

function SetupState() {
  return (
    <div className="rounded-xl border border-pitch-700 bg-pitch-800/40 p-5">
      <p className="font-medium text-white">No live provider configured</p>
      <p className="mt-1 text-sm text-zinc-400">
        Add API keys in <code>.env.local</code> to see real potential bets. See the{" "}
        <Link href="/sources" className="text-emerald-300 hover:underline">Data Sources</Link> page for
        provider status, or set <code>NEXT_PUBLIC_ALLOW_DEMO_DATA=true</code> to explore the UI with
        clearly-labeled demo data.
      </p>
    </div>
  );
}

function NoCandidatesState({ live }: { live: boolean }) {
  return (
    <div className="rounded-xl border border-pitch-700 bg-pitch-800/40 p-5 text-sm text-zinc-400">
      {live
        ? "No live value candidates match your filters right now. Loosen the filters, or check back when more odds and results are available."
        : "No candidates to show."}
    </div>
  );
}

// --- Banner + tags ---------------------------------------------------------

function SourceBanner({ feed }: { feed: FeedPayload }) {
  const tone = feed.demo
    ? "border-amber-700/60 bg-amber-950/30"
    : feed.live
      ? "border-emerald-700/60 bg-emerald-950/30"
      : "border-pitch-700 bg-pitch-800/40";

  return (
    <div className={`space-y-2 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{feed.provider.name}</span>
        {feed.demo && <Tag tone="amber">Demo data</Tag>}
        {feed.live && <Tag tone="emerald">Live</Tag>}
        {feed.flags.oddsReal && <Tag tone="emerald">Live odds</Tag>}
        {feed.live && !feed.flags.statsReal && <Tag tone="amber">Estimated stats</Tag>}
        {feed.provider.missingKinds.includes("match_stats") && <Tag tone="zinc">Missing stats</Tag>}
        {feed.live && !feed.flags.statsReal && <Tag tone="amber">Low confidence</Tag>}
      </div>
      <p className="text-xs text-zinc-400">
        {feed.counts.fixtures} fixtures · {feed.counts.odds} odds · {feed.counts.recommendations} candidates ·
        updated {new Date(feed.lastUpdated).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC
      </p>
      {feed.errors.map((e, i) => (
        <p key={`e${i}`} className="text-xs text-rose-300">⚠️ {e}</p>
      ))}
      {feed.warnings.map((w, i) => (
        <p key={`w${i}`} className="text-xs text-amber-300">⚠️ {w}</p>
      ))}
    </div>
  );
}

function SourceTag({ rec }: { rec: FeedRecommendation }) {
  const stats = rec.sourceBreakdown.stats;
  return (
    <span className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
      <span className="text-zinc-400">{rec.sourceBreakdown.odds}</span>
      <span>
        stats:{" "}
        <span className={stats === "real" ? "text-emerald-400" : stats === "mock" ? "text-amber-400" : "text-zinc-500"}>
          {stats}
        </span>
      </span>
    </span>
  );
}

function Tag({ tone, children }: { tone: "emerald" | "amber" | "zinc"; children: React.ReactNode }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-900/60 text-emerald-300 ring-emerald-700/50"
      : tone === "amber"
        ? "bg-amber-900/60 text-amber-200 ring-amber-700/50"
        : "bg-zinc-800/60 text-zinc-400 ring-zinc-600/50";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      {children}
    </label>
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
