// Pure EQ domain — replace in fork.
import type { ObservationTag } from "@/types";

// ---------- Observation Tag Copy ----------
// Each tag maps to a five-field copy block rendered by PatternCard.
// Language rules (product doc §2.2): mechanistic, behavior-based, simple.
// - pattern: "You tend to..." or direct descriptor. One sentence.
// - showsUpWhen: situational, not psychological. Describe the situation,
//   not the nervous system.
// - eqImpact: describes landing — what others feel. Not cause.
// - tryInstead: one concrete action.

export interface TagCopy {
  pattern: string;
  showsUpWhen: string;
  eqImpact: string;
  tryInstead: string;
  direction: "positive" | "negative" | "neutral";
}

export const OBSERVATION_TAG_COPY: Record<ObservationTag, TagCopy> = {
  defended_intent_early: {
    pattern:
      "You tend to defend your intent before the other person has finished.",
    showsUpWhen:
      "When a concern feels like an accusation of your motives rather than a reaction to the outcome.",
    eqImpact:
      "Others can feel they weren't actually heard — you responded to what you thought they'd say next.",
    tryInstead:
      "Let them finish. Then name what you heard before explaining what you meant.",
    direction: "negative",
  },
  assumed_meaning_without_checking: {
    pattern:
      "You tend to fill in what someone means instead of checking with them.",
    showsUpWhen:
      "When signals are ambiguous and a quick read feels safer than asking.",
    eqImpact:
      "Others can feel you're reacting to a version of them that isn't quite them.",
    tryInstead:
      "Ask a one-sentence check: \"When you said X, did you mean Y?\"",
    direction: "negative",
  },
  delayed_direct_ask: {
    pattern:
      "You tend to wait too long before asking directly for what you need.",
    showsUpWhen:
      "When you're hoping the other person will notice what you need without being told.",
    eqImpact:
      "Others can feel blindsided when the ask finally lands, or miss it entirely.",
    tryInstead:
      "Name the ask within the first minute: \"What I need here is __.\"",
    direction: "negative",
  },
  withdrew_under_tension: {
    pattern: "You tend to pull back when a conversation heats up.",
    showsUpWhen:
      "When a disagreement escalates faster than you can formulate a response.",
    eqImpact:
      "Others can read your silence as stonewalling, disapproval, or emotional shutdown.",
    tryInstead:
      "Name the pause out loud: \"I want to respond well — give me a minute.\"",
    direction: "negative",
  },
  over_explained_when_misunderstood: {
    pattern: "You tend to over-explain when you feel misunderstood.",
    showsUpWhen:
      "When you sense the other person isn't tracking and your first instinct is to add more words.",
    eqImpact:
      "Others can feel lectured or tune out — more words don't always land better.",
    tryInstead:
      "Ask what they heard before adding anything: \"What's landing for you so far?\"",
    direction: "negative",
  },
  moved_to_solution_too_fast: {
    pattern:
      "You tend to move to solutions before the other person feels heard.",
    showsUpWhen:
      "When the path forward feels obvious to you and sitting with the problem feels unproductive.",
    eqImpact:
      "Others can feel their experience got skipped — solved rather than understood.",
    tryInstead:
      "Reflect back what you heard first. Ask if fixing is what they want before offering it.",
    direction: "negative",
  },
  validation_present: {
    pattern:
      "You tend to validate what the other person is feeling during hard moments.",
    showsUpWhen:
      "When emotions are rising and the other person needs their experience acknowledged before anything else.",
    eqImpact:
      "Others can feel seen and less alone with what they're carrying.",
    tryInstead:
      "Keep doing it — and narrow the validation to the specific emotion you're hearing, not a generic \"that makes sense.\"",
    direction: "positive",
  },
  repair_attempt_helped: {
    pattern: "Your repair attempts tend to land and get received.",
    showsUpWhen:
      "When you name what went wrong and take responsibility within the same move.",
    eqImpact:
      "Others can let the moment go instead of carrying it forward.",
    tryInstead:
      "Keep naming the specific thing you're owning — vague repairs land less cleanly than precise ones.",
    direction: "positive",
  },
  repair_attempt_missed_ownership: {
    pattern: "Your repair attempts tend to skip taking ownership.",
    showsUpWhen:
      "When you explain the context or intent but don't name what you'd do differently.",
    eqImpact:
      "Others can feel the repair was performed rather than meant — the unowned piece stays unresolved.",
    tryInstead:
      "Say the sentence that's hardest: \"The part I got wrong was __.\"",
    direction: "negative",
  },
  escalated_after_trigger: {
    pattern:
      "You tend to escalate after being triggered instead of pausing first.",
    showsUpWhen:
      "When a strong reaction hits faster than your ability to choose how to respond.",
    eqImpact:
      "Others can feel the volume jump and stop tracking the point underneath it.",
    tryInstead:
      "Name the trigger out loud: \"I'm activated — give me a minute before I respond.\"",
    direction: "negative",
  },
  recurring_trigger_criticism: {
    pattern:
      "Criticism is a recurring trigger that activates a strong reaction for you.",
    showsUpWhen:
      "When feedback lands as a judgment of who you are rather than what you did.",
    eqImpact:
      "Others can feel they're walking a minefield when offering honest feedback.",
    tryInstead:
      "Delay responding until the reaction settles: \"Let me think about that and come back to you.\"",
    direction: "neutral",
  },
  recurring_trigger_pressure: {
    pattern:
      "Pressure is a recurring trigger that activates a strong reaction for you.",
    showsUpWhen:
      "When stakes or timelines tighten and you feel cornered or rushed.",
    eqImpact:
      "Others can feel their urgency is landing as an attack rather than a request.",
    tryInstead:
      "Name the pressure before responding to the ask: \"I'm feeling rushed — help me understand the real deadline.\"",
    direction: "neutral",
  },
  prepare_plan_not_used: {
    pattern:
      "You tend to prepare a plan but not follow through with it when the conversation starts.",
    showsUpWhen:
      "When the moment arrives and the prepared plan feels wrong or too stiff for the real conversation.",
    eqImpact:
      "You lose the benefit of your own preparation — the conversation drifts back to default patterns.",
    tryInstead:
      "Read your one-liner opening verbatim. Once the first sentence is out, the rest comes easier.",
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

// ---------- Pattern Observation Shape ----------
// Used by PatternCard computations and per-person patterns.
// source_raw_record_id is required on new consumers (enables distinct-entry
// counting). record_type is optional, enriched by caller from raw_records.

export interface PatternObservation {
  observation_tag: string;
  observed_at: string;
  observation_source: string; // "observed" | "predictive"
  source_raw_record_id: string;
  record_type?: string | null;
}

// ---------- Pattern Snapshot Shape ----------
// Single source of truth for a PatternCard *shape*. Written by insights-writer
// to derived_insights.metadata_json; read by the page on cache hit. The
// generator and page call the same computePatternSnapshot() function, so the
// shape is drift-proof. Values can differ by up to one cache TTL (1h) on
// cache hit — the windows were computed at writer time, not read time.
// Accepted tradeoff: spec requires cache-hit to skip live recompute.

export type PatternVerdict =
  | "new"
  | "increasing"
  | "steady"
  | "decreasing"
  | "gone"
  | "dormant"; // qualified all-time but zero observations in both windows

export interface PatternWindow {
  count: number;
  days: number;
  eventTypes: string[];
}

export interface PatternSnapshot {
  tag: ObservationTag;
  copy: TagCopy;
  distinctEntries: number;
  distinctDays: number;
  totalObservations: number;
  eventTypesContributing: string[];
  evolution: {
    currentWindow: PatternWindow;
    priorWindow: PatternWindow;
    counterObservations: Array<{ tag: ObservationTag; count: number; copy: TagCopy }>;
    verdict: PatternVerdict;
  };
}

// ---------- Shape Validation ----------
// Guard reads from derived_insights.metadata_json. A blind `as unknown as`
// cast crashes the server component on any legacy row or future shape drift.
// Keep this defensive — enough to reject malformed blobs, not a full schema.

export function isPatternSnapshot(value: unknown): value is PatternSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.tag !== "string") return false;
  if (typeof v.distinctEntries !== "number") return false;
  if (typeof v.distinctDays !== "number") return false;
  if (!Array.isArray(v.eventTypesContributing)) return false;
  if (!v.copy || typeof v.copy !== "object") return false;
  const copy = v.copy as Record<string, unknown>;
  if (typeof copy.pattern !== "string") return false;
  if (typeof copy.direction !== "string") return false;
  if (!v.evolution || typeof v.evolution !== "object") return false;
  const ev = v.evolution as Record<string, unknown>;
  if (typeof ev.verdict !== "string") return false;
  if (!ev.currentWindow || typeof ev.currentWindow !== "object") return false;
  if (!ev.priorWindow || typeof ev.priorWindow !== "object") return false;
  if (!Array.isArray(ev.counterObservations)) return false;
  return true;
}

