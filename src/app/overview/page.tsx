import Link from "next/link";
import { MATCHES, getCompletedMatches, getTeam } from "@/data";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff, pct, shortDate, stageLabel } from "@/lib/format";

export default function OverviewPage() {
  const completed = getCompletedMatches();
  const n = completed.length;

  const totalGoals = sum(completed, (m) => m.totalGoals ?? 0);
  const totalCorners = sum(completed, (m) => m.totalCorners ?? 0);
  const totalCards = sum(completed, (m) => m.totalCards ?? 0);

  const nilNil = completed.filter((m) => (m.totalGoals ?? 0) === 0).length;
  const over05goals = share(completed, (m) => (m.totalGoals ?? 0) > 0.5);
  const over55corners = share(completed, (m) => (m.totalCorners ?? 0) > 5.5);
  const over05cards = share(completed, (m) => (m.totalCards ?? 0) > 0.5);

  const perDay = matchesPerDay();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-white">World Cup Overview</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Tournament-wide trends across {n} completed World Cup matches — useful
          context for estimating market probabilities and data confidence.
        </p>
      </section>

      <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
        This tournament context uses built-in sample data and is illustrative. Connect a results provider
        (see <Link href="/sources" className="underline">Data Sources</Link>) for live figures.
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="0–0 matches" value={String(nilNil)} hint={`${pct(nilNil / Math.max(1, n))} of games`} />
        <Stat label="Over 0.5 goals" value={pct(over05goals)} hint="at least 1 goal" />
        <Stat label="Over 5.5 corners" value={pct(over55corners)} hint="6+ corners" />
        <Stat label="Over 0.5 cards" value={pct(over05cards)} hint="at least 1 card" />
        <Stat label="Avg goals / match" value={avg(totalGoals, n)} />
        <Stat label="Avg corners / match" value={avg(totalCorners, n)} />
        <Stat label="Avg cards / match" value={avg(totalCards, n)} />
        <Stat label="Completed matches" value={String(n)} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Matches per day</h2>
        <div className="flex flex-wrap gap-2">
          {perDay.map((d) => (
            <div key={d.date} className="card flex min-w-[110px] flex-col items-center">
              <span className="text-xs text-zinc-400">{shortDate(d.date)}</span>
              <span className="text-2xl font-semibold text-white">{d.count}</span>
              <span className="text-[11px] text-zinc-500">{d.completed} played</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">All completed matches</h2>
        <div className="overflow-x-auto rounded-xl border border-pitch-700">
          <table className="data w-full min-w-[760px]">
            <thead className="bg-pitch-800">
              <tr>
                <th className="th">Date</th>
                <th className="th">Stage</th>
                <th className="th">Match</th>
                <th className="th">Score</th>
                <th className="th">Goals</th>
                <th className="th">Corners</th>
                <th className="th">Cards</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((m) => {
                const home = getTeam(m.homeTeam);
                const away = getTeam(m.awayTeam);
                return (
                  <tr key={m.id}>
                    <td className="td whitespace-nowrap text-zinc-400">{kickoff(m.kickoffTime)}</td>
                    <td className="td whitespace-nowrap">{stageLabel(m.stage, m.groupLetter)}</td>
                    <td className="td whitespace-nowrap">
                      <Link href={`/match/${m.id}`} className="text-emerald-300 hover:underline">
                        {home.flag} {home.name} v {away.name} {away.flag}
                      </Link>
                    </td>
                    <td className="td font-medium text-white">{m.homeScore}–{m.awayScore}</td>
                    <td className="td">{m.totalGoals}</td>
                    <td className="td">{m.totalCorners}</td>
                    <td className="td">{m.totalCards}</td>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function matchesPerDay() {
  const map = new Map<string, { count: number; completed: number }>();
  for (const m of MATCHES) {
    const day = m.kickoffTime.slice(0, 10);
    const entry = map.get(day) ?? { count: 0, completed: 0 };
    entry.count++;
    if (m.status === "complete") entry.completed++;
    map.set(day, entry);
  }
  return [...map.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sum<T>(items: T[], fn: (x: T) => number): number {
  return items.reduce((acc, x) => acc + fn(x), 0);
}
function share<T>(items: T[], pred: (x: T) => boolean): number {
  if (items.length === 0) return 0;
  return items.filter(pred).length / items.length;
}
function avg(total: number, n: number): string {
  return (total / Math.max(1, n)).toFixed(2);
}
