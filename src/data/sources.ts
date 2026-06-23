/**
 * Mock data sources.
 *
 * In the MVP every source is mocked (`connected: false`). The README explains
 * how to wire each one up to a real provider. Confidence values are what each
 * source would contribute to the data-confidence score once connected.
 */

import type { DataSource } from "@/types";

export const DATA_SOURCES: DataSource[] = [
  {
    id: "fifa-fixtures",
    name: "FIFA Fixtures & Results",
    kind: "fixtures",
    connected: false,
    confidence: "high",
    description:
      "Official World Cup fixtures, kickoff times, stages and final scores.",
  },
  {
    id: "official-match-stats",
    name: "Official Match Stats",
    kind: "match_stats",
    connected: false,
    confidence: "high",
    description:
      "Per-match goals, shots and possession from the official tournament feed.",
  },
  {
    id: "corners-cards-feed",
    name: "Licensed Corners/Cards Feed",
    kind: "corners_cards",
    connected: false,
    confidence: "medium",
    description:
      "Licensed provider for corner counts and disciplinary (card) data.",
  },
  {
    id: "odds-comparison",
    name: "Odds Comparison API",
    kind: "odds",
    connected: false,
    confidence: "medium",
    description:
      "Aggregated bookmaker odds across the supported low-risk markets.",
  },
];
