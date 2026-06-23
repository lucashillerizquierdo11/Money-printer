/**
 * Mock World Cup teams & groups — NATIONAL TEAMS ONLY.
 *
 * 48 teams across 12 groups (A–L), matching the modern World Cup format.
 * No clubs, no domestic leagues. FIFA rankings are illustrative mock values.
 */

import type { GroupLetter, WorldCupGroup, WorldCupTeam } from "@/types";

export const TEAMS: WorldCupTeam[] = [
  // Group A
  t("argentina", "Argentina", "ARG", "CONMEBOL", 1, "A", "🇦🇷"),
  t("mexico", "Mexico", "MEX", "CONCACAF", 15, "A", "🇲🇽"),
  t("ghana", "Ghana", "GHA", "CAF", 60, "A", "🇬🇭"),
  t("panama", "Panama", "PAN", "CONCACAF", 40, "A", "🇵🇦"),

  // Group B
  t("france", "France", "FRA", "UEFA", 2, "B", "🇫🇷"),
  t("senegal", "Senegal", "SEN", "CAF", 18, "B", "🇸🇳"),
  t("cameroon", "Cameroon", "CMR", "CAF", 52, "B", "🇨🇲"),
  t("new-zealand", "New Zealand", "NZL", "OFC", 95, "B", "🇳🇿"),

  // Group C
  t("spain", "Spain", "ESP", "UEFA", 3, "C", "🇪🇸"),
  t("uruguay", "Uruguay", "URU", "CONMEBOL", 13, "C", "🇺🇾"),
  t("nigeria", "Nigeria", "NGA", "CAF", 44, "C", "🇳🇬"),
  t("jamaica", "Jamaica", "JAM", "CONCACAF", 55, "C", "🇯🇲"),

  // Group D
  t("england", "England", "ENG", "UEFA", 4, "D", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
  t("usa", "United States", "USA", "CONCACAF", 16, "D", "🇺🇸"),
  t("australia", "Australia", "AUS", "AFC", 24, "D", "🇦🇺"),
  t("honduras", "Honduras", "HON", "CONCACAF", 80, "D", "🇭🇳"),

  // Group E
  t("brazil", "Brazil", "BRA", "CONMEBOL", 5, "E", "🇧🇷"),
  t("switzerland", "Switzerland", "SUI", "UEFA", 19, "E", "🇨🇭"),
  t("egypt", "Egypt", "EGY", "CAF", 36, "E", "🇪🇬"),
  t("uzbekistan", "Uzbekistan", "UZB", "AFC", 57, "E", "🇺🇿"),

  // Group F
  t("portugal", "Portugal", "POR", "UEFA", 6, "F", "🇵🇹"),
  t("colombia", "Colombia", "COL", "CONMEBOL", 12, "F", "🇨🇴"),
  t("iran", "Iran", "IRN", "AFC", 20, "F", "🇮🇷"),
  t("jordan", "Jordan", "JOR", "AFC", 64, "F", "🇯🇴"),

  // Group G
  t("netherlands", "Netherlands", "NED", "UEFA", 7, "G", "🇳🇱"),
  t("japan", "Japan", "JPN", "AFC", 17, "G", "🇯🇵"),
  t("saudi-arabia", "Saudi Arabia", "KSA", "AFC", 58, "G", "🇸🇦"),
  t("cape-verde", "Cape Verde", "CPV", "CAF", 70, "G", "🇨🇻"),

  // Group H
  t("belgium", "Belgium", "BEL", "UEFA", 8, "H", "🇧🇪"),
  t("south-korea", "South Korea", "KOR", "AFC", 23, "H", "🇰🇷"),
  t("qatar", "Qatar", "QAT", "AFC", 34, "H", "🇶🇦"),
  t("curacao", "Curaçao", "CUW", "CONCACAF", 82, "H", "🇨🇼"),

  // Group I
  t("germany", "Germany", "GER", "UEFA", 9, "I", "🇩🇪"),
  t("denmark", "Denmark", "DEN", "UEFA", 21, "I", "🇩🇰"),
  t("canada", "Canada", "CAN", "CONCACAF", 30, "I", "🇨🇦"),
  t("bolivia", "Bolivia", "BOL", "CONMEBOL", 85, "I", "🇧🇴"),

  // Group J
  t("croatia", "Croatia", "CRO", "UEFA", 10, "J", "🇭🇷"),
  t("serbia", "Serbia", "SRB", "UEFA", 29, "J", "🇷🇸"),
  t("tunisia", "Tunisia", "TUN", "CAF", 41, "J", "🇹🇳"),
  t("haiti", "Haiti", "HAI", "CONCACAF", 90, "J", "🇭🇹"),

  // Group K
  t("morocco", "Morocco", "MAR", "CAF", 11, "K", "🇲🇦"),
  t("poland", "Poland", "POL", "UEFA", 28, "K", "🇵🇱"),
  t("ivory-coast", "Ivory Coast", "CIV", "CAF", 43, "K", "🇨🇮"),
  t("oman", "Oman", "OMA", "AFC", 76, "K", "🇴🇲"),

  // Group L
  t("italy", "Italy", "ITA", "UEFA", 14, "L", "🇮🇹"),
  t("ecuador", "Ecuador", "ECU", "CONMEBOL", 26, "L", "🇪🇨"),
  t("costa-rica", "Costa Rica", "CRC", "CONCACAF", 54, "L", "🇨🇷"),
  t("norway", "Norway", "NOR", "UEFA", 33, "L", "🇳🇴"),
];

function t(
  id: string,
  name: string,
  code: string,
  confederation: string,
  fifaRanking: number,
  groupLetter: GroupLetter,
  flag: string,
): WorldCupTeam {
  return { id, name, code, confederation, fifaRanking, groupLetter, flag };
}

export const GROUP_LETTERS: GroupLetter[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

export const GROUPS: WorldCupGroup[] = GROUP_LETTERS.map((letter) => ({
  letter,
  name: `Group ${letter}`,
  teamIds: TEAMS.filter((team) => team.groupLetter === letter).map((x) => x.id),
}));

const TEAM_BY_ID = new Map(TEAMS.map((team) => [team.id, team]));

export function getTeam(id: string): WorldCupTeam {
  const team = TEAM_BY_ID.get(id);
  if (!team) throw new Error(`Unknown team id: ${id}`);
  return team;
}

export function getTeamSafe(id: string): WorldCupTeam | undefined {
  return TEAM_BY_ID.get(id);
}
