# World Cup SafeBet Dashboard — MVP

A **FIFA World Cup-only** dashboard for tournament betting research. See upcoming
World Cup matches and compare relatively **low-risk betting markets** per game,
with model-estimated probabilities, bookmaker odds, edge, risk level and data
confidence.

> ⚠️ **Research tool, not financial advice.** Every suggestion is an
> *"estimated safer pick"*, never a guaranteed bet. The goal is to help you
> **avoid bad bets** — not to promise profit. Bet responsibly and only stake
> what you can afford to lose.

---

## Scope (read this first)

This first version is **World Cup-only by design**:

- ✅ Only FIFA World Cup fixtures, teams, groups and knockout matches.
- ✅ All mock data is World Cup-style **national team** data.
- ✅ Optimised for **tournament** betting research (group dynamics, knockout
  caution, qualification pressure) — not general football.
- ❌ **No** club teams.
- ❌ **No** other competitions (Premier League, Champions League, MLS, etc.).
- ❌ **No** generic league/competition selection.

If you need multi-competition support later, it is intentionally **not** part of
this MVP.

## Supported markets

The dashboard focuses on relatively low-risk markets:

| Market | Focus |
| --- | --- |
| Over 0.5 total goals | ✅ safe focus |
| Over 1.5 total goals | ✅ safe focus |
| Over 5.5 total corners | ✅ safe focus |
| Over 6.5 total corners | ✅ safe focus |
| Over 0.5 total cards | ✅ safe focus |
| Over 1.5 total cards | ✅ safe focus |
| Team to score over 0.5 | ✅ safe focus |
| Double chance | ✅ safe focus |
| Draw no bet | ✅ safe focus |
| 1X2 | context only — **not** a safe-bet focus |

## Pages

1. **Dashboard** (`/`) — upcoming World Cup matches only, split into **group**
   and **knockout** stages. Columns: date/time, stage (Group A…, Round of 32…),
   match, best low-risk market, estimated probability, odds, implied
   probability, edge, risk level, data confidence.
2. **Match detail** (`/match/[id]`) — team comparison for the two national
   teams, last 5 international matches each, current World Cup performance,
   group-table context (group stage), goals/corners/cards for & against and per
   match, plus realised market hit rates and all priced safer picks.
3. **Tournament Overview** (`/overview`) — matches per day, 0–0 count,
   % of matches over 0.5 goals / 5.5 corners / 0.5 cards, average
   goals/corners/cards per match, and a table of all completed matches.
4. **Groups** (`/groups`) — all 12 groups with standings (P/W/D/L/GF/GA/GD/Pts),
   upcoming group fixtures, and a **qualification-pressure** indicator
   (must win / likely needs points / already qualified / already eliminated).

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
  `Recommendation`, `DataSource`, `GroupStanding`.
- **Mock data** — `src/data/` generates a deterministic World Cup dataset:
  48 national teams across 12 groups (A–L), 48 completed + 40 upcoming matches
  (group round-robins + a projected Round of 32), last-5 international form,
  current tournament stats, and mock odds for every supported market.
- **Scoring** — `src/lib/scoring.ts` combines seven World Cup-specific factors:
  1. Recent team form (last 5 internationals)
  2. Current World Cup tournament performance
  3. Group-stage vs knockout-stage context
  4. Motivation pressure (see below)
  5. Market hit rate
  6. Implied probability from bookmaker odds
  7. Data confidence

### Motivation adjustment

`motivationAdjustment()` in `src/lib/scoring.ts` nudges confidence based on team
intent, because motivation changes how matches are played:

- **Group match, both teams need points** → slightly increase goal/corner
  confidence (open, attacking game).
- **Knockout match** → slightly decrease goal confidence, especially Over 1.5
  (knockouts trend cautious).
- **Heavy favourite vs weak team** → increase the favourite's team-to-score
  confidence.
- **Already-qualified team** → lower data confidence (rotation risk).

Qualification pressure comes from `src/lib/standings.ts`, which builds each
group's table and classifies every team as *must win / likely needs points /
already qualified / already eliminated / in contention*.

## Connecting real data later

The MVP ships with **mock** data sources (`src/data/sources.ts`, all
`connected: false`). To go live, replace the generators in `src/data/generate.ts`
with API calls that return the **same TypeScript shapes**. The four feeds to
wire up:

1. **FIFA fixtures/results data** → fixtures, kickoff times, stages and final
   scores. Populates `WorldCupMatch` (and drives `status`).
2. **Official match stats** → per-match goals (and shots/possession) feeding
   `TeamTournamentStats` and `WorldCupMatch.totalGoals`.
3. **Licensed corners/cards data** → corner and card counts feeding
   `WorldCupMatch.totalCorners` / `totalCards` and the corner/card markets.
4. **Odds comparison APIs** → bookmaker prices for each supported market,
   producing `OddsSnapshot` records (and `impliedProbability`).

Because every interface is database-ready, you can also persist these shapes
directly to SQL/NoSQL and swap the in-memory store for queries.

## Tech stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- No backend required for the MVP — all data is generated client/server-side
  from typed mock generators.

## Responsible-use note

This tool surfaces **estimated safer picks** to help avoid clearly bad bets. It
does **not** guarantee outcomes, and model estimates can be wrong. Nothing here
is financial advice. Check your local laws and gamble responsibly.
