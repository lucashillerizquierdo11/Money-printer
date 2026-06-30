/**
 * Provider registry, resolver and dataset loader.
 *
 * Registering a new data API is a one-line change: implement `StatsProvider`
 * and add it to `PROVIDERS`. The loader then composes the active configuration
 * into a single coherent dataset and reports exactly what is real vs missing.
 *
 * Composition (when `DATA_PROVIDER` is not pinned):
 *  - base graph  = first configured real `graph` provider (api-football,
 *                  football-data). If none and demo is allowed, the mock
 *                  generators. If none and demo is off, an empty dataset.
 *  - odds overlay = every configured `odds-overlay` provider (odds-api),
 *                  whose prices are matched onto the base graph by team name.
 *
 * Honesty: mock data is only ever used when `NEXT_PUBLIC_ALLOW_DEMO_DATA` is
 * "true" (demo mode), and is always reported as `demo`, never silently mixed
 * into real recommendations.
 */

import { apiFootballProvider } from "./apiFootball";
import { footballDataProvider } from "./footballData";
import { buildGraphDataset, overlayOdds } from "./merge";
import { buildMockDataset, mockProvider } from "./mock";
import { oddsApiProvider } from "./oddsApi";
import type { DataKind, ProviderDataset, ProviderMeta, StatsProvider } from "./types";

export type { DataKind, ProviderDataset, ProviderMeta, StatsProvider } from "./types";

export const PROVIDERS: StatsProvider[] = [
  apiFootballProvider,
  oddsApiProvider,
  footballDataProvider,
  mockProvider,
];

export const ALL_DATA_KINDS: DataKind[] = [
  "fixtures",
  "results",
  "match_stats",
  "corners_cards",
  "odds",
  "player_odds",
];

/** Demo/mock data is only permitted when explicitly enabled. */
export function demoAllowed(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_DEMO_DATA === "true";
}

export function listProviders(): ProviderMeta[] {
  return PROVIDERS.map((p) => p.meta);
}

function configuredReal(): StatsProvider[] {
  return PROVIDERS.filter((p) => p.meta.id !== "mock" && p.meta.isConfigured);
}

/** Back-compat single-provider resolver (used by the /sources summary). */
export function resolveProvider(): StatsProvider {
  const wanted = process.env.DATA_PROVIDER?.trim();
  if (wanted) {
    const found = PROVIDERS.find((p) => p.meta.id === wanted);
    if (found) return found;
  }
  return configuredReal()[0] ?? mockProvider;
}

interface Composition {
  base: StatsProvider | null;
  overlays: StatsProvider[];
  /** True when the base is the mock provider (demo mode). */
  demo: boolean;
}

function resolveComposition(): Composition {
  const real = configuredReal();
  const graphs = real.filter((p) => p.meta.role === "graph");
  const overlays = real.filter((p) => p.meta.role === "odds-overlay");
  const demoOk = demoAllowed();

  const pinnedId = process.env.DATA_PROVIDER?.trim();
  if (pinnedId) {
    const pinned = PROVIDERS.find((p) => p.meta.id === pinnedId);
    if (pinned?.meta.id === "mock") {
      return demoOk ? { base: mockProvider, overlays: [], demo: true } : { base: null, overlays: [], demo: false };
    }
    if (pinned && pinned.meta.role === "graph") {
      return { base: pinned, overlays, demo: false };
    }
    if (pinned && pinned.meta.role === "odds-overlay") {
      const base = graphs[0] ?? (demoOk ? mockProvider : null);
      // If there's no stats graph, fall back to using the overlay itself as a
      // (stats-less) graph so its fixtures/odds can still be shown.
      if (!base) return { base: pinned, overlays: [], demo: false };
      return { base, overlays: [pinned], demo: base.meta.id === "mock" };
    }
    // Pinned to something unknown/unconfigured — fall through to auto.
  }

  if (graphs[0]) return { base: graphs[0], overlays, demo: false };
  if (overlays[0]) return { base: overlays[0], overlays: overlays.slice(1), demo: false };
  if (demoOk) return { base: mockProvider, overlays: [], demo: true };
  return { base: null, overlays: [], demo: false };
}

// ---------------------------------------------------------------------------
// Status + loaded dataset
// ---------------------------------------------------------------------------

export interface DatasetStatus {
  provider: { id: string; name: string; role: string; covers: DataKind[]; missingKinds: DataKind[] };
  /** A real provider's data is in use. */
  live: boolean;
  /** Mock/demo data is in use (explicitly enabled). */
  demo: boolean;
  /** Any real provider is configured. */
  configured: boolean;
  lastUpdated: string;
  warnings: string[];
  errors: string[];
  oddsReal: boolean;
  fixturesReal: boolean;
  statsReal: boolean;
  fixtureCount: number;
  oddsCount: number;
}

export interface LoadedDataset {
  dataset: ProviderDataset;
  status: DatasetStatus;
}

const EMPTY_DATASET: ProviderDataset = {
  teams: [],
  matches: [],
  recentStats: {},
  tournamentStats: [],
  odds: [],
  playerOdds: [],
};

function coveredKinds(base: StatsProvider | null, overlays: StatsProvider[]): Set<DataKind> {
  const set = new Set<DataKind>();
  for (const p of [base, ...overlays]) {
    if (!p) continue;
    for (const k of p.meta.covers) set.add(k);
  }
  return set;
}

