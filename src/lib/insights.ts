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
  // v0.8: raised to 3. Four extractors live (review_v1, prepare_v1,
  // trigger_v1, overwhelmed_v1). Cross-module confirmation is a stronger
  // signal than single-module repetition.
  minEventTypes: 3,
  minHighFitEntries: 2,
  emergingTagCount: 2,
} as const;

export const HIGH_FIT_RECORD_TYPES = ["review", "trigger_log", "repair", "outcome_tracking"] as const;

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
  observation_source: string; // "observed" | "predictive"
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
  // Only count observed behavior, not predictive (from Prepare).
  // Predictive observations are stored for future analysis but excluded
  // from user-facing insight thresholds.
  const observed = observations.filter(
    (o) => o.observation_source === "observed"
  );

  const { negative } = countByDirection(observed);
  const top = topFromMap(negative, INSIGHT_THRESHOLDS.emergingTagCount);
  if (!top) return null;

  const nextThreshold = Math.ceil((totalEntries + 1) / 6) * 6;

  return {
    tag: top.tag,
    summary: OBSERVATION_TAG_DESCRIPTIONS[top.tag].summary,
    count: top.count,
    freshnessLabel: `Based on your first ${totalEntries} entries. Next update at ${nextThreshold}.`,
  };
}

// ---------- Shared Helpers ----------

function countByDirection(
  observations: PatternObservation[],
  filterTag?: (tag: ObservationTag) => boolean
): { negative: Map<ObservationTag, number>; positive: Map<ObservationTag, number> } {
  const negative = new Map<ObservationTag, number>();
  const positive = new Map<ObservationTag, number>();
  for (const obs of observations) {
    const tag = obs.observation_tag as ObservationTag;
    const desc = OBSERVATION_TAG_DESCRIPTIONS[tag];
    if (!desc) continue;
    if (filterTag && !filterTag(tag)) continue;
    if (desc.direction === "negative") {
      negative.set(tag, (negative.get(tag) ?? 0) + 1);
    } else if (desc.direction === "positive") {
      positive.set(tag, (positive.get(tag) ?? 0) + 1);
    }
  }
  return { negative, positive };
}

