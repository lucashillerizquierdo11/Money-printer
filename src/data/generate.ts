/**
 * Deterministic mock-data generator for the World Cup SafeBet Dashboard.
 *
 * Everything here is seeded so the dataset is identical on every render (no
 * hydration mismatches) while still looking varied and realistic. It models
 * NATIONAL-TEAM World Cup football only — group round-robins, a knockout
 * Round of 32, last-5 international form, and current tournament stats.
 *
 * When a real data feed is connected (see README) these generators are the
 * functions you would replace with API calls returning the same shapes.
 */

import type {
  MarketKey,
  OddsSnapshot,
  RecentMatchLine,
  TeamRecentMatchStats,
  TeamTournamentStats,
  WorldCupMatch,
  WorldCupStage,
  WorldCupTeam,
} from "@/types";
import { MARKET_LIST } from "@/lib/markets";
import { GROUPS, TEAMS, getTeam } from "./teams";

// --- Seeded RNG -----------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(...parts: (string | number)[]): () => number {
  return mulberry32(hash(parts.join("|")));
}

/** Draw a Poisson sample (Knuth) for goal-style counts. */
function poisson(lambda: number, rand: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

// --- Team strength --------------------------------------------------------

/** Map FIFA ranking → 0..1 strength (rank 1 strongest). */
export function strengthOf(team: WorldCupTeam): number {
  return clamp(1 - (team.fifaRanking - 1) / 110, 0.25, 0.96);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// --- Last-5 international form --------------------------------------------

const FRIENDLY_OPPONENTS = [
  "Chile", "Peru", "Paraguay", "Scotland", "Wales", "Sweden", "Austria",
  "Turkey", "Greece", "Mali", "Algeria", "Bahrain", "Iraq", "Venezuela",
];

export function generateRecentStats(team: WorldCupTeam): TeamRecentMatchStats {
  const rand = rngFor("recent", team.id);
  const s = strengthOf(team);
  const matches: RecentMatchLine[] = [];

  for (let i = 0; i < 5; i++) {
    const attack = 0.8 + s * 1.9; // stronger sides score more
    const defend = 1.7 - s * 1.1; // stronger sides concede less
    const goalsFor = poisson(attack, rand);
    const goalsAgainst = poisson(Math.max(0.3, defend), rand);
    const corners = 3 + Math.round(rand() * 6 + s * 3); // team corners 3..~11
    const cards = Math.round(rand() * 2 + (1 - s) * 1.5); // weaker sides foul more
    const result: "W" | "D" | "L" =
      goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";

    matches.push({
      opponent: FRIENDLY_OPPONENTS[(hash(team.id) + i) % FRIENDLY_OPPONENTS.length],
      date: isoDaysBeforeTournament(7 + i * 6),
      goalsFor,
      goalsAgainst,
      corners,
      cards,
      result,
    });
  }

  const n = matches.length;
  const sum = (fn: (m: RecentMatchLine) => number) =>
    matches.reduce((acc, m) => acc + fn(m), 0);

  // Opponent corners/cards approximated symmetrically for totals.
  const oppCorners = (m: RecentMatchLine) => Math.max(2, m.corners - 2);
  const oppCards = (m: RecentMatchLine) => Math.max(0, m.cards);

  return {
    teamId: team.id,
    matches,
    avgGoalsFor: round1(sum((m) => m.goalsFor) / n),
    avgGoalsAgainst: round1(sum((m) => m.goalsAgainst) / n),
    avgTotalGoals: round1(sum((m) => m.goalsFor + m.goalsAgainst) / n),
    avgCornersFor: round1(sum((m) => m.corners) / n),
    avgCornersAgainst: round1(sum(oppCorners) / n),
    avgTotalCorners: round1(sum((m) => m.corners + oppCorners(m)) / n),
    avgCardsFor: round1(sum((m) => m.cards) / n),
    avgCardsAgainst: round1(sum(oppCards) / n),
    avgTotalCards: round1(sum((m) => m.cards + oppCards(m)) / n),
  };
}

// --- Tournament schedule & results ---------------------------------------

// Tournament reference clock. "Today" in the mocked tournament is 2026-06-23.
const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");

function isoDaysBeforeTournament(days: number): string {
  const d = new Date(TOURNAMENT_START);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoAt(dayOffset: number, hourUtc: number): string {
  const d = new Date(TOURNAMENT_START);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

const VENUES = [
  "MetLife Stadium, NJ", "SoFi Stadium, LA", "AT&T Stadium, Dallas",
  "Estadio Azteca, Mexico City", "BMO Field, Toronto", "Mercedes-Benz, Atlanta",
  "Lumen Field, Seattle", "Hard Rock Stadium, Miami", "Arrowhead, Kansas City",
];

/** 4-team single round-robin order: returns [matchday][ [homeIdx,awayIdx] ]. */
const ROUND_ROBIN: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [3, 1]],
  [[3, 0], [1, 2]],
];

/** Per-team accumulator for current-tournament stats. */
interface TournAcc {
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  cornersFor: number;
  cornersAgainst: number;
  cardsFor: number;
  cardsAgainst: number;
}

function emptyAcc(): TournAcc {
  return {
    played: 0, goalsFor: 0, goalsAgainst: 0,
    cornersFor: 0, cornersAgainst: 0, cardsFor: 0, cardsAgainst: 0,
  };
}

interface SimResult {
  homeScore: number;
  awayScore: number;
  homeCorners: number;
  awayCorners: number;
  homeCards: number;
  awayCards: number;
}

function simulate(home: WorldCupTeam, away: WorldCupTeam, matchId: string): SimResult {
  const rand = rngFor("sim", matchId);
  const hs = strengthOf(home);
  const as = strengthOf(away);

  const homeLambda = 0.9 + hs * 1.7 - as * 0.5 + 0.15; // slight home edge
  const awayLambda = 0.9 + as * 1.7 - hs * 0.5;
  const homeScore = poisson(Math.max(0.25, homeLambda), rand);
  const awayScore = poisson(Math.max(0.25, awayLambda), rand);

  const totalCorners = 6 + Math.round(rand() * 7 + (hs + as) * 2); // ~6..17
  const homeShare = clamp(0.5 + (hs - as) * 0.35, 0.3, 0.7);
  const homeCorners = Math.round(totalCorners * homeShare);
  const awayCorners = totalCorners - homeCorners;

  const totalCards = Math.round(rand() * 3 + (1 - (hs + as) / 2) * 3); // weaker → more
  const homeCards = Math.round(totalCards * (1 - homeShare));
  const awayCards = totalCards - homeCards;

  return { homeScore, awayScore, homeCorners, awayCorners, homeCards, awayCards };
}

export interface GeneratedData {
  matches: WorldCupMatch[];
  tournamentStats: TeamTournamentStats[];
  odds: OddsSnapshot[];
}

export function generateData(): GeneratedData {
  const matches: WorldCupMatch[] = [];
  const acc = new Map<string, TournAcc>();
  TEAMS.forEach((team) => acc.set(team.id, emptyAcc()));

  // --- Group stage: matchdays 1 & 2 complete, matchday 3 scheduled --------
  GROUPS.forEach((group, gi) => {
    const ids = group.teamIds;
    ROUND_ROBIN.forEach((md, mdIdx) => {
      md.forEach(([hi, ai], slot) => {
        const home = getTeam(ids[hi]);
        const away = getTeam(ids[ai]);
        const id = `g${group.letter}-md${mdIdx + 1}-${slot}`;
        // MD1 & MD2 are played; MD3 is upcoming.
        const complete = mdIdx < 2;
        const dayOffset = mdIdx === 0 ? gi % 4 : mdIdx === 1 ? 5 + (gi % 4) : 13 + (gi % 4);
        const kickoff = isoAt(dayOffset, 15 + (slot * 3));

        const base: WorldCupMatch = {
          id,
          kickoffTime: kickoff,
          stage: "group",
          groupLetter: group.letter,
          homeTeam: home.id,
          awayTeam: away.id,
          status: complete ? "complete" : "scheduled",
          venue: VENUES[(gi + mdIdx + slot) % VENUES.length],
        };

        if (complete) {
          const r = simulate(home, away, id);
          base.homeScore = r.homeScore;
          base.awayScore = r.awayScore;
          base.totalGoals = r.homeScore + r.awayScore;
          base.totalCorners = r.homeCorners + r.awayCorners;
          base.totalCards = r.homeCards + r.awayCards;

          const ha = acc.get(home.id)!;
          const aa = acc.get(away.id)!;
          ha.played++; aa.played++;
          ha.goalsFor += r.homeScore; ha.goalsAgainst += r.awayScore;
          aa.goalsFor += r.awayScore; aa.goalsAgainst += r.homeScore;
          ha.cornersFor += r.homeCorners; ha.cornersAgainst += r.awayCorners;
          aa.cornersFor += r.awayCorners; aa.cornersAgainst += r.homeCorners;
          ha.cardsFor += r.homeCards; ha.cardsAgainst += r.awayCards;
          aa.cardsFor += r.awayCards; aa.cardsAgainst += r.homeCards;
        }

        matches.push(base);
      });
    });
  });

  // --- Knockout: a projected Round of 32 (all scheduled) ------------------
  const qualifiers = projectedQualifiers();
  const knockoutStages: { stage: WorldCupStage; day: number; count: number }[] = [
    { stage: "round_of_32", day: 20, count: 16 },
  ];
  knockoutStages.forEach(({ stage, day, count }) => {
    for (let i = 0; i < count; i++) {
      const home = qualifiers[i];
      const away = qualifiers[qualifiers.length - 1 - i];
      const id = `ko-${stage}-${i}`;
      matches.push({
        id,
        kickoffTime: isoAt(day + Math.floor(i / 2), i % 2 === 0 ? 16 : 20),
        stage,
        homeTeam: home.id,
        awayTeam: away.id,
        status: "scheduled",
        venue: VENUES[i % VENUES.length],
      });
    }
  });

  // --- Build tournament stats from accumulators ---------------------------
  const tournamentStats: TeamTournamentStats[] = TEAMS.map((team) => {
    const a = acc.get(team.id)!;
    const p = Math.max(1, a.played);
    return {
      teamId: team.id,
      matchesPlayed: a.played,
      goalsFor: a.goalsFor,
      goalsAgainst: a.goalsAgainst,
      cornersFor: a.cornersFor,
      cornersAgainst: a.cornersAgainst,
      cardsFor: a.cardsFor,
      cardsAgainst: a.cardsAgainst,
      avgTotalGoals: round1((a.goalsFor + a.goalsAgainst) / p),
      avgTotalCorners: round1((a.cornersFor + a.cornersAgainst) / p),
      avgTotalCards: round1((a.cardsFor + a.cardsAgainst) / p),
    };
  });

  // --- Mock odds for every upcoming match ---------------------------------
  const odds = generateOdds(matches);

  return { matches, tournamentStats, odds };
}

/** Top-2 of each group by ranking + 8 best third-placed teams (projected). */
function projectedQualifiers(): WorldCupTeam[] {
  const firsts: WorldCupTeam[] = [];
  const seconds: WorldCupTeam[] = [];
  const thirds: WorldCupTeam[] = [];
  GROUPS.forEach((group) => {
    const sorted = group.teamIds
      .map(getTeam)
      .sort((a, b) => a.fifaRanking - b.fifaRanking);
    firsts.push(sorted[0]);
    seconds.push(sorted[1]);
    thirds.push(sorted[2]);
  });
  const bestThirds = thirds
    .sort((a, b) => a.fifaRanking - b.fifaRanking)
    .slice(0, 8);
  return [...firsts, ...seconds, ...bestThirds];
}

// --- Mock odds ------------------------------------------------------------

const BOOKMAKERS = ["SafeBook", "OddsHub", "LineMaster"];

/**
 * Generate a mock bookmaker odds snapshot per supported market for every
 * scheduled match. Odds are derived from a fair probability with a small
 * bookmaker margin, so the model can surface both positive and negative edges.
 */
function generateOdds(matches: WorldCupMatch[]): OddsSnapshot[] {
  const snapshots: OddsSnapshot[] = [];

  for (const match of matches) {
    if (match.status !== "scheduled") continue;
    const home = getTeam(match.homeTeam);
    const away = getTeam(match.awayTeam);
    const rand = rngFor("odds", match.id);
    const bookmaker = BOOKMAKERS[hash(match.id) % BOOKMAKERS.length];

    for (const market of MARKET_LIST) {
      const selections: (string | undefined)[] =
        market.key === "team_to_score_over_0_5"
          ? [home.id, away.id]
          : [undefined];

      for (const selection of selections) {
        const fair = fairProbability(market.key, home, away, selection);
        // Bookmaker margin: shave 3–8% off fair prob → slightly worse odds.
        const margin = 1 + (0.03 + rand() * 0.05);
        const bookProb = clamp(fair * margin, 0.02, 0.98);
        const odds = round2(1 / bookProb);
        snapshots.push({
          id: `${match.id}:${market.key}${selection ? ":" + selection : ""}`,
          matchId: match.id,
          marketKey: market.key,
          selection,
          bookmaker,
          odds,
          impliedProbability: round3(1 / odds),
          capturedAt: isoAt(13, 9),
        });
      }
    }
  }

  return snapshots;
}

/** A rough "fair" probability per market from team strengths (mock only). */
function fairProbability(
  key: MarketKey,
  home: WorldCupTeam,
  away: WorldCupTeam,
  selection?: string,
): number {
  const hs = strengthOf(home);
  const as = strengthOf(away);
  const expGoals = 1.1 + (hs + as) * 1.4; // expected total goals
  const expCorners = 8 + (hs + as) * 2.5;
  const expCards = 3.2 + (1 - (hs + as) / 2) * 2.5;

  switch (key) {
    case "over_0_5_goals":
      return poissonOver(expGoals, 0);
    case "over_1_5_goals":
      return poissonOver(expGoals, 1);
    case "over_5_5_corners":
      return poissonOver(expCorners, 5);
    case "over_6_5_corners":
      return poissonOver(expCorners, 6);
    case "over_0_5_cards":
      return poissonOver(expCards, 0);
    case "over_1_5_cards":
      return poissonOver(expCards, 1);
    case "team_to_score_over_0_5": {
      const team = selection === away.id ? away : home;
      const opp = selection === away.id ? home : away;
      const lambda = 0.8 + strengthOf(team) * 1.7 - strengthOf(opp) * 0.4;
      return clamp(1 - Math.exp(-Math.max(0.25, lambda)), 0.05, 0.97);
    }
    case "double_chance":
      // Favourite's double chance (1X) — strong vs weak is very likely.
      return clamp(0.62 + (hs - as) * 0.3, 0.5, 0.95);
    case "draw_no_bet":
      return clamp(0.55 + (hs - as) * 0.35, 0.35, 0.9);
    case "1x2":
      // Home win probability only (context market).
      return clamp(0.4 + (hs - as) * 0.4, 0.15, 0.85);
    default:
      return 0.5;
  }
}

/** P(X > line) for X ~ Poisson(lambda), via complementary CDF. */
function poissonOver(lambda: number, line: number): number {
  // P(X <= line) = sum_{k=0..line} e^-l l^k / k!
  let cdf = 0;
  let term = Math.exp(-lambda);
  for (let k = 0; k <= line; k++) {
    if (k > 0) term *= lambda / k;
    cdf += term;
  }
  return clamp(1 - cdf, 0.02, 0.99);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
