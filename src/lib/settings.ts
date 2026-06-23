/**
 * User-tunable scoring settings (Settings page).
 *
 * The underlying probability estimate (`estimatedProbability`) already blends
 * recent form, tournament form, market hit rate, motivation and data
 * confidence upstream in `scoring.ts` — that pipeline is deterministic mock
 * data, not something we want to recompute per-request. Instead, the weights
 * here re-blend the value-score components (probability / edge / variance /
 * confidence / boost bonus) at render time, so every weight on `/settings`
 * has a real, visible effect without rearchitecting the estimator.
 */

import type { Recommendation, RecommendationLabel, ScoringSettings } from "@/types";
import { recommendationLabelOf } from "./value";

export type ScoredRecommendation = Recommendation & { recommendationLabel: RecommendationLabel };

export const DEFAULT_SETTINGS: ScoringSettings = {
  recentFormWeight: 0.5,
  tournamentFormWeight: 0.5,
  oddsValueWeight: 0.5,
  marketHitRateWeight: 0.5,
  motivationWeight: 0.5,
  lineupConfidenceWeight: 0.5,
  dataConfidenceWeight: 0.5,
  streakSafetyWeight: 0.5,
  boostBonusCap: 5,
  minEdgeThreshold: 0,
  minEstimatedProbabilityThreshold: 0,
};

export const SETTINGS_STORAGE_KEY = "wcsvf:scoring-settings";

/** Average of the weights that feed into the headline probability component. */
function probabilityWeight(s: ScoringSettings): number {
  const avg =
    (s.recentFormWeight +
      s.tournamentFormWeight +
      s.marketHitRateWeight +
      s.motivationWeight +
      s.lineupConfidenceWeight) /
    5;
  return avg / 0.5; // 1.0 at the neutral default
}

const RISK_POINTS: Record<Recommendation["riskLevel"], number> = {
  low: 12,
  medium: 6,
  high: 0,
};
const CONFIDENCE_POINTS: Record<Recommendation["dataConfidence"], number> = {
  high: 13,
  medium: 9.75,
  low: 6.5,
};

/**
 * Recompute a recommendation's value score (and derived label) under the
 * user's settings, without touching the underlying probability/edge/odds.
 */
export function applySettingsToRecommendation(
  rec: Recommendation,
  settings: ScoringSettings,
): ScoredRecommendation {
  const probWeight = probabilityWeight(settings);
  const oddsWeight = settings.oddsValueWeight / 0.5;
  const safetyWeight = settings.streakSafetyWeight / 0.5;
  const confidenceWeight = settings.dataConfidenceWeight / 0.5;

  const probabilityComponent = rec.estimatedProbability * 55 * probWeight;
  const edgeComponent = clamp(rec.edge * 150, -20, 20) * oddsWeight;
  const varianceComponent = RISK_POINTS[rec.riskLevel] * safetyWeight;
  const confidenceComponent = CONFIDENCE_POINTS[rec.dataConfidence] * confidenceWeight;
  const oddsPenalty = rec.odds < 1.1 ? -8 : rec.odds < 1.2 ? -3 : 0;
  const boostBonus = rec.isBoosted ? Math.max(0, Math.min(settings.boostBonusCap, 5)) : 0;

  const valueScore = Math.round(
    clamp(
      probabilityComponent + edgeComponent + varianceComponent + confidenceComponent + oddsPenalty + boostBonus,
      0,
      100,
    ),
  );

  const recommendationLabel = recommendationLabelOf({
    estimatedProbability: rec.estimatedProbability,
    edge: rec.edge,
    dataConfidence: rec.dataConfidence,
    valueScore,
  });

  return { ...rec, valueScore, recommendationLabel };
}

/** App-wide candidate filter from the minimum-edge / minimum-probability thresholds. */
export function passesSettingsThresholds(rec: Recommendation, settings: ScoringSettings): boolean {
  return (
    rec.edge >= settings.minEdgeThreshold &&
    rec.estimatedProbability >= settings.minEstimatedProbabilityThreshold
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
