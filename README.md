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

> **This is a betting-research tool, not financial advice.** It surfaces
> *potential value candidates* — markets where the model's estimated
> probability beats the bookmaker's implied probability — with the odds, edge,
> risk and supporting data shown for each. It never claims a bet is guaranteed,
> safe, a lock, or risk-free. Compounding a bankroll through a streak is
> high-variance; one losing leg resets it to zero. Check your local laws and
> gamble responsibly.

Data is read through a **pluggable provider layer** (`src/data/providers/`).
Each provider implements one `StatsProvider` interface and declares which
data *kinds* it covers (`fixtures`, `results`, `match_stats`, `corners_cards`,
`odds`, `player_odds`).

Each provider also has a **role**: a `graph` provider supplies the entity
graph (teams + matches, usually with stats/odds) and is scored directly; an
`odds-overlay` provider supplies only odds, matched onto a graph by team name.
`loadDataset()` composes a real graph provider with any odds-overlay providers
into one coherent dataset, and reports exactly what is real vs missing.

### Demo data vs live data

The app is **live-only by default**. With no keys configured the dashboard
shows *"No live provider configured"* — it never invents fake bets.

- **Live data** (`live: true`): real fixtures and real bookmaker odds from a
  configured provider. A candidate is only ever shown as real when it is backed
  by real odds. When stats are thin (few completed fixtures), confidence is
  capped **low** and the UI says so.
- **Demo data** (`demo: true`): the built-in mock generators, enabled **only**
  when `NEXT_PUBLIC_ALLOW_DEMO_DATA=true`. Every demo row is labeled "Demo
  data" and is never presented as a real recommendation. Keep this `false` in
  production.

If a live provider fails, the app shows the **provider error** — it does not
silently fall back to mock.

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

### Run locally

```bash
npm install
cp .env.example .env.local   # then edit .env.local
npm run dev                  # http://localhost:3000
```

### Get API keys

- **API-Football** (recommended): register at <https://www.api-football.com/>,
  set `API_FOOTBALL_KEY` and `API_FOOTBALL_SEASON` (e.g. `2026`).
- **The Odds API**: free key at <https://the-odds-api.com/>, set `ODDS_API_KEY`
  (and `ODDS_API_SPORT`, default `soccer_fifa_world_cup`). Overlays real odds
  onto whichever stats graph is active.
- **football-data.org**: free key at
  <https://www.football-data.org/client/register>, set `FOOTBALL_DATA_API_KEY`
  (fixtures/results only — cannot produce edges without an odds source).

`DATA_PROVIDER` optionally pins a provider; otherwise the best configured graph
provider is used and any odds-overlay providers are merged on top.

### Verify live data is connected

1. Open **Data Sources** (`/sources`): the active provider shows **Live**, with
   real-fixtures / real-odds / real-stats flags and fixture/odds/candidate
   counts. Each provider shows whether its key is present (never the value).
2. Open the **dashboard**: the banner reads *"Live"* with a **Live odds** badge,
   and candidate rows show real bookmakers in the Source column.
3. Hit `/api/recommendations` directly to see `live: true` and the `flags`.

### What happens if odds are missing

Edges need odds. If the active provider returns fixtures but no priced markets
(e.g. football-data, or early before books open), the dashboard shows
*"Live fixtures connected, but no priced markets available yet"* and no
candidates — it does **not** fabricate them. Add an odds source (API-Football
or The Odds API) to compute edges.

### How live data flows

`/api/recommendations` → `loadDataset()` composes the active provider(s) into
one dataset and a rich status → `buildFeedMatches()` runs the same
`buildRecommendations` scoring used by mock, then caps confidence and labels
when stats are estimated/missing → the dashboard renders the feed with full
provider/live/demo status. Each candidate carries its odds, implied
probability, estimated probability, edge, risk, confidence, a plain-English
explanation and a source breakdown.

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
