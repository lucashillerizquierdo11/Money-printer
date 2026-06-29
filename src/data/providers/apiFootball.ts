/**
 * Real provider: API-Football (api-sports.io, v3), FIFA World Cup (league 1).
 *
 * This is the live "workhorse": one API that supplies fixtures, results,
 * per-match stats (corners/cards), and bookmaker odds, so it can drive the
 * dashboard's edge/EV columns end-to-end. It's a `graph` provider — its team
 * ids, fixtures, stats and odds all reference each other, so scoring is
 * coherent.
 *
 * Configure with `API_FOOTBALL_KEY` (and optionally `API_FOOTBALL_SEASON`,
 * default 2026). Get a key at https://www.api-football.com/. Calls are capped
 * and time-limited so a free-tier key or a slow network can't hang a build;
 * anything it can't fetch simply falls back to the mock generators.
 */

import type {
  GroupLetter,
  MarketKey,
  MatchStatus,
  OddsSnapshot,
  WorldCupMatch,
  WorldCupStage,
  WorldCupTeam,
} from "@/types";
import { impliedProbability } from "@/lib/probability";
import type { ProviderDataset, StatsProvider } from "./types";

const HOST = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1; // FIFA World Cup
const FETCH_TIMEOUT_MS = 9000;
/** Cap per-fixture statistics calls so a free-tier key isn't exhausted. */
const STATS_CALL_CAP = 24;

function apiKey(): string | undefined {
  return process.env.API_FOOTBALL_KEY?.trim() || undefined;
}

function season(): string {
  return process.env.API_FOOTBALL_SEASON?.trim() || "2026";
}

// --- Response shapes (only the fields we read) -----------------------------

interface AfTeam {
  id: number;
  name: string;
  logo?: string;
}

interface AfFixture {
  fixture: { id: number; date: string; status: { short: string }; venue?: { name?: string | null } };
  league: { round?: string | null };
  teams: { home: AfTeam; away: AfTeam };
  goals: { home: number | null; away: number | null };
}

interface AfFixturesResponse {
  response: AfFixture[];
}

interface AfStatItem {
  type: string;
  value: number | string | null;
}

interface AfStatsResponse {
  response: { team: { id: number }; statistics: AfStatItem[] }[];
}

interface AfOddsBetValue {
  value: string;
  odd: string;
}

interface AfOddsResponse {
  paging: { current: number; total: number };
  response: {
    fixture: { id: number };
    bookmakers: { id: number; name: string; bets: { id: number; name: string; values: AfOddsBetValue[] }[] }[];
  }[];
}

// --- Mapping ---------------------------------------------------------------

function mapStatus(short: string): MatchStatus {
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(short)) return "complete";
  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"].includes(short)) return "live";
  return "scheduled";
}

function mapStage(round?: string | null): WorldCupStage {
  const r = (round ?? "").toLowerCase();
  if (r.includes("group")) return "group";
  if (r.includes("round of 32") || r.includes("1/16")) return "round_of_32";
  if (r.includes("round of 16") || r.includes("1/8") || r.includes("last 16")) return "round_of_16";
  if (r.includes("quarter")) return "quarter_final";
  if (r.includes("semi")) return "semi_final";
  if (r.includes("3rd place") || r.includes("third")) return "third_place";
  if (r.includes("final")) return "final";
  return "group";
}

const GROUP_LETTERS = "ABCDEFGHIJKL";

function mapGroup(round?: string | null): GroupLetter | undefined {
  const m = (round ?? "").match(/group\s+([a-l])/i);
  const letter = m?.[1]?.toUpperCase();
  return letter && GROUP_LETTERS.includes(letter) ? (letter as GroupLetter) : undefined;
}

function teamId(id: number): string {
  return `af-${id}`;
}

function toTeam(t: AfTeam, group?: GroupLetter): WorldCupTeam {
  return {
    id: teamId(t.id),
    name: t.name,
    code: t.name.slice(0, 3).toUpperCase(),
    confederation: "Unknown",
    fifaRanking: 999,
    groupLetter: group ?? "A",
    flag: "🏳️",
  };
}

/** "Over 1.5" → 1.5 */
function parseOverLine(value: string): number | null {
  const m = value.match(/over\s+([\d.]+)/i);
  return m ? Number(m[1]) : null;
}

const GOALS_LINE_TO_KEY: Record<string, MarketKey> = { "0.5": "over_0_5_goals", "1.5": "over_1_5_goals" };
const CORNERS_LINE_TO_KEY: Record<string, MarketKey> = { "5.5": "over_5_5_corners", "6.5": "over_6_5_corners" };
const CARDS_LINE_TO_KEY: Record<string, MarketKey> = { "0.5": "over_0_5_cards", "1.5": "over_1_5_cards" };

