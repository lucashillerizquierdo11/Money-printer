"use client";

/**
 * /settings — tune the value-score weights and app-wide candidate thresholds.
 * Persisted to localStorage via SettingsProvider and applied live on
 * /dashboard, /match/[id], /streak and /boosts.
 */

import { useSettings } from "@/components/SettingsProvider";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { ScoringSettings } from "@/types";
import { DisclaimerFootnote } from "@/components/Disclaimer";

const WEIGHT_FIELDS: { key: keyof ScoringSettings; label: string; help: string }[] = [
  { key: "recentFormWeight", label: "Recent form weight", help: "Last-5 international results." },
  { key: "tournamentFormWeight", label: "Tournament form weight", help: "Performance so far in this World Cup." },
  { key: "oddsValueWeight", label: "Odds value weight", help: "How much positive market edge boosts the score." },
  { key: "marketHitRateWeight", label: "Market hit-rate weight", help: "Historical hit rate of the market." },
  { key: "motivationWeight", label: "Motivation weight", help: "Group/knockout pressure & qualification context." },
  { key: "lineupConfidenceWeight", label: "Lineup confidence weight", help: "Confidence in expected lineups/rotation." },
  { key: "dataConfidenceWeight", label: "Data confidence weight", help: "Trust in the underlying data quality." },
  { key: "streakSafetyWeight", label: "Streak safety weight", help: "Penalises high-variance, high-risk legs." },
];

export default function SettingsPage() {
  const { settings, setSettings, resetSettings } = useSettings();

  function update<K extends keyof ScoringSettings>(key: K, value: number) {
    setSettings({ ...settings, [key]: value });
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Tune how the value score weighs each factor. Changes apply live and
          are saved in this browser only — they never change the underlying
          probability model, only how its output is ranked and filtered.
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">Scoring weights</h2>
        {WEIGHT_FIELDS.map((f) => (
          <WeightSlider
            key={f.key}
            label={f.label}
            help={f.help}
            value={settings[f.key] as number}
            onChange={(v) => update(f.key, v)}
          />
        ))}
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">Boost &amp; thresholds</h2>
        <NumberField
          label="Boost bonus cap (max value-score points a boosted market can add)"
          value={settings.boostBonusCap}
          min={0}
          max={20}
          step={1}
          onChange={(v) => update("boostBonusCap", v)}
        />
        <NumberField
          label="Minimum edge threshold (percentage points)"
          value={Math.round(settings.minEdgeThreshold * 1000) / 10}
          min={-20}
          max={20}
          step={0.5}
          onChange={(v) => update("minEdgeThreshold", v / 100)}
          suffix="pp"
        />
        <NumberField
          label="Minimum estimated probability threshold (%)"
          value={Math.round(settings.minEstimatedProbabilityThreshold * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("minEstimatedProbabilityThreshold", v / 100)}
          suffix="%"
        />
        <button
          onClick={resetSettings}
          className="rounded bg-pitch-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-pitch-600 hover:text-white"
        >
          Reset to defaults
        </button>
      </section>

      <FormulaExplainer settings={settings} />

      <DisclaimerFootnote />
    </div>
  );
}

function WeightSlider({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-zinc-300">
        <span>{label}</span>
        <span className="font-medium text-white">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
      <p className="text-xs text-zinc-500">{help}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-300">
      {label}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="input w-32"
        />
        {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
      </div>
    </label>
  );
}

function FormulaExplainer({ settings }: { settings: ScoringSettings }) {
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS);
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold text-white">The formula, in plain English</h2>
      <p className="text-sm text-zinc-300">
        Each candidate starts with an <strong>estimated hit probability</strong>{" "}
        built from recent form, current tournament form, market hit rate,
        motivation/pressure and lineup confidence. That probability is
        compared against the bookmaker&apos;s <strong>implied probability</strong>{" "}
        (1 / odds) to get the <strong>edge</strong> — a bet is only ever a
        candidate when the edge is positive.
      </p>
      <p className="text-sm text-zinc-300">
        The <strong>value score</strong> (0–100) blends: how high the
        probability is, weighted {settings.recentFormWeight.toFixed(2)}× by
        recent form, {settings.tournamentFormWeight.toFixed(2)}× by
        tournament form, {settings.marketHitRateWeight.toFixed(2)}× by market
        hit rate, {settings.motivationWeight.toFixed(2)}× by motivation, and{" "}
        {settings.lineupConfidenceWeight.toFixed(2)}× by lineup confidence;
        plus the size of the edge (weighted {settings.oddsValueWeight.toFixed(2)}×);
        plus a variance bonus for lower risk (weighted{" "}
        {settings.streakSafetyWeight.toFixed(2)}×); plus a data-confidence
        bonus (weighted {settings.dataConfidenceWeight.toFixed(2)}×); plus up
        to {settings.boostBonusCap} bonus points if the market has an active
        bookmaker boost.
      </p>
      <p className="text-sm text-zinc-300">
        Candidates are then filtered out app-wide if their edge is below{" "}
        {(settings.minEdgeThreshold * 100).toFixed(1)} percentage points, or
        their estimated probability is below{" "}
        {(settings.minEstimatedProbabilityThreshold * 100).toFixed(0)}%.
      </p>
      {isDefault && (
        <p className="text-xs text-zinc-500">Currently using the default weights (all 0.50, neutral).</p>
      )}
    </section>
  );
}
