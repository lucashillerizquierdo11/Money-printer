/**
 * Provider registry + resolver.
 *
 * Registering a new data API is a one-line change: implement `StatsProvider`
 * (see `footballData.ts` for a worked example) and add it to `PROVIDERS`
 * below. The resolver then picks the active provider from the `DATA_PROVIDER`
 * env var, or the first configured real provider, falling back to mock.
 */

import type { DataConfidence, DataSource } from "@/types";
import { footballDataProvider } from "./footballData";
import { buildMockDataset, mockProvider } from "./mock";
import type { DataKind, ProviderDataset, ProviderMeta, StatsProvider } from "./types";

export type { DataKind, ProviderDataset, ProviderMeta, StatsProvider } from "./types";

/**
 * Ordered list of every known provider. Real providers come first so a
 * configured one wins over mock when `DATA_PROVIDER` isn't pinned explicitly.
 */
export const PROVIDERS: StatsProvider[] = [footballDataProvider, mockProvider];

export function listProviders(): ProviderMeta[] {
  return PROVIDERS.map((p) => p.meta);
}

/** Pick the active provider: explicit env override → first configured real → mock. */
export function resolveProvider(): StatsProvider {
  const wanted = process.env.DATA_PROVIDER?.trim();
  if (wanted) {
    const found = PROVIDERS.find((p) => p.meta.id === wanted);
    if (found) return found;
  }
  const liveConfigured = PROVIDERS.find((p) => p.meta.id !== "mock" && p.meta.isConfigured);
  return liveConfigured ?? mockProvider;
}

export interface LoadedDataset {
  /** Always-present, fully-coherent mock baseline that drives the analytical pages. */
  baseline: ProviderDataset;
  /** Metadata for the resolved active provider. */
  activeProvider: ProviderMeta;
  /** True when a real (non-mock) provider was used and its fetch succeeded. */
  live: boolean;
  /** Live slices fetched from the active real provider, when `live` is true. */
  liveData?: ProviderDataset;
  /** Error message when a real provider was selected but its fetch failed. */
  error?: string;
  /** Per-source connection status derived from the active provider's coverage. */
  sources: DataSourceStatus[];
}

export interface DataSourceStatus extends DataSource {
  /** Provider id currently serving this kind ("mock" when nothing real covers it). */
  servedBy: string;
}

const SOURCE_DEFS: { id: string; name: string; kind: DataKind; confidence: DataConfidence; description: string }[] = [
  { id: "fixtures", name: "Fixtures & schedule", kind: "fixtures", confidence: "high", description: "World Cup fixtures, kickoff times and stages." },
  { id: "results", name: "Results", kind: "results", confidence: "high", description: "Final scores and match status." },
  { id: "match_stats", name: "Match stats", kind: "match_stats", confidence: "high", description: "Per-match goals and shots feeding tournament form." },
  { id: "corners_cards", name: "Corners & cards", kind: "corners_cards", confidence: "medium", description: "Corner counts and disciplinary data for those markets." },
  { id: "odds", name: "Odds", kind: "odds", confidence: "medium", description: "Bookmaker prices across the supported markets." },
  { id: "player_odds", name: "Player-prop odds", kind: "player_odds", confidence: "medium", description: "Per-player goal/shot prices with boost flags." },
];

function buildSourceStatuses(active: StatsProvider): DataSourceStatus[] {
  return SOURCE_DEFS.map((def) => {
    const servedByActive = active.meta.id !== "mock" && active.meta.covers.includes(def.kind);
    return {
      id: def.id,
      name: def.name,
      kind: def.kind === "player_odds" ? "odds" : def.kind,
      connected: servedByActive,
      confidence: def.confidence,
      description: def.description,
      servedBy: servedByActive ? active.meta.id : "mock",
    };
  });
}

/**
 * Build the dataset for the current configuration. Always returns the mock
 * baseline (so pages render no matter what), plus live slices and status when
 * a real provider is configured and reachable. Never throws — a failed live
 * fetch is reported via `error` and the app continues on mock.
 */
export async function loadDataset(): Promise<LoadedDataset> {
  const baseline = buildMockDataset();
  const active = resolveProvider();
  const sources = buildSourceStatuses(active);

  if (active.meta.id === "mock") {
    return { baseline, activeProvider: active.meta, live: false, sources };
  }

  try {
    const liveData = await active.load();
    return { baseline, activeProvider: active.meta, live: true, liveData, sources };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { baseline, activeProvider: active.meta, live: false, error: message, sources };
  }
}
