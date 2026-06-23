"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Streak survival probability by number of legs: cumulative product of each
 * leg's estimated probability, in the order legs are staked. Makes explicit
 * how fast survival odds fall as more legs are chained.
 */
export function StreakSurvivalChart({ legProbabilities }: { legProbabilities: number[] }) {
  if (legProbabilities.length === 0) return null;

  let cumulative = 1;
  const data = legProbabilities.map((p, i) => {
    cumulative *= p;
    return { legs: i + 1, survival: Math.round(cumulative * 1000) / 10 };
  });

  return (
    <div className="card">
      <p className="mb-2 text-sm font-medium text-zinc-300">Streak survival probability by number of legs</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="legs" stroke="#71717a" fontSize={11} label={{ value: "Legs", position: "insideBottom", offset: -2, fill: "#71717a", fontSize: 11 }} />
          <YAxis stroke="#71717a" fontSize={11} unit="%" />
          <Tooltip
            contentStyle={{ background: "#0f2419", border: "1px solid #143123", fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(v) => [`${Number(v).toFixed(1)}%`, "Survival probability"]}
            labelFormatter={(l) => `${l} legs`}
          />
          <Line type="monotone" dataKey="survival" stroke="#fb7185" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
