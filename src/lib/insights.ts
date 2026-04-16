// Pure EQ domain — replace in fork.
import type { ObservationTag } from "@/types";

// ---------- Observation Tag Descriptions ----------
// Each tag maps to a behavioral sentence and direction.
// Language rules: mechanistic, "You tend to..." phrasing only.
// No therapy language, identity diagnosis, or "deep down" framing.

interface TagDescription {
  summary: string;
  direction: "positive" | "negative" | "neutral";
}

export const OBSERVATION_TAG_DESCRIPTIONS: Record<ObservationTag, TagDescription> = {
  defended_intent_early: {
    summary:
      "You tend to jump to defending your intent before the other person has finished expressing their concern.",
    direction: "negative",
  },
  assumed_meaning_without_checking: {
    summary:
      "You tend to interpret what someone means without checking with them first.",
    direction: "negative",
  },
  delayed_direct_ask: {
    summary:
      "You tend to wait too long before asking directly for what you need.",
    direction: "negative",
  },
  withdrew_under_tension: {
    summary:
      "You tend to pull back or go quiet when tension rises, rather than staying in the conversation.",
    direction: "negative",
  },
  over_explained_when_misunderstood: {
    summary:
      "When you feel misunderstood, you tend to over-explain rather than asking what the other person heard.",
    direction: "negative",
  },
  moved_to_solution_too_fast: {
    summary:
      "You tend to jump to fixing the problem before the other person feels heard.",
    direction: "negative",
  },
  validation_present: {
    summary:
      "You show a pattern of validating the other person's experience during hard moments.",
    direction: "positive",
  },
  repair_attempt_helped: {
    summary:
      "Your repair attempts tend to land well — the other person receives them.",
    direction: "positive",
  },
  repair_attempt_missed_ownership: {
    summary:
      "Your repair attempts tend to miss taking ownership of your part in what went wrong.",
    direction: "negative",
  },
  escalated_after_trigger: {
    summary:
      "You tend to escalate after being triggered, rather than pausing first.",
    direction: "negative",
  },
  recurring_trigger_criticism: {
    summary:
      "Criticism is a recurring trigger for you — it tends to activate a strong reaction.",
    direction: "neutral",
  },
  recurring_trigger_pressure: {
    summary:
      "Pressure is a recurring trigger for you — it tends to activate a strong reaction.",
    direction: "neutral",
  },
  prepare_plan_not_used: {
    summary:
      "You tend to prepare a plan but not follow through with it in the actual conversation.",
    direction: "negative",
  },
};

// ---------- Observation Type Mapping ----------
// Maps each tag to the observation_type value for the DB CHECK constraint.

type ObservationType =
  | "communication_move"
  | "stress_response"
  | "trigger_pattern"
  | "repair_behavior"
  | "outcome_linked_behavior";

export const OBSERVATION_TYPE_FOR_TAG: Record<ObservationTag, ObservationType> = {
  defended_intent_early: "communication_move",
  assumed_meaning_without_checking: "communication_move",
  delayed_direct_ask: "communication_move",
  withdrew_under_tension: "stress_response",
  over_explained_when_misunderstood: "communication_move",
  moved_to_solution_too_fast: "communication_move",
  validation_present: "communication_move",
  repair_attempt_helped: "repair_behavior",
  repair_attempt_missed_ownership: "repair_behavior",
  escalated_after_trigger: "stress_response",
  recurring_trigger_criticism: "trigger_pattern",
  recurring_trigger_pressure: "trigger_pattern",
  prepare_plan_not_used: "outcome_linked_behavior",
};

// ---------- Insight Thresholds ----------
// From product doc §11 — emerging blind spot requirements.

export const INSIGHT_THRESHOLDS = {
  minEntries: 6,
  minDistinctDays: 3,
  // v0.5: lowered from 3 to 1 because only Review produces observations.
  // Requiring 3 event types blocks the exact users with the most pattern data.
  // Revisit when Trigger/Prepare extractors ship.
  minEventTypes: 1,
  minHighFitEntries: 2,
  emergingTagCount: 2,
} as const;

export const HIGH_FIT_RECORD_TYPES = ["review", "trigger_log"] as const;

// ---------- Threshold Checking ----------

export interface EntryStats {
  totalEntries: number;
  distinctDays: number;
  eventTypes: string[];
  highFitEntries: number;
}

export type ThresholdState =
  | "no_entries"
  | "below_threshold"
  | "needs_more_days"
  | "threshold_met";

export interface ThresholdResult {
  state: ThresholdState;
  message: string;
  totalEntries: number;
}

export function checkInsightThresholds(stats: EntryStats): ThresholdResult {
  const { totalEntries, distinctDays, eventTypes, highFitEntries } = stats;

  if (totalEntries === 0) {
    return {
      state: "no_entries",
      message:
        "Insights are generated from your Coach and Tools entries over time. The more you use the app, the more patterns we can identify.",
      totalEntries,
    };
  }

  if (totalEntries < INSIGHT_THRESHOLDS.minEntries) {
    return {
      state: "below_threshold",
      message: `You have ${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}. Your first pattern analysis will generate at ${INSIGHT_THRESHOLDS.minEntries}.`,
      totalEntries,
    };
  }

  // Entry count met but distinct days not met — re-engagement nudge
  if (distinctDays < INSIGHT_THRESHOLDS.minDistinctDays) {
    return {
      state: "needs_more_days",
      message: `You have ${totalEntries} entries, but they're from fewer than ${INSIGHT_THRESHOLDS.minDistinctDays} different days. Using the app across more days helps us identify real patterns.`,
      totalEntries,
    };
  }

  // Check event types and high-fit entries
  if (
    eventTypes.length < INSIGHT_THRESHOLDS.minEventTypes ||
    highFitEntries < INSIGHT_THRESHOLDS.minHighFitEntries
  ) {
    return {
      state: "below_threshold",
      message: `You have ${totalEntries} entries. Try using different modules (Coach, Tools) to unlock pattern analysis.`,
      totalEntries,
    };
  }

  return {
    state: "threshold_met",
    message: "",
    totalEntries,
  };
}

// ---------- Blind Spot Aggregation ----------

export interface PatternObservation {
  observation_tag: string;
  observed_at: string;
}

export interface BlindSpotResult {
  tag: ObservationTag;
  summary: string;
  count: number;
  freshnessLabel: string;
}

export function getTopBlindSpot(
  observations: PatternObservation[],
  totalEntries: number
): BlindSpotResult | null {
  // Group by tag, only negative-direction tags
  const counts = new Map<ObservationTag, number>();
  for (const obs of observations) {
    const tag = obs.observation_tag as ObservationTag;
    const desc = OBSERVATION_TAG_DESCRIPTIONS[tag];
    if (!desc || desc.direction !== "negative") continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  // Find the tag with highest count, must meet minimum
  let topTag: ObservationTag | null = null;
  let topCount = 0;
  for (const [tag, count] of counts) {
    if (count >= INSIGHT_THRESHOLDS.emergingTagCount && count > topCount) {
      topTag = tag;
      topCount = count;
    }
  }

  if (!topTag) return null;

  // Freshness label: "Based on your first N entries. Next update at M."
  // Next threshold is next multiple of 6 above totalEntries.
  const nextThreshold = Math.ceil((totalEntries + 1) / 6) * 6;

  return {
    tag: topTag,
    summary: OBSERVATION_TAG_DESCRIPTIONS[topTag].summary,
    count: topCount,
    freshnessLabel: `Based on your first ${totalEntries} entries. Next update at ${nextThreshold}.`,
  };
}