// ---------- Observation Enrichment ----------
// Both the writer and the page take raw_record rows + observation rows and
// project them into PatternObservation/PersonObservation. Extracted here so
// drift between the two enrichment paths is impossible.

export function enrichObservations(
  rawObservations: Array<{
    observation_tag: string;
    observed_at: string;
    observation_source: string;
    person_id: string | null;
    source_raw_record_id: string;
  }>,
  rawRecords: Array<{ raw_record_id: string; record_type: string }>,
): {
  observations: PatternObservation[];
  personObservations: PersonObservation[];
} {
  const recordTypeById = new Map<string, string>();
  for (const r of rawRecords) {
    recordTypeById.set(r.raw_record_id, r.record_type);
  }
  const observations: PatternObservation[] = rawObservations.map((o) => ({
    observation_tag: o.observation_tag,
    observed_at: o.observed_at,
    observation_source: o.observation_source,
    source_raw_record_id: o.source_raw_record_id,
    record_type: recordTypeById.get(o.source_raw_record_id) ?? null,
  }));
  const personObservations: PersonObservation[] = rawObservations.map((o) => ({
    observation_tag: o.observation_tag,
    observed_at: o.observed_at,
    observation_source: o.observation_source,
    source_raw_record_id: o.source_raw_record_id,
    record_type: recordTypeById.get(o.source_raw_record_id) ?? null,
    person_id: o.person_id,
  }));
  return { observations, personObservations };
}

