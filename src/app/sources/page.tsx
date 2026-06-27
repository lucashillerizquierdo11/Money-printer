/**
 * /sources — data-source status. Shows which provider is currently active
 * (mock vs a real API), whether its live fetch succeeded, a sample of the
 * real data when available, and per-kind coverage. This is the page that
 * proves the provider abstraction end-to-end: configure a real API key and
 * real fixtures appear here, with everything else still served by mock.
 */

import { loadDataset, listProviders } from "@/data/providers";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, stageLabel } from "@/lib/format";

// Revalidate hourly so a configured live feed refreshes without a redeploy.
export const revalidate = 3600;

export default async function SourcesPage() {
  const { activeProvider, live, liveData, error, sources } = await loadDataset();
  const providers = listProviders();

  const sampleMatches = (liveData?.matches ?? [])
    .slice()
    .sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime))
    .slice(0, 12);
  const teamsById = new Map((liveData?.teams ?? []).map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Data sources</h1>
        <p className="mt-1 text-sm text-zinc-400">
          The app reads through a pluggable provider layer. Real APIs supply
          only the data kinds they actually cover; the built-in mock generators
          fill the rest, so every page always has a complete dataset. Add a new
          API by implementing one <code>StatsProvider</code> and registering it.
        </p>
      </section>

      <section
        className={`rounded-xl border p-4 ${
          live
            ? "border-emerald-700/60 bg-emerald-950/30"
            : activeProvider.id === "mock"
              ? "border-pitch-700 bg-pitch-800/40"
              : "border-amber-700/60 bg-amber-950/30"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-400">Active provider</span>
          <span className="font-semibold text-white">{activeProvider.name}</span>
          <StatusPill live={live} isMock={activeProvider.id === "mock"} />
        </div>
        <p className="mt-2 text-sm text-zinc-300">{activeProvider.description}</p>
        {error && (
          <p className="mt-2 text-xs text-amber-300">
            ⚠️ Live fetch failed, falling back to mock data: {error}
          </p>
        )}
        {activeProvider.id === "mock" && (
          <p className="mt-2 text-xs text-zinc-500">
            No real provider is configured. Set <code>DATA_PROVIDER=football-data</code> and{" "}
            <code>FOOTBALL_DATA_API_KEY</code> to pull live World Cup fixtures and results.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Coverage by data kind</h2>
        <div className="overflow-x-auto rounded-xl border border-pitch-700">
          <table className="data w-full min-w-[640px]">
            <thead className="bg-pitch-800">
              <tr>
                <th className="th">Data kind</th>
                <th className="th">Status</th>
                <th className="th">Served by</th>
                <th className="th">Baseline confidence</th>
                <th className="th">Description</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="td whitespace-nowrap text-white">{s.name}</td>
                  <td className="td">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.connected
                          ? "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50"
                          : "bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50"
                      }`}
                    >
                      {s.connected ? "Live" : "Mock"}
                    </span>
                  </td>
                  <td className="td text-zinc-300">{s.servedBy}</td>
                  <td className="td text-zinc-400">{s.confidence}</td>
                  <td className="td text-zinc-400">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {live && sampleMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Live fixtures from {activeProvider.name}
          </h2>
          <p className="text-xs text-zinc-500">
            Showing {sampleMatches.length} of {liveData?.matches?.length ?? 0} fixtures fetched
            from the live feed.
          </p>
          <div className="overflow-x-auto rounded-xl border border-pitch-700">
            <table className="data w-full min-w-[640px]">
              <thead className="bg-pitch-800">
                <tr>
                  <th className="th">Kickoff</th>
                  <th className="th">Stage</th>
                  <th className="th">Match</th>
                  <th className="th">Status</th>
                  <th className="th">Score</th>
                </tr>
              </thead>
              <tbody>
                {sampleMatches.map((m) => {
                  const home = teamsById.get(m.homeTeam);
                  const away = teamsById.get(m.awayTeam);
                  return (
                    <tr key={m.id}>
                      <td className="td whitespace-nowrap text-zinc-300">{kickoff(m.kickoffTime)}</td>
                      <td className="td whitespace-nowrap">{stageLabel(m.stage, m.groupLetter)}</td>
                      <td className="td whitespace-nowrap">
                        {home?.flag} {home?.name ?? m.homeTeam} v {away?.name ?? m.awayTeam} {away?.flag}
                      </td>
                      <td className="td text-zinc-400">{m.status}</td>
                      <td className="td font-medium text-white">
                        {m.status === "complete" ? `${m.homeScore}–${m.awayScore}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Registered providers</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{p.name}</span>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.isConfigured
                      ? "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50"
                      : "bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50"
                  }`}
                >
                  {p.isConfigured ? "Configured" : "Not configured"}
                </span>
              </div>
              <p className="text-sm text-zinc-400">{p.description}</p>
              <p className="text-xs text-zinc-500">
                Covers: {p.covers.join(", ")} · id <code>{p.id}</code>
              </p>
              {p.docsUrl && (
                <a href={p.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline">
                  API documentation →
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <DisclaimerFootnote />
    </div>
  );
}

function StatusPill({ live, isMock }: { live: boolean; isMock: boolean }) {
  const label = live ? "Live" : isMock ? "Mock" : "Fallback (mock)";
  const cls = live
    ? "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50"
    : isMock
      ? "bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-600/50"
      : "bg-amber-900/60 text-amber-200 ring-1 ring-amber-700/50";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
