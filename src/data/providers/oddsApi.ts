/**
 * Real provider: The Odds API (the-odds-api.com, v4), World Cup.
 *
 * An `odds-overlay` provider: it returns bookmaker prices (plus minimal
 * fixtures/teams so prices can be matched by team name) and the resolver
 * overlays them onto a stats graph — the mock baseline by default, or a live
 * graph from another provider. The Odds API's standard markets are match
 * result (h2h) and goal totals, so its coverage of this app's exact over-lines
 * is intentionally thin; API-Football is the fuller live source. Use this to
 * drop sharper match-result/goals prices on top of the model's stats.
 *
 * Configure with `ODDS_API_KEY` (free tier at the-odds-api.com) and optionally
 * `ODDS_API_SPORT` (default `soccer_fifa_world_cup`).
 */

import type { MarketKey, OddsSnapshot, WorldCupMatch, WorldCupTeam } from "@/types";
import { impliedProbability } from "@/lib/probability";
import { normalizeName } from "./merge";
import type { ProviderDataset, StatsProvider } from "./types";

const HOST = "https://api.the-odds-api.com/v4";
const FETCH_TIMEOUT_MS = 9000;

function apiKey(): string | undefined {
  return process.env.ODDS_API_KEY?.trim() || undefined;
}

function sportKey(): string {
  return process.env.ODDS_API_SPORT?.trim() || "soccer_fifa_world_cup";
}

interface OaOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OaEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; title: string; markets: { key: string; outcomes: OaOutcome[] }[] }[];
}

const GOALS_LINE_TO_KEY: Record<string, MarketKey> = { "0.5": "over_0_5_goals", "1.5": "over_1_5_goals" };

function synthTeamId(name: string): string {
  return `oa-${normalizeName(name)}`;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function mapEventOdds(event: OaEvent): OddsSnapshot[] {
  const best = new Map<string, { marketKey: MarketKey; odds: number; bookmaker: string }>();
  const consider = (marketKey: MarketKey, odd: number, bookmaker: string) => {
    if (!Number.isFinite(odd) || odd <= 1) return;
    const cur = best.get(marketKey);
    if (!cur || odd > cur.odds) best.set(marketKey, { marketKey, odds: odd, bookmaker });
  };

  for (const bm of event.bookmakers) {
    for (const market of bm.markets) {
      if (market.key === "h2h") {
        const home = market.outcomes.find((o) => o.name === event.home_team);
        if (home) consider("1x2", home.price, bm.title);
      } else if (market.key === "totals") {
        for (const o of market.outcomes) {
          if (o.name.toLowerCase() !== "over" || o.point == null) continue;
          const key = GOALS_LINE_TO_KEY[String(o.point)];
          if (key) consider(key, o.price, bm.title);
        }
      }
    }
  }

  return [...best.values()].map((b) => ({
    id: `oa-${event.id}:${b.marketKey}`,
    matchId: `oa-${event.id}`,
    marketKey: b.marketKey,
    bookmaker: b.bookmaker,
    odds: round2(b.odds),
    impliedProbability: round3(impliedProbability(b.odds)),
    capturedAt: new Date().toISOString(),
  }));
}

export const oddsApiProvider: StatsProvider = {
  meta: {
    id: "odds-api",
    name: "The Odds API (World Cup)",
    role: "odds-overlay",
    covers: ["odds"],
    isConfigured: apiKey() !== undefined,
    description:
      "Multi-bookmaker World Cup odds (match result + goal totals) from the-odds-api.com, overlaid by team name onto the model's stats. Use it to price markets with real bookmaker lines; corners/cards/player props are not in this feed.",
    docsUrl: "https://the-odds-api.com/liveapi/guides/v4/",
  },
  async load(): Promise<ProviderDataset> {
    const key = apiKey();
    if (!key) throw new Error("ODDS_API_KEY is not set");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let events: OaEvent[];
    try {
      const url = `${HOST}/sports/${sportKey()}/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${key}`;
      const res = await fetch(url, { signal: controller.signal, next: { revalidate: 1800 } });
      if (!res.ok) throw new Error(`The Odds API returned ${res.status} ${res.statusText}`);
      events = (await res.json()) as OaEvent[];
    } finally {
      clearTimeout(timer);
    }
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error("The Odds API returned no World Cup events");
    }

    const teamsById = new Map<string, WorldCupTeam>();
    const matches: WorldCupMatch[] = [];
    const odds: OddsSnapshot[] = [];

    for (const ev of events) {
      for (const name of [ev.home_team, ev.away_team]) {
        const id = synthTeamId(name);
        if (!teamsById.has(id)) {
          teamsById.set(id, {
            id,
            name,
            code: name.slice(0, 3).toUpperCase(),
            confederation: "Unknown",
            fifaRanking: 999,
            groupLetter: "A",
            flag: "🏳️",
          });
        }
      }
      matches.push({
        id: `oa-${ev.id}`,
        kickoffTime: ev.commence_time,
        stage: "group",
        homeTeam: synthTeamId(ev.home_team),
        awayTeam: synthTeamId(ev.away_team),
        status: "scheduled",
      });
      odds.push(...mapEventOdds(ev));
    }

    return { teams: [...teamsById.values()], matches, odds };
  },
};