/** Map one fixture's bookmakers to OddsSnapshots, keeping the best price per market. */
function mapOdds(fixtureId: number, bookmakers: AfOddsResponse["response"][number]["bookmakers"]): OddsSnapshot[] {
  // best[marketKey:selection] = { odds, bookmaker }
  const best = new Map<string, { marketKey: MarketKey; selection?: string; odds: number; bookmaker: string }>();

  const consider = (marketKey: MarketKey, odd: number, bookmaker: string, selection?: string) => {
    if (!Number.isFinite(odd) || odd <= 1) return;
    const k = `${marketKey}:${selection ?? ""}`;
    const cur = best.get(k);
    if (!cur || odd > cur.odds) best.set(k, { marketKey, selection, odds: odd, bookmaker });
  };

  for (const bm of bookmakers) {
    for (const bet of bm.bets) {
      const name = bet.name.toLowerCase();
      for (const v of bet.values) {
        const odd = Number(v.odd);
        if (name === "match winner" && v.value.toLowerCase() === "home") {
          consider("1x2", odd, bm.name);
        } else if (name.includes("double chance")) {
          consider("double_chance", odd, bm.name); // best (longest) DC price seen
        } else if (name.includes("draw no bet")) {
          consider("draw_no_bet", odd, bm.name);
        } else if (name.includes("goals over/under") || name === "over/under") {
          const line = parseOverLine(v.value);
          const key = line != null ? GOALS_LINE_TO_KEY[String(line)] : undefined;
          if (key) consider(key, odd, bm.name);
        } else if (name.includes("corner") && (name.includes("over") || name.includes("total"))) {
          const line = parseOverLine(v.value);
          const key = line != null ? CORNERS_LINE_TO_KEY[String(line)] : undefined;
          if (key) consider(key, odd, bm.name);
        } else if (name.includes("card") && (name.includes("over") || name.includes("total"))) {
          const line = parseOverLine(v.value);
          const key = line != null ? CARDS_LINE_TO_KEY[String(line)] : undefined;
          if (key) consider(key, odd, bm.name);
        }
      }
    }
  }

  return [...best.values()].map((b) => ({
    id: `af-${fixtureId}:${b.marketKey}:${b.selection ?? ""}`,
    matchId: `af-${fixtureId}`,
    marketKey: b.marketKey,
    selection: b.selection,
    bookmaker: b.bookmaker,
    odds: round2(b.odds),
    impliedProbability: round3(impliedProbability(b.odds)),
    capturedAt: new Date().toISOString(),
  }));
}

// --- Fetch -----------------------------------------------------------------

async function fetchJson<T>(path: string, key: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HOST}${path}`, {
      headers: { "x-apisports-key": key },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`API-Football ${path} returned ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export const apiFootballProvider: StatsProvider = {
  meta: {
    id: "api-football",
    name: "API-Football (World Cup)",
    role: "graph",
    covers: ["fixtures", "results", "match_stats", "corners_cards", "odds"],
    isConfigured: apiKey() !== undefined,
    description:
      "Live World Cup fixtures, results, per-match corners/cards stats and multi-bookmaker odds from API-Football (api-sports.io). Supplies the full graph the dashboard scores against. Player-prop boosts stay on the mock generators.",
    docsUrl: "https://www.api-football.com/documentation-v3",
  },
  async load(): Promise<ProviderDataset> {
    const key = apiKey();
    if (!key) throw new Error("API_FOOTBALL_KEY is not set");
    const yr = season();

    // 1) Fixtures + teams.
    const fixturesRes = await fetchJson<AfFixturesResponse>(`/fixtures?league=${LEAGUE_ID}&season=${yr}`, key);
    const fixtures = fixturesRes.response ?? [];
    if (fixtures.length === 0) throw new Error(`API-Football returned no fixtures for season ${yr}`);

    const teamsById = new Map<string, WorldCupTeam>();
    const matches: WorldCupMatch[] = fixtures.map((f) => {
      const group = mapGroup(f.league.round);
      for (const t of [f.teams.home, f.teams.away]) {
        const id = teamId(t.id);
        if (!teamsById.has(id) || (group && teamsById.get(id)!.groupLetter === "A")) {
          teamsById.set(id, toTeam(t, group));
        }
      }
      const status = mapStatus(f.fixture.status.short);
      const hs = f.goals.home ?? undefined;
      const as = f.goals.away ?? undefined;
      const totalGoals = status === "complete" && hs !== undefined && as !== undefined ? hs + as : undefined;
      return {
        id: `af-${f.fixture.id}`,
        kickoffTime: f.fixture.date,
        stage: mapStage(f.league.round),
        groupLetter: group,
        homeTeam: teamId(f.teams.home.id),
        awayTeam: teamId(f.teams.away.id),
        homeScore: hs,
        awayScore: as,
        status,
        totalGoals,
        venue: f.fixture.venue?.name ?? undefined,
      } satisfies WorldCupMatch;
    });

    // 2) Per-fixture corners/cards for finished games (capped to protect quota).
    const finishedIds = fixtures
      .filter((f) => mapStatus(f.fixture.status.short) === "complete")
      .map((f) => f.fixture.id)
      .slice(0, STATS_CALL_CAP);
    const matchById = new Map(matches.map((m) => [m.id, m]));
    await Promise.all(
      finishedIds.map(async (fid) => {
        try {
          const s = await fetchJson<AfStatsResponse>(`/fixtures/statistics?fixture=${fid}`, key);
          let corners = 0;
          let cards = 0;
          for (const teamStats of s.response ?? []) {
            for (const item of teamStats.statistics) {
              const type = item.type.toLowerCase();
              const val = typeof item.value === "number" ? item.value : Number(item.value) || 0;
              if (type.includes("corner")) corners += val;
              if (type.includes("yellow card") || type.includes("red card")) cards += val;
            }
          }
          const m = matchById.get(`af-${fid}`);
          if (m) {
            if (corners > 0) m.totalCorners = corners;
            if (cards > 0) m.totalCards = cards;
          }
        } catch {
          /* one fixture's stats failing shouldn't sink the whole load */
        }
      }),
    );

    // 3) Odds (first page is enough for upcoming-match pricing on free tiers).
    const odds: OddsSnapshot[] = [];
    try {
      const oddsRes = await fetchJson<AfOddsResponse>(`/odds?league=${LEAGUE_ID}&season=${yr}&page=1`, key);
      for (const row of oddsRes.response ?? []) {
        odds.push(...mapOdds(row.fixture.id, row.bookmakers));
      }
    } catch {
      /* odds are optional — without them the dashboard simply shows fewer priced markets */
    }

    return { teams: [...teamsById.values()], matches, odds };
  },
};
