import Link from "next/link";
import {
  GROUPS,
  MATCHES,
  computeGroupStandings,
  getGroupMatches,
  getTeam,
} from "@/data";
import type { GroupLetter, WorldCupMatch } from "@/types";
import { PressureBadge } from "@/components/badges";
import { DisclaimerFootnote } from "@/components/Disclaimer";
import { kickoff } from "@/lib/format";

export default function GroupsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-white">World Cup Groups</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Standings and qualification pressure for all 12 groups. Pressure feeds
          the risk score — team motivation changes how games are played.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <GroupCard key={group.letter} letter={group.letter} />
        ))}
      </div>

      <DisclaimerFootnote />
    </div>
  );
}

function GroupCard({ letter }: { letter: GroupLetter }) {
  const standings = computeGroupStandings(letter, MATCHES);
  const upcoming = getGroupMatches(letter).filter((m) => m.status === "scheduled");

  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold text-white">Group {letter}</h2>
      <table className="data w-full">
        <thead>
          <tr>
            <th className="th">#</th>
            <th className="th">Team</th>
            <th className="th">P</th>
            <th className="th">W</th>
            <th className="th">D</th>
            <th className="th">L</th>
            <th className="th">GF</th>
            <th className="th">GA</th>
            <th className="th">GD</th>
            <th className="th">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const team = getTeam(row.teamId);
            return (
              <tr key={row.teamId}>
                <td className="td">{row.position}</td>
                <td className="td">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span>{team.flag} {team.name}</span>
                  </div>
                  <div className="mt-1">
                    <PressureBadge level={row.qualificationPressure} />
                  </div>
                </td>
                <td className="td">{row.played}</td>
                <td className="td">{row.wins}</td>
                <td className="td">{row.draws}</td>
                <td className="td">{row.losses}</td>
                <td className="td">{row.goalsFor}</td>
                <td className="td">{row.goalsAgainst}</td>
                <td className="td">{row.goalDifference}</td>
                <td className="td font-semibold text-white">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <UpcomingFixtures matches={upcoming} />
    </section>
  );
}

function UpcomingFixtures({ matches }: { matches: WorldCupMatch[] }) {
  if (matches.length === 0) {
    return <p className="mt-3 text-xs text-zinc-500">No upcoming group fixtures.</p>;
  }
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Upcoming fixtures
      </h3>
      <ul className="space-y-1 text-sm">
        {matches.map((m) => {
          const home = getTeam(m.homeTeam);
          const away = getTeam(m.awayTeam);
          return (
            <li key={m.id}>
              <Link href={`/match/${m.id}`} className="text-emerald-300 hover:underline">
                {home.flag} {home.name} v {away.name} {away.flag}
              </Link>
              <span className="ml-2 text-xs text-zinc-500">{kickoff(m.kickoffTime)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
