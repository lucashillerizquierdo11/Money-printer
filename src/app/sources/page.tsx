/**
 * /sources — data-source & API status. Shows the active provider composition,
 * every registered provider (whether its key is present, what it covers), and
 * live counts/freshness/warnings. API key *values* are never shown — only
 * whether a key is configured.
 */

import { loadDataset, listProviders, demoAllowed } from "@/data/providers";
import { buildFeedMatches, datasetHasMarketData, type DatasetQuality } from "@/lib/datasetScoring";
import { DisclaimerFootnote } from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const { dataset, status } = await loadDataset();
  const providers = listProviders();

  const { corners, cards } = datasetHasMarketData(dataset);
  const quality: DatasetQuality = {
    demo: status.demo,
    statsReal: status.statsReal,
    oddsReal: status.oddsReal,
    hasCornersData: status.demo ? true : corners,
    hasCardsData: status.demo ? true : cards,
    fixturesProvider: status.provider.id,
  };
  const matches = status.live || status.demo ? buildFeedMatches(dataset, quality) : [];
  const recCount = matches.reduce((acc, m) => acc + m.recommendations.length, 0);

  const stateLabel = status.live ? "Live" : status.demo ? "Demo" : status.configured ? "Error / fallback" : "Not configured";
  const stateTone = status.live
    ? "border-emerald-700/60 bg-emerald-950/30"
    : status.demo
      ? "border-amber-700/60 bg-amber-950/30"
      : "border-pitch-700 bg-pitch-800/40";

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Data sources &amp; API status</h1>
        <p className="mt-1 text-sm text-zinc-400">
          The app reads through a pluggable provider layer. Real APIs supply
          only the data kinds they cover; the rest is missing (or, in demo mode,
          mock). Configure keys in <code>.env.local</code>. API key values are
          never displayed here — only whether a key is present.
        </p>
      </section>

      <section className={`space-y-2 rounded-xl border p-4 ${stateTone}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-400">Active</span>
          <span className="font-semibold text-white">{status.provider.name}</span>
          <Pill ok={status.live} amber={status.demo}>{stateLabel}</Pill>
        </div>
        <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Fixtures" value={String(status.fixtureCount)} />
          <Stat label="Odds quotes" value={String(status.oddsCount)} />
          <Stat label="Candidates" value={String(recCount)} />
          <Stat label="Last fetch" value={new Date(status.lastUpdated).toLocaleString("en-GB", { timeZone: "UTC" })} />
          <Stat label="Real fixtures" value={yn(status.fixturesReal)} />
          <Stat label="Real odds" value={yn(status.oddsReal)} />
          <Stat label="Real stats" value={yn(status.statsReal)} />
          <Stat label="Demo allowed" value={yn(demoAllowed())} />
        </div>
        {status.errors.map((e, i) => (<p key={`e${i}`} className="text-xs text-rose-300">⚠️ {e}</p>))}
        {status.warnings.map((w, i) => (<p key={`w${i}`} className="text-xs text-amber-300">⚠️ {w}</p>))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Registered providers</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{p.name}</span>
                {p.id === "mock" ? (
                  <Pill ok={false} amber>Demo generator</Pill>
                ) : (
                  <Pill ok={p.isConfigured}>{p.isConfigured ? "Key configured" : "No key"}</Pill>
                )}
              </div>
              <p className="text-sm text-zinc-400">{p.description}</p>
              <p className="text-xs text-zinc-500">
                role <code>{p.role}</code> · id <code>{p.id}</code> · covers: {p.covers.join(", ")}
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Coverage by data kind</h2>
        <div className="overflow-x-auto rounded-xl border border-pitch-700">
          <table className="data w-full min-w-[560px]">
            <thead className="bg-pitch-800">
              <tr>
                <th className="th">Data kind</th>
                <th className="th">Status</th>
                <th className="th">Notes</th>
              </tr>
            </thead>
            <tbody>
              {KIND_ROWS.map((row) => {
                const covered = status.provider.covers.includes(row.kind);
                return (
                  <tr key={row.kind}>
                    <td className="td whitespace-nowrap text-white">{row.label}</td>
                    <td className="td">
                      <Pill ok={covered && status.live} amber={status.demo}>
                        {status.demo ? "Mock" : covered ? "Live" : "Missing"}
                      </Pill>
                    </td>
                    <td className="td text-zinc-400">{row.note}</td>
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

const KIND_ROWS: { kind: "fixtures" | "results" | "match_stats" | "corners_cards" | "odds" | "player_odds"; label: string; note: string }[] = [
  { kind: "fixtures", label: "Fixtures & schedule", note: "Kickoff times, stages, teams." },
  { kind: "results", label: "Results", note: "Final scores and status." },
  { kind: "match_stats", label: "Match stats", note: "Goals/shots feeding form." },
  { kind: "corners_cards", label: "Corners & cards", note: "Needed for corner/card markets." },
  { kind: "odds", label: "Odds", note: "Required to compute edge/value." },
  { kind: "player_odds", label: "Player-prop odds", note: "Boosted player markets only." },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="mt-0.5 font-medium text-white">{value}</p>
    </div>
  );
}

function yn(v: boolean): string {
  return v ? "Yes" : "No";
}

function Pill({ ok, amber, children }: { ok: boolean; amber?: boolean; children: React.ReactNode }) {
  const cls = ok
    ? "bg-emerald-900/60 text-emerald-300 ring-emerald-700/50"
    : amber
      ? "bg-amber-900/60 text-amber-200 ring-amber-700/50"
      : "bg-zinc-800/60 text-zinc-400 ring-zinc-600/50";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{children}</span>;
}
