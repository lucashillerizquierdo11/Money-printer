/**
 * Real provider: football-data.org (v4), World Cup competition (`WC`).
 *
 * Free-tier REST API that covers the World Cup fixtures and results. It does
 * NOT expose corners, cards, odds or player props — so this provider only
 * declares `covers: ["fixtures", "results"]`. The resolver keeps the mock
 * generators filling everything else, which is exactly what the provider
 * abstraction is for: each source contributes only what it actually has.
 *
 * Configure with the `FOOTBALL_DATA_API_KEY` env var (get a free key at
 * https://www.football-data.org/client/register). With no key set, the
 * provider reports `isConfigured: false` and the resolver falls back to mock.
 */

import type {
  GroupLetter,
  MatchStatus,
  WorldCupMatch,
  WorldCupStage,
  WorldCupTeam,
} from "@/types";
import type { ProviderDataset, StatsProvider } from "./types";

const BASE_URL = "https://api.football-data.org/v4";
const COMPETITION = "WC";
/** Don't hang an SSG build if the API is slow or blocked by a network policy. */
const FETCH_TIMEOUT_MS = 8000;

function apiKey(): string | undefined {
  return process.env.FOOTBALL_DATA_API_KEY?.trim() || undefined;
}

// --- API response shapes (only the fields we use) --------------------------

interface FdTeamRef {
  id: number;
  name: string;
  tla?: string | null;
  crest?: string | null;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group?: string | null;
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
  score?: { fullTime?: { home: number | null; away: number | null } };
}

interface FdMatchesResponse {
  matches: FdMatch[];
}

// --- Normalization ---------------------------------------------------------

const STAGE_MAP: Record<string, WorldCupStage> = {
  GROUP_STAGE: "group",
  LAST_32: "round_of_32",
  ROUND_OF_32: "round_of_32",
  LAST_16: "round_of_16",
  ROUND_OF_16: "round_of_16",
  QUARTER_FINALS: "quarter_final",
  QUARTER_FINAL: "quarter_final",
  SEMI_FINALS: "semi_final",
  SEMI_FINAL: "semi_final",
  THIRD_PLACE: "third_place",
  FINAL: "final",
};

function mapStage(stage: string): WorldCupStage {
  return STAGE_MAP[stage] ?? "group";
}

function mapStatus(status: string): MatchStatus {
  switch (status) {
    case "FINISHED":
    case "AWARDED":
      return "complete";
    case "IN_PLAY":
    case "PAUSED":
    case "SUSPENDED":
      return "live";
    default:
      return "scheduled";
  }
}

const GROUP_LETTERS: GroupLetter[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function mapGroup(group?: string | null): GroupLetter | undefined {
  if (!group) return undefined;
  const letter = group.replace(/[^A-Z]/gi, "").toUpperCase().slice(-1);
  return (GROUP_LETTERS as string[]).includes(letter) ? (letter as GroupLetter) : undefined;
}

function teamId(ref: FdTeamRef): string {
  return `fd-${ref.id}`;
}

/** Minimal regional-indicator flag from a 3-letter code where we can; 🏳️ otherwise. */
function flagFor(tla?: string | null): string {
  const iso2 = TLA_TO_ISO2[(tla ?? "").toUpperCase()];
  if (!iso2) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (iso2.charCodeAt(0) - 65), A + (iso2.charCodeAt(1) - 65));
}

// Common World Cup nations: FIFA 3-letter code → ISO-2 for flag emoji.
const TLA_TO_ISO2: Record<string, string> = {
  ARG: "AR", BRA: "BR", FRA: "FR", ENG: "GB", ESP: "ES", GER: "DE", POR: "PT",
  NED: "NL", BEL: "BE", ITA: "IT", CRO: "HR", URU: "UY", COL: "CO", MEX: "MX",
  USA: "US", CAN: "CA", JPN: "JP", KOR: "KR", AUS: "AU", SEN: "SN", MAR: "MA",
  GHA: "GH", NGA: "NG", CMR: "CM", EGY: "EG", SUI: "CH", DEN: "DK", SWE: "SE",
  POL: "PL", SRB: "RS", QAT: "QA", KSA: "SA", IRN: "IR", JOR: "JO",
  UZB: "UZ", NZL: "NZ", PAN: "PA", HON: "HN", JAM: "JM", CPV: "CV", CUW: "CW",
  PER: "PE", CHI: "CL", PAR: "PY", SCO: "GB", WAL: "GB", TUR: "TR", GRE: "GR",
};

async function fetchJson<T>(path: string, key: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-Auth-Token": key },
      signal: controller.signal,
      // Revalidate hourly when used inside a Next server component.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new Error(`football-data.org ${path} returned ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(matches: FdMatch[]): ProviderDataset {
  const teamsById = new Map<string, WorldCupTeam>();

  const normalizedMatches: WorldCupMatch[] = matches.map((m) => {
    const groupLetter = mapGroup(m.group);
    for (const ref of [m.homeTeam, m.awayTeam]) {
      if (!ref?.id) continue;
      const id = teamId(ref);
      const existing = teamsById.get(id);
      const team: WorldCupTeam = existing ?? {
        id,
        name: ref.name ?? ref.tla ?? id,
        code: ref.tla ?? "???",
        confederation: "Unknown",
        fifaRanking: 999,
        groupLetter: groupLetter ?? "A",
        flag: flagFor(ref.tla),
      };
      // Prefer a real group letter once we see one for this team.
      if (groupLetter && (!existing || existing.groupLetter === "A")) {
        team.groupLetter = groupLetter;
      }
      teamsById.set(id, team);
    }

    const ft = m.score?.fullTime;
    const status = mapStatus(m.status);
    const homeScore = ft?.home ?? undefined;
    const awayScore = ft?.away ?? undefined;
    const totalGoals =
      status === "complete" && homeScore !== undefined && awayScore !== undefined
        ? homeScore + awayScore
        : undefined;

    return {
      id: `fd-${m.id}`,
      kickoffTime: m.utcDate,
      stage: mapStage(m.stage),
      groupLetter,
      homeTeam: teamId(m.homeTeam),
      awayTeam: teamId(m.awayTeam),
      homeScore,
      awayScore,
      status,
      totalGoals,
    } satisfies WorldCupMatch;
  });

  return {
    teams: [...teamsById.values()],
    matches: normalizedMatches,
  };
}

export const footballDataProvider: StatsProvider = {
  meta: {
    id: "football-data",
    name: "football-data.org (World Cup)",
    role: "graph",
    covers: ["fixtures", "results"],
    isConfigured: apiKey() !== undefined,
    description:
      "Live World Cup fixtures, kickoff times, stages and final scores from the football-data.org v4 API. Corners, cards, odds and player props are not provided by this feed and stay on the mock generators.",
    docsUrl: "https://www.football-data.org/documentation/quickstart",
  },
  async load() {
    const key = apiKey();
    if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
    const data = await fetchJson<FdMatchesResponse>(`/competitions/${COMPETITION}/matches`, key);
    if (!data?.matches?.length) throw new Error("football-data.org returned no World Cup matches");
    return normalize(data.matches);
  },
};
