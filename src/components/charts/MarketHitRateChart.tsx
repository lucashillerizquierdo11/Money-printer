"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MarketHitRateRow {
  label: string;
  rate: number; // 0..1
}

/** Bar chart comparing realised hit rates across markets. */
export function MarketHitRateChart({ rows }: { rows: MarketHitRateRow[] }) {
  const data = rows.map((r) => ({ label: r.label, percent: Math.round(r.rate * 1000) / 10 }));
  return (
    <div className="card">
      <p className="mb-2 text-sm font-medium text-zinc-300">Market hit-rate comparison</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#143123" vertical={false} />
          <XAxis dataKey="label" stroke="#71717a" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke="#71717a" fontSize={11} unit="%" />
          <Tooltip
            contentStyle={{ background: "#0f2419", border: "1px solid #143123", fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(v) => [`${Number(v).toFixed(1)}%`, "Hit rate"]}
          />
          <Bar dataKey="percent" fill="#38bdf8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