// ---------- Top Pattern Aggregation ----------

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface TopPatternResult {
  tag: ObservationTag;
  copy: TagCopy;
  distinctEntries: number;
  totalObservations: number;
  distinctDays: number;
  eventTypesContributing: string[];
}

export function getTopPattern(
  observations: PatternObservation[],
): TopPatternResult | null {
  // Filter to observed-only negative tags.
  const filtered = observations.filter((o) => {
    if (o.observation_source !== "observed") return false;
    const copy = OBSERVATION_TAG_COPY[o.observation_tag as ObservationTag];
    return copy?.direction === "negative";
  });

  // Group by tag.
  const byTag = new Map<ObservationTag, PatternObservation[]>();
  for (const obs of filtered) {
    const tag = obs.observation_tag as ObservationTag;
    const arr = byTag.get(tag) ?? [];
    arr.push(obs);
    byTag.set(tag, arr);
  }

  // For each tag, compute distinct source_raw_record_id count.
  let best: {
    tag: ObservationTag;
    distinctEntries: number;
    observations: PatternObservation[];
  } | null = null;

  for (const [tag, obs] of byTag) {
    const distinctIds = new Set(obs.map((o) => o.source_raw_record_id));
    const distinctCount = distinctIds.size;
    if (distinctCount < INSIGHT_THRESHOLDS.emergingTagCount) continue;
    if (!best || distinctCount > best.distinctEntries) {
      best = { tag, distinctEntries: distinctCount, observations: obs };
    }
  }

  if (!best) return null;

  const copy = OBSERVATION_TAG_COPY[best.tag];
  const distinctDays = new Set(
    best.observations.map((o) => o.observed_at.slice(0, 10)),
  ).size;
  const eventTypesContributing = [
    ...new Set(
      best.observations
        .map((o) => o.record_type)
        .filter((rt): rt is string => typeof rt === "string" && rt.length > 0),
    ),
  ];

  return {
    tag: best.tag,
    copy,
    distinctEntries: best.distinctEntries,
    totalObservations: best.observations.length,
    distinctDays,
    eventTypesContributing,
  };
}

// ---------- Pattern Evolution ----------
// Compares a tag's last-14d count to its 14-28d count and returns a verdict.

