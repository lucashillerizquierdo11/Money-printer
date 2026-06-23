"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RecentMatchLine } from "@/types";

/** Shared chart shell — fixed height, dark tooltip, minimal axes. */
function Trend({
  data,
  dataKey,
  color,
  label,
}: {
  data: { label: string; value: number }[];
  dataKey: string;
  color: string;
  label: string;
}) {
  return (
    <div className="card">
      <p className="mb-2 text-sm font-medium text-zinc-300">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#0f2419", border: "1px solid #143123", fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Oldest-first ordering for a chronological trend line from "most recent first" match data. */
function chronological(matches: RecentMatchLine[]) {
  return [...matches].reverse();
}

export function GoalsTrendChart({ matches, teamLabel }: { matches: RecentMatchLine[]; teamLabel: string }) {
  const data = chronological(matches).map((m, i) => ({
    label: `vs ${m.opponent}`.slice(0, 12) || `M${i + 1}`,
    value: m.goalsFor + m.goalsAgainst,
  }));
  return <Trend data={data} dataKey="value" color="#34d399" label={`${teamLabel} — recent total goals`} />;
}

export function CornersTrendChart({ matches, teamLabel }: { matches: RecentMatchLine[]; teamLabel: string }) {
  const data = chronological(matches).map((m, i) => ({
    label: `vs ${m.opponent}`.slice(0, 12) || `M${i + 1}`,
    value: m.totalCorners,
  }));
  return <Trend data={data} dataKey="value" color="#38bdf8" label={`${teamLabel} — recent total corners`} />;
}

export function CardsTrendChart({ matches, teamLabel }: { matches: RecentMatchLine[]; teamLabel: string }) {
  const data = chronological(matches).map((m, i) => ({
    label: `vs ${m.opponent}`.slice(0, 12) || `M${i + 1}`,
    value: m.totalCards,
  }));
  return <Trend data={data} dataKey="value" color="#fbbf24" label={`${teamLabel} — recent total cards`} />;
}