function hasRealResults(ds: ProviderDataset): boolean {
  return (ds.tournamentStats ?? []).some((s) => s.matchesPlayed > 0);
}

/**
 * Load + compose the dataset for the current configuration, never throwing.
 * Reports a rich status describing exactly what is live, demo, real or missing
 * so the UI can be honest about every number it shows.
 */
export async function loadDataset(): Promise<LoadedDataset> {
  const { base, overlays, demo } = resolveComposition();
  const configured = configuredReal().length > 0;
  const warnings: string[] = [];
  const errors: string[] = [];

  // No usable provider — not configured (and demo not enabled).
  if (!base) {
    return {
      dataset: EMPTY_DATASET,
      status: {
        provider: { id: "none", name: "No provider configured", role: "none", covers: [], missingKinds: ALL_DATA_KINDS },
        live: false,
        demo: false,
        configured,
        lastUpdated: new Date().toISOString(),
        warnings: configured
          ? ["A provider is configured but could not be composed — check DATA_PROVIDER and NEXT_PUBLIC_ALLOW_DEMO_DATA."]
          : ["No live provider configured. Add API keys in .env.local to see real potential bets."],
        errors,
        oddsReal: false,
        fixturesReal: false,
        statsReal: false,
        fixtureCount: 0,
        oddsCount: 0,
      },
    };
  }

  // --- Demo (mock) path -----------------------------------------------------
  if (demo || base.meta.id === "mock") {
    const dataset = buildMockDataset();
    return {
      dataset,
      status: buildStatus({
        base: mockProvider,
        overlays: [],
        dataset,
        live: false,
        demo: true,
        configured,
        warnings: ["Demo data is enabled (NEXT_PUBLIC_ALLOW_DEMO_DATA=true). These are illustrative mock bets, not real recommendations."],
        errors,
        oddsReal: false,
        fixturesReal: false,
        statsReal: false,
      }),
    };
  }

  // --- Live path ------------------------------------------------------------
  let graph: ProviderDataset;
  try {
    const baseData = await base.load();
    if ((baseData.teams?.length ?? 0) === 0 || (baseData.matches?.length ?? 0) === 0) {
      throw new Error(`${base.meta.name} returned no fixtures`);
    }
    graph = buildGraphDataset(baseData);
  } catch (err) {
    errors.push(`${base.meta.name}: ${err instanceof Error ? err.message : String(err)}`);
    return {
      dataset: EMPTY_DATASET,
      status: {
        provider: { id: base.meta.id, name: base.meta.name, role: base.meta.role, covers: base.meta.covers, missingKinds: ALL_DATA_KINDS },
        live: false,
        demo: false,
        configured,
        lastUpdated: new Date().toISOString(),
        warnings,
        errors,
        oddsReal: false,
        fixturesReal: false,
        statsReal: false,
        fixtureCount: 0,
        oddsCount: 0,
      },
    };
  }

  // Overlay odds providers onto the real graph.
  const activeOverlays: StatsProvider[] = [];
  for (const ov of overlays) {
    try {
      const ovData = await ov.load();
      graph = overlayOdds(graph, ovData);
      activeOverlays.push(ov);
    } catch (err) {
      warnings.push(`${ov.meta.name} odds overlay unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const oddsCount = graph.odds?.length ?? 0;
  const statsReal = hasRealResults(graph);
  const baseCoversOdds = base.meta.covers.includes("odds") || activeOverlays.length > 0;

  if (oddsCount === 0) {
    warnings.push(
      baseCoversOdds
        ? "Live fixtures connected, but no priced markets are available yet."
        : `${base.meta.name} provides fixtures/results only — add an odds source (API-Football or The Odds API) to compute edges.`,
    );
  }
  if (!statsReal) {
    warnings.push("No completed fixtures yet — probability estimates are weak and confidence is capped low.");
  }

  return {
    dataset: graph,
    status: buildStatus({
      base,
      overlays: activeOverlays,
      dataset: graph,
      live: true,
      demo: false,
      configured,
      warnings,
      errors,
      oddsReal: oddsCount > 0,
      fixturesReal: true,
      statsReal,
    }),
  };
}

function buildStatus(args: {
  base: StatsProvider;
  overlays: StatsProvider[];
  dataset: ProviderDataset;
  live: boolean;
  demo: boolean;
  configured: boolean;
  warnings: string[];
  errors: string[];
  oddsReal: boolean;
  fixturesReal: boolean;
  statsReal: boolean;
}): DatasetStatus {
  const covers = [...coveredKinds(args.base, args.overlays)];
  const missingKinds = ALL_DATA_KINDS.filter((k) => !covers.includes(k));
  const overlayNames = args.overlays.map((o) => o.meta.name);
  const name = overlayNames.length > 0 ? `${args.base.meta.name} + ${overlayNames.join(" + ")}` : args.base.meta.name;
  return {
    provider: { id: args.base.meta.id, name, role: args.base.meta.role, covers, missingKinds },
    live: args.live,
    demo: args.demo,
    configured: args.configured,
    lastUpdated: new Date().toISOString(),
    warnings: args.warnings,
    errors: args.errors,
    oddsReal: args.oddsReal,
    fixturesReal: args.fixturesReal,
    statsReal: args.statsReal,
    fixtureCount: args.dataset.matches?.length ?? 0,
    oddsCount: args.dataset.odds?.length ?? 0,
  };
}