export function getPatternEvolution(
  observations: PatternObservation[],
  tag: ObservationTag,
  now: Date,
): {
  currentWindow: PatternWindow;
  priorWindow: PatternWindow;
  counterObservationsThisPeriod: Array<{ tag: ObservationTag; count: number }>;
  verdict: PatternVerdict;
} {
  const nowMs = now.getTime();
  const currentCutoff = nowMs - FOURTEEN_DAYS_MS;
  const priorCutoff = nowMs - 2 * FOURTEEN_DAYS_MS;

  const observed = observations.filter(
    (o) => o.observation_source === "observed",
  );

  const bucketize = (obs: PatternObservation[]): PatternWindow => {
    const count = obs.length;
    const days = new Set(obs.map((o) => o.observed_at.slice(0, 10))).size;
    const eventTypes = [
      ...new Set(
        obs
          .map((o) => o.record_type)
          .filter((rt): rt is string => typeof rt === "string" && rt.length > 0),
      ),
    ];
    return { count, days, eventTypes };
  };

  const inCurrent = (o: PatternObservation) => {
    const ts = new Date(o.observed_at).getTime();
    return ts >= currentCutoff && ts <= nowMs;
  };
  const inPrior = (o: PatternObservation) => {
    const ts = new Date(o.observed_at).getTime();
    return ts >= priorCutoff && ts < currentCutoff;
  };

  const forTag = observed.filter((o) => o.observation_tag === tag);
  const currentWindow = bucketize(forTag.filter(inCurrent));
  const priorWindow = bucketize(forTag.filter(inPrior));

  // Counter-observations: positive tags in the current window, top 2 by count.
  const counterCounts = new Map<ObservationTag, number>();
  for (const o of observed) {
    if (!inCurrent(o)) continue;
    const copy = OBSERVATION_TAG_COPY[o.observation_tag as ObservationTag];
    if (!copy || copy.direction !== "positive") continue;
    const t = o.observation_tag as ObservationTag;
    counterCounts.set(t, (counterCounts.get(t) ?? 0) + 1);
  }
  // Same "n=1 is not a pattern" rule applied in getPersonPatterns —
  // a single positive observation is noise, not a counter-pattern.
  const counterObservationsThisPeriod = [...counterCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t, count]) => ({ tag: t, count }));

  const verdict: PatternVerdict = computeVerdict(
    currentWindow.count,
    priorWindow.count,
  );

  return {
    currentWindow,
    priorWindow,
    counterObservationsThisPeriod,
    verdict,
  };
}

function computeVerdict(current: number, prior: number): PatternVerdict {
  // Tag qualified all-time (distinct >= 2) but zero in both 28-day windows:
  // rendering "steady" would mislead; "dormant" is honest.
  if (prior === 0 && current === 0) return "dormant";
  if (prior === 0 && current > 0) return "new";
  if (prior > 0 && current === 0) return "gone";
  if (current - prior >= 2) return "increasing";
  if (prior - current >= 2) return "decreasing";
  return "steady";
}

// ---------- Compute Pattern Snapshot ----------
// Single function that produces the PatternCard render payload. Called from
// both insights-writer (cache write) and the insights page (cache miss /
// stale fallthrough). Same shape in both paths — drift is impossible.

export function computePatternSnapshot(
  observations: PatternObservation[],
  now: Date,
): PatternSnapshot | null {
  const top = getTopPattern(observations);
  if (!top) return null;

  const evolution = getPatternEvolution(observations, top.tag, now);

  const counterObservations = evolution.counterObservationsThisPeriod
    .map((c) => {
      const copy = OBSERVATION_TAG_COPY[c.tag];
      if (!copy) return null;
      return { tag: c.tag, count: c.count, copy };
    })
    .filter((c): c is { tag: ObservationTag; count: number; copy: TagCopy } => c !== null);

  return {
    tag: top.tag,
    copy: top.copy,
    distinctEntries: top.distinctEntries,
    distinctDays: top.distinctDays,
    totalObservations: top.totalObservations,
    eventTypesContributing: top.eventTypesContributing,
    evolution: {
      currentWindow: evolution.currentWindow,
      priorWindow: evolution.priorWindow,
      counterObservations,
      verdict: evolution.verdict,
    },
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
  >,
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

    const negative = new Map<ObservationTag, number>();
    const positive = new Map<ObservationTag, number>();
    for (const obs of personObs) {
      const tag = obs.observation_tag as ObservationTag;
      const copy = OBSERVATION_TAG_COPY[tag];
      if (!copy) continue;
      if (copy.direction === "negative") {
        negative.set(tag, (negative.get(tag) ?? 0) + 1);
      } else if (copy.direction === "positive") {
        positive.set(tag, (positive.get(tag) ?? 0) + 1);
      }
    }

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
        ? { tag: topNeg.tag, summary: OBSERVATION_TAG_COPY[topNeg.tag].pattern, count: topNeg.count }
        : null,
      topPositive: topPos
        ? { tag: topPos.tag, summary: OBSERVATION_TAG_COPY[topPos.tag].pattern, count: topPos.count }
        : null,
      confidenceLevel: isEstablished ? "established" : "emerging",
      entryCount: stats.totalEntries,
      // v0: recomputes on page load, no batch job. Honest label.
      freshnessLabel: `${stats.totalEntries} ${stats.totalEntries === 1 ? "entry" : "entries"} across ${stats.distinctDays} ${stats.distinctDays === 1 ? "day" : "days"}.`,
    });
  }

  // Sort by entry count descending, limit to 5
  results.sort((a, b) => b.entryCount - a.entryCount);
  return results.slice(0, 5);
}

function topFromMap(
  counts: Map<ObservationTag, number>,
  minCount = 1,
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