function topFromMap(
  counts: Map<ObservationTag, number>,
  minCount = 1
): { tag: ObservationTag; count: number } | null {
  let best: ObservationTag | null = null;
  let bestCount = 0;
  for (const [tag, count] of counts) {
    if (count >= minCount && count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return best ? { tag: best, count: bestCount } : null;
}

// ---------- "How You Tend to Land" ----------
// Interpersonal-impact pattern — how the user comes across to others.
// Product doc §11.2: stricter thresholds than blind spot.
// High-fit for this family: Review and Outcome Tracking (§10.4).
// v0: no Outcome Tracking yet, so we only count Review entries.

export const TEND_TO_LAND_THRESHOLDS = {
  minEntries: 6,
  minDistinctDays: 3,
  minEventTypes: 3,
  minHighFitEntries: 3, // Review + Outcome (stricter than blind spot's 2)
  minReviewEntries: 2,  // 2+ Review or Outcome entries
  emergingTagCount: 2,
  establishedEntries: 18,
  establishedHighFit: 7,
  establishedReviewEntries: 3,
  establishedDistinctDays: 9,
} as const;

// High-fit for "how you tend to land" — only Review and Outcome (§10.4)
export const TEND_TO_LAND_HIGH_FIT = ["review", "outcome_tracking"] as const;

// Tags that indicate interpersonal impact (not trigger patterns)
const INTERPERSONAL_OBSERVATION_TYPES = new Set([
  "communication_move",
  "repair_behavior",
  "stress_response",
]);

export interface TendToLandResult {
  topPattern: ObservationTag;
  summary: string;
  counterPattern: { tag: ObservationTag; summary: string } | null;
  confidenceLevel: "emerging" | "established";
  freshnessLabel: string;
}

export function getHowYouTendToLand(
  observations: PatternObservation[],
  stats: {
    totalEntries: number;
    distinctDays: number;
    eventTypes: string[];
    highFitEntries: number; // count of Review + Outcome entries
    reviewEntries: number;
  }
): TendToLandResult | null {
  const { totalEntries, distinctDays, eventTypes, highFitEntries, reviewEntries } = stats;

  // Check thresholds
  if (totalEntries < TEND_TO_LAND_THRESHOLDS.minEntries) return null;
  if (distinctDays < TEND_TO_LAND_THRESHOLDS.minDistinctDays) return null;
  if (eventTypes.length < TEND_TO_LAND_THRESHOLDS.minEventTypes) return null;
  if (highFitEntries < TEND_TO_LAND_THRESHOLDS.minHighFitEntries) return null;
  if (reviewEntries < TEND_TO_LAND_THRESHOLDS.minReviewEntries) return null;

  // Filter to observed-only, interpersonal-impact tags
  const observed = observations.filter(
    (o) => o.observation_source === "observed"
  );

  const isInterpersonal = (tag: ObservationTag) =>
    INTERPERSONAL_OBSERVATION_TYPES.has(OBSERVATION_TYPE_FOR_TAG[tag]);

  const { negative, positive } = countByDirection(observed, isInterpersonal);

  const top = topFromMap(negative, TEND_TO_LAND_THRESHOLDS.emergingTagCount);
  if (!top) return null;

  // Require emergingTagCount for positive counter-patterns too —
  // a single positive observation is not a pattern worth showing.
  const counter = topFromMap(positive, TEND_TO_LAND_THRESHOLDS.emergingTagCount);

  // Confidence level
  const isEstablished =
    totalEntries >= TEND_TO_LAND_THRESHOLDS.establishedEntries &&
    distinctDays >= TEND_TO_LAND_THRESHOLDS.establishedDistinctDays &&
    highFitEntries >= TEND_TO_LAND_THRESHOLDS.establishedHighFit &&
    reviewEntries >= TEND_TO_LAND_THRESHOLDS.establishedReviewEntries;

  return {
    topPattern: top.tag,
    summary: OBSERVATION_TAG_DESCRIPTIONS[top.tag].summary,
    counterPattern: counter
      ? { tag: counter.tag, summary: OBSERVATION_TAG_DESCRIPTIONS[counter.tag].summary }
      : null,
    confidenceLevel: isEstablished ? "established" : "emerging",
    // v0: insights recompute on every page load (no batch job yet).
    // Label reflects current behavior; change to batch-interval text when derived_insights writes ship.
    freshnessLabel: `Based on ${totalEntries} entries across ${distinctDays} days.`,
  };
}

// ---------- Per-Person Patterns ----------
// Product doc §11.3: person-specific tension patterns.
// High-fit: Review, Repair, Outcome Tracking (§10.3).

export const PERSON_PATTERN_THRESHOLDS = {
  minEntries: 3,
  minDistinctDays: 2,
  minReviewEntries: 2,
  // Product doc §11.3 requires 1+ Repair or Outcome entry. Relaxed to 0
  // for v0 because Repair just shipped — gating person patterns behind a
  // brand-new module blocks the insight for every existing user. Raise to 1
  // once Repair has real adoption.
  minRepairEntries: 0,
  emergingTagCount: 2,
  establishedEntries: 9,
  establishedDistinctDays: 6,
  establishedReviewEntries: 6,
  establishedRepairEntries: 3,
} as const;

export interface PersonObservation extends PatternObservation {
  person_id: string | null;
}

export interface PersonPatternResult {
  personId: string;
  topNegative: { tag: ObservationTag; summary: string; count: number } | null;
  topPositive: { tag: ObservationTag; summary: string; count: number } | null;
  confidenceLevel: "emerging" | "established";
  entryCount: number;
  freshnessLabel: string;
}

export function getPersonPatterns(
  observations: PersonObservation[],
  personStats: Map<
    string,
    {
      totalEntries: number;
      distinctDays: number;
      reviewEntries: number;
      repairEntries: number;
      displayName: string;
    }
  >
): PersonPatternResult[] {
  // Group observations by person
  const byPerson = new Map<string, PersonObservation[]>();
  for (const obs of observations) {
    if (!obs.person_id || obs.observation_source !== "observed") continue;
    const arr = byPerson.get(obs.person_id) ?? [];
    arr.push(obs);
    byPerson.set(obs.person_id, arr);
  }

  const results: PersonPatternResult[] = [];

  for (const [personId, personObs] of byPerson) {
    const stats = personStats.get(personId);
    if (!stats) continue;

    // Check thresholds
    if (stats.totalEntries < PERSON_PATTERN_THRESHOLDS.minEntries) continue;
    if (stats.distinctDays < PERSON_PATTERN_THRESHOLDS.minDistinctDays) continue;
    if (stats.reviewEntries < PERSON_PATTERN_THRESHOLDS.minReviewEntries) continue;
    if (stats.repairEntries < PERSON_PATTERN_THRESHOLDS.minRepairEntries) continue;

    const { negative, positive } = countByDirection(personObs);
    const topNeg = topFromMap(negative, PERSON_PATTERN_THRESHOLDS.emergingTagCount);
    // Require emergingTagCount for positive patterns too — n=1 is not a pattern.
    const topPos = topFromMap(positive, PERSON_PATTERN_THRESHOLDS.emergingTagCount);

    if (!topNeg && !topPos) continue;

    const isEstablished =
      stats.totalEntries >= PERSON_PATTERN_THRESHOLDS.establishedEntries &&
      stats.distinctDays >= PERSON_PATTERN_THRESHOLDS.establishedDistinctDays &&
      stats.reviewEntries >= PERSON_PATTERN_THRESHOLDS.establishedReviewEntries &&
      stats.repairEntries >= PERSON_PATTERN_THRESHOLDS.establishedRepairEntries;

    results.push({
      personId,
      topNegative: topNeg
        ? { tag: topNeg.tag, summary: OBSERVATION_TAG_DESCRIPTIONS[topNeg.tag].summary, count: topNeg.count }
        : null,
      topPositive: topPos
        ? { tag: topPos.tag, summary: OBSERVATION_TAG_DESCRIPTIONS[topPos.tag].summary, count: topPos.count }
        : null,
      confidenceLevel: isEstablished ? "established" : "emerging",
      entryCount: stats.totalEntries,
      // v0: recomputes on page load, no batch job. Honest label.
      freshnessLabel: `${stats.totalEntries} entries across ${stats.distinctDays} days.`,
    });
  }

  // Sort by entry count descending, limit to 5
  results.sort((a, b) => b.entryCount - a.entryCount);
  return results.slice(0, 5);
}

// ---------- Trigger Heuristic Extractor ----------
// Maps structured trigger entry fields to observation tags without an AI call.
// Returns null for ambiguous cases — "no weak/fake insight" rule.

const CRITICISM_KEYWORDS = [
  "criticized", "criticism", "judged", "blamed", "attacked", "called out",
  "put down", "mocked", "ridiculed", "belittled",
];

const PRESSURE_KEYWORDS = [
  "pressure", "deadline", "demanded", "rushed", "forced", "overwhelmed",
  "cornered", "ultimatum", "no choice", "had to",
];

export function inferTriggerPatternTag(input: {
  emotionIntensity: number;
  urgeIntensity: number;
  emotion: string;
  trigger: string;
}): ObservationTag | null {
  // High emotion + high urge = escalation pattern
  if (input.emotionIntensity >= 7 && input.urgeIntensity >= 7) {
    return "escalated_after_trigger";
  }

  // High emotion but controlled urge = withdrawal under tension
  if (input.emotionIntensity >= 7 && input.urgeIntensity <= 4) {
    return "withdrew_under_tension";
  }

  // Check for criticism/pressure keywords in the trigger text
  const triggerLower = input.trigger.toLowerCase();

  if (CRITICISM_KEYWORDS.some((k) => triggerLower.includes(k))) {
    return "recurring_trigger_criticism";
  }

  if (PRESSURE_KEYWORDS.some((k) => triggerLower.includes(k))) {
    return "recurring_trigger_pressure";
  }

  // Ambiguous: can't confidently assign a tag. Skip observation entirely.
  return null;
}

// ---------- Overwhelmed Heuristic Extractor ----------
// Maps structured overwhelmed entry fields to observation tags.
// Weaker signal than trigger_log (coarser 1-5 scale vs 1-10).
// Returns null for ambiguous cases — "silence over garbage."

export function inferOverwhelmedPatternTag(input: {
  beforeRating: number; // 1-5 overwhelm level before regulation
  afterRating: number; // 1-5 overwhelm level after regulation
  feelingLabel: string; // free text "I feel X because Y"
}): ObservationTag | null {
  // Only extract from meaningful overwhelm (3+ on 1-5 scale).
  // Low-overwhelm entries with keyword matches are noise, not pattern.
  if (input.beforeRating < 3) return null;

  // Check feeling text for trigger pattern keywords FIRST.
  // A user who writes "I was criticized" at intensity 5 should get
  // recurring_trigger_criticism, not escalated_after_trigger.
  const feelingLower = input.feelingLabel.toLowerCase();

  if (CRITICISM_KEYWORDS.some((k) => feelingLower.includes(k))) {
    return "recurring_trigger_criticism";
  }

  if (PRESSURE_KEYWORDS.some((k) => feelingLower.includes(k))) {
    return "recurring_trigger_pressure";
  }

  // High overwhelm that didn't improve = stuck in high arousal
  if (input.beforeRating >= 4 && input.afterRating >= input.beforeRating - 1) {
    return "escalated_after_trigger";
  }

  // Ambiguous or effective regulation: skip observation entirely.
  return null;
}
