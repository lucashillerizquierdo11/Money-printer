# World Cup Streak Value Finder — MVP

A **FIFA World Cup-only** dashboard for tournament betting research. It ranks
candidate markets by **estimated value against bookmaker odds** and by
**suitability for a compounding streak**, with full transparency on
probability, risk and the chance the whole streak survives.

> ⚠️ **Research tool, not financial advice.** No bet here is ever called
> *"guaranteed"*, and nothing is called *"safe"* without a risk rating next to
> it. Every candidate shows an estimated hit probability, a value score, a
> risk rating, a data-confidence label and a streak-suitability tag
> (`strong_candidate` / `consider` / `avoid`). Streaking compounds risk fast —
> one loss resets the whole streak to zero. Bet responsibly and only stake
> what you can afford to lose.

---

## Scope (read this first)

This MVP is **World Cup-only by design**:

- ✅ Only FIFA World Cup fixtures, teams, groups and knockout matches.
- ✅ All mock data is World Cup-style **national team** data.
- ✅ Optimised for **tournament** betting research (group dynamics, knockout
  caution, qualification pressure) — not general football.
- ❌ **No** club teams.
- ❌ **No** other competitions (Premier League, Champions League, MLS, etc.).
- ❌ **No** generic league/competition selection.

## Core principle

```
impliedProbability = 1 / decimalOdds
edge = estimatedProbability - impliedProbability
```

A bet is only ever shown as a value candidate when
`estimatedProbability > impliedProbability`. Example: odds of 1.20 imply
83.33%; if the model's estimated true probability is 88%, the edge is
**+4.67 percentage points**.

For a streak of legs, the chance the **whole streak survives** is the product
of each leg's estimated probability:

```
combinedStreakProbability = leg1.probability × leg2.probability × … × legN.probability
```

Example: 10 legs at 85% each → `0.85^10 ≈ 19.7%` chance of completing the
streak. The Streak Builder page always shows this number next to the payout
multiplier, never the multiplier alone.

## Supported markets

| Market | Streak focus |
| --- | --- |
| Over 0.5 total goals | ✅ |
| Over 1.5 total goals | ✅ |
| Over 5.5 total corners | ✅ |
| Over 6.5 total corners | ✅ |
| Over 0.5 total cards | ✅ |
| Over 1.5 total cards | ✅ |
| Favorite team over 0.5 goals | ✅ |
| Both teams combined over 0.5 goals | ✅ (same outcome as Over 0.5 goals, priced separately by bet-builder tools) |
| Double chance | ✅ |
| Draw no bet | ✅ |
| Player over 0.5 goals | ✅ — **only** ever shown when a bookmaker boost is active on that quote |
| Star player — shot on target | placeholder, context only, never a streak candidate |
| 1X2 | context only — not a streak-focus market |
| Bet builder combinations | shown only when the app can calculate **both** the combined probability **and** the hidden correlation risk |

## Pages

1. **Dashboard** (`/`) — upcoming World Cup matches, split into group and
   knockout stages, each row showing its top value candidate: estimated
   probability, odds, edge, value score, risk rating, data confidence and
   streak-suitability tag.
2. **Match detail** (`/match/[id]`) — all value candidates for the match,
   boosted-only player props, an example bet-builder combination (with hidden
   correlation-risk warnings), team comparison, group-table context, recent
   form and realised market hit rates.
3. **Streak Builder** (`/streak-builder`) — pick legs across multiple
   upcoming matches, enter a starting bankroll, and see the combined survival
   probability, combined odds, projected payout, "one loss resets the streak"
   messaging, and a prompt to consider a lower-risk staking strategy when the
   streak gets long or risky.
4. **Tournament Overview** (`/overview`) — matches per day, 0–0 count, market
   hit-rate shares, average goals/corners/cards per match, and a table of all
   completed matches.
5. **Groups** (`/groups`) — all 12 groups with standings and a
   qualification-pressure indicator (must win / likely needs points / already
   qualified / already eliminated).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (also runs type checks)
npm run typecheck
```

Requires Node 18+ (developed on Node 22).

## How it works

- **Data model** — `src/types/index.ts` defines database-ready interfaces:
  `WorldCupTeam`, `WorldCupGroup`, `WorldCupMatch`, `WorldCupStage`,
  `TeamRecentMatchStats`, `TeamTournamentStats`, `Market`, `OddsSnapshot`,
  `Recommendation`, `DataSource`, `GroupStanding`, `WorldCupPlayer`,
  `PlayerPropOdds`, `BetBuilderLeg`, `BetBuilderSummary`, `StreakLeg`,
  `StreakSummary`.
- **Mock data** — `src/data/` generates a deterministic World Cup dataset:
  national teams across 12 groups (A–L), completed + upcoming matches,
  last-5 international form, current tournament stats, mock odds for every
  supported market, and mock player-goal odds (some boosted).
- **Value scoring** — `src/lib/value.ts` computes `impliedProbability`,
  `edge`, a `riskLevel`, a 0–100 `valueScore` (weighted by probability, edge,
  variance, data confidence and an odds penalty for very short prices), a
  `streakSuitability` classification, and a `trapWarning` for low-odds/
  low-edge "safe-looking" picks.
- **Recommendation scoring** — `src/lib/scoring.ts` combines seven World
  Cup-specific factors (recent form, current tournament performance, stage
  context, motivation, market hit rate, bookmaker odds, data confidence) into
  each market's estimated probability, then runs it through `value.ts`.
- **Streak math** — `src/lib/streak.ts` computes the combined survival
  probability and combined odds for a set of selected legs, and always
  surfaces the "one loss resets the streak" framing plus a lower-risk
  staking suggestion when the streak is long, low-probability, or contains
  high-risk legs.
- **Bet builder** — `src/lib/betBuilder.ts` computes a naive combined
  probability for legs within one match, but never without the accompanying
  "hidden risk" disclosure — correlated legs (goals/team-goals/result
  markets) make the naive multiplication optimistic.
- **Player props** — `src/lib/playerProps.ts` only ever returns a
  recommendation for `player_over_0_5_goals` when the underlying quote is
  boosted; un-boosted player-goal quotes are filtered out before they reach
  the UI.

### Motivation adjustment

`motivationAdjustment()` in `src/lib/scoring.ts` nudges confidence based on
team intent, because motivation changes how matches are played:

- **Group match, both teams need points** → slightly increase goal/corner
  confidence (open, attacking game).
- **Knockout match** → slightly decrease goal confidence, especially Over 1.5
  (knockouts trend cautious).
- **Heavy favourite vs weak team** → increase the favourite's
  favorite-team-over-0.5 confidence.
- **Already-qualified team** → lower data confidence (rotation risk).

Qualification pressure comes from `src/lib/standings.ts`, which builds each
group's table and classifies every team as *must win / likely needs points /
already qualified / already eliminated / in contention*.

## Connecting real data

Data is read through a **pluggable provider layer** (`src/data/providers/`).
Each provider implements one `StatsProvider` interface and declares which
data *kinds* it covers (`fixtures`, `results`, `match_stats`, `corners_cards`,
`odds`, `player_odds`). The resolver picks the active provider and the
built-in mock generators fill any kinds a real feed doesn't cover, so every
page always has a complete, coherent dataset.

Each provider also has a **role**: a `graph` provider supplies the entity
graph (teams + matches, usually with stats/odds) and is scored directly; an
`odds-overlay` provider supplies only odds, matched onto a graph by team name.

### Built-in providers

- **`mock`** (`providers/mock.ts`) — deterministic, seeded generators covering
  every kind. Always available, no key required. This is the fallback.
- **`api-football`** (`providers/apiFootball.ts`) — **recommended live source.**
  Fixtures, results, per-match corners/cards and multi-bookmaker odds from
  [API-Football](https://www.api-football.com) (`covers: fixtures, results,
  match_stats, corners_cards, odds`). Being a `graph` provider with odds, it
  drives the dashboard's edge/EV end-to-end.
- **`odds-api`** (`providers/oddsApi.ts`) — match-result + goal-totals odds
  from [The Odds API](https://the-odds-api.com), an `odds-overlay` matched by
  team name onto the model's stats. Use it to price markets with real
  bookmaker lines on top of the mock (or another graph's) stats.
- **`football-data`** (`providers/footballData.ts`) — fixtures and results only
  from [football-data.org](https://www.football-data.org) (no odds, so no
  edges on their own).

### Turning on live data

1. Get a key for your chosen provider (see links above).
2. Copy `.env.example` to `.env.local`, set the relevant key (e.g.
   `API_FOOTBALL_KEY`) and optionally pin `DATA_PROVIDER`.
3. The **dashboard** computes edge/EV against the active provider via
   `/api/recommendations`, with a banner showing whether it's live or mock and
   automatic mock fallback if a fetch fails. The **Data Sources** page
   (`/sources`) shows the active provider, live-fetch status, live fixtures and
   per-kind coverage.

### How live data flows

`/api/recommendations` → `loadDataset()` resolves + merges the active provider
into one coherent dataset → `recommendationsFromDataset()` runs the same
`buildRecommendations` scoring used by mock → the dashboard renders the
resulting edge/EV. A graph provider that returns fixtures but no odds (e.g.
football-data) yields no priced markets, so the route falls back to mock with
an explanatory note rather than showing an empty board.

### Adding another API

Implement `StatsProvider` (see `footballData.ts` as a worked example),
returning the shared `@/types` shapes for whichever kinds you cover, then add
your provider to the `PROVIDERS` array in `providers/index.ts`. Nothing else
needs to change — selection, fallback and the `/sources` status page pick it
up automatically. Because every interface is database-ready, you can also
persist these shapes directly to SQL/NoSQL behind a provider.

## Tech stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- No backend required for the MVP — all data is generated client/server-side
  from typed, deterministic mock generators.

## Responsible-use note

This tool surfaces **estimated value candidates** and **streak-suitability**
labels to help with research, not to promise outcomes. It does **not**
guarantee any bet, and model estimates can be wrong. Compounding a bankroll
through a betting streak is high-variance — a single loss resets progress to
zero. Nothing here is financial advice. Check your local laws and gamble
responsibly.
