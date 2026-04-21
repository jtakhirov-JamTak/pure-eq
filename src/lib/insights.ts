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
  // Optional person-scoped re-voicing of the pattern line. When present,
  // PersonPatternCard uses this verbatim; when absent, it falls back to
  // prepending "With {name}, " + lowercased pattern. Authored only for the
  // 4 tags that read most naturally in person-scoped form.
  patternPerson?: string;
}

export const OBSERVATION_TAG_COPY: Record<ObservationTag, TagCopy> = {
  defended_intent_early: {
    pattern:
      "You tend to defend your intent before the other person has finished.",
    showsUpWhen:
      "a concern feels like an accusation of your motives rather than a reaction to the outcome.",
    eqImpact:
      "Others can feel they weren't actually heard — you responded to what you thought they'd say next.",
    tryInstead:
      "Let them finish. Then name what you heard before explaining what you meant.",
    direction: "negative",
    patternPerson:
      "With {name}, you tend to defend your intent before they've finished what they were saying.",
  },
  assumed_meaning_without_checking: {
    pattern:
      "You tend to fill in what someone means instead of checking with them.",
    showsUpWhen:
      "signals are ambiguous and a quick read feels safer than asking.",
    eqImpact:
      "Others can feel you're reacting to a version of them that isn't quite them.",
    tryInstead:
      "Ask a one-sentence check: \"When you said X, did you mean Y?\"",
    direction: "negative",
    patternPerson:
      "With {name}, you tend to fill in what they mean instead of checking with them.",
  },
  delayed_direct_ask: {
    pattern:
      "You tend to wait too long before asking directly for what you need.",
    showsUpWhen:
      "you're hoping the other person will notice what you need without being told.",
    eqImpact:
      "Others can feel blindsided when the ask finally lands, or miss it entirely.",
    tryInstead:
      "Name the ask within the first minute: \"What I need here is __.\"",
    direction: "negative",
  },
  withdrew_under_tension: {
    pattern: "You tend to pull back when a conversation heats up.",
    showsUpWhen:
      "a disagreement escalates faster than you can formulate a response.",
    eqImpact:
      "Others can read your silence as stonewalling, disapproval, or emotional shutdown.",
    tryInstead:
      "Name the pause out loud: \"I want to respond well — give me a minute.\"",
    direction: "negative",
    patternPerson:
      "With {name}, you tend to pull back when the conversation heats up instead of staying in it.",
  },
  over_explained_when_misunderstood: {
    pattern: "You tend to over-explain when you feel misunderstood.",
    showsUpWhen:
      "you sense the other person isn't tracking and your first instinct is to add more words.",
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
      "the path forward feels obvious to you and sitting with the problem feels unproductive.",
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
      "emotions are rising and the other person needs their experience acknowledged before anything else.",
    eqImpact:
      "Others can feel seen and less alone with what they're carrying.",
    tryInstead:
      "Keep doing it — and narrow the validation to the specific emotion you're hearing, not a generic \"that makes sense.\"",
    direction: "positive",
  },
  repair_attempt_helped: {
    pattern: "Your repair attempts tend to land and get received.",
    showsUpWhen:
      "you name what went wrong and take responsibility within the same move.",
    eqImpact:
      "Others can let the moment go instead of carrying it forward.",
    tryInstead:
      "Keep naming the specific thing you're owning — vague repairs land less cleanly than precise ones.",
    direction: "positive",
  },
  repair_attempt_missed_ownership: {
    pattern: "Your repair attempts tend to skip taking ownership.",
    showsUpWhen:
      "you explain the context or intent but don't name what you'd do differently.",
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
      "a strong reaction hits faster than your ability to choose how to respond.",
    eqImpact:
      "Others can feel the volume jump and stop tracking the point underneath it.",
    tryInstead:
      "Name the trigger out loud: \"I'm activated — give me a minute before I respond.\"",
    direction: "negative",
    patternPerson:
      "With {name}, you tend to escalate once you're activated instead of pausing to reset first.",
  },
  recurring_trigger_criticism: {
    pattern:
      "Criticism is a recurring trigger that activates a strong reaction for you.",
    showsUpWhen:
      "feedback lands as a judgment of who you are rather than what you did.",
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
      "stakes or timelines tighten and you feel cornered or rushed.",
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
      "the moment arrives and the prepared plan feels wrong or too stiff for the real conversation.",
    eqImpact:
      "You lose the benefit of your own preparation — the conversation drifts back to default patterns.",
    tryInstead:
      "Read your one-liner opening verbatim. Once the first sentence is out, the rest comes easier.",
    direction: "negative",
  },
  jumped_to_conclusion_under_ambiguity: {
    pattern:
      "You tend to conclude what the other person meant before you've actually checked it.",
    showsUpWhen:
      "a signal is ambiguous and a quick interpretation feels faster than asking.",
    eqImpact:
      "Others can feel you're reacting to a story you already wrote, not the thing they said.",
    tryInstead:
      "Check the interpretation first: \"I heard X — was that what you meant?\"",
    direction: "negative",
  },
  pushed_for_resolution_when_activated: {
    pattern:
      "You tend to push for the conversation to end when you're already activated.",
    showsUpWhen:
      "pressure is rising and staying with the uncertainty feels harder than forcing a decision.",
    eqImpact:
      "Others can feel cornered into an answer they didn't fully mean — the decision doesn't hold after.",
    tryInstead:
      "Name that you're activated and ask to return to it: \"I'm too activated to land this well — can we come back in 20?\"",
    direction: "negative",
  },
  late_regulation_in_the_moment: {
    pattern:
      "You tend to understand the state you were in only after the moment is over.",
    showsUpWhen:
      "the emotion rises faster than you can interrupt it — the pause only lands in the replay.",
    eqImpact:
      "Others experience the unregulated version of you; the repair shows up later but the impact already landed.",
    tryInstead:
      "Catch the body state first: tight chest, clenched jaw, quick breath. Name it out loud before you respond.",
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
  jumped_to_conclusion_under_ambiguity: "communication_move",
  pushed_for_resolution_when_activated: "stress_response",
  late_regulation_in_the_moment: "stress_response",
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
// Maps structured trigger entry fields to a set of observation tags without an
// AI call. Multiple rules can fire on the same input — one entry can produce
// several tags. Idempotency is enforced by the DB unique index on
// (user_id, source_raw_record_id, observation_tag), so emitting the same tag
// twice is a no-op at the DB layer.

const CRITICISM_KEYWORDS = [
  "criticized", "criticism", "judged", "blamed", "attacked", "called out",
  "put down", "mocked", "ridiculed", "belittled",
];

// Intentional omissions:
// - "overwhelmed" — the Overwhelmed tool's central word; users describing
//   their internal state will say it on most entries, false-positiving every
//   submission as a pressure trigger and polluting top-pattern aggregation.
// - "had to" — too generic ("I had to take a walk", "She said I had to").
//   Re-add only if a more scoped phrase pattern (e.g. "had to <verb>") is
//   implemented.
const PRESSURE_KEYWORDS = [
  "pressure", "deadline", "demanded", "rushed", "forced",
  "cornered", "ultimatum", "no choice",
];

export function inferTriggerPatternTag(input: {
  emotionIntensity: number;
  urgeIntensity: number;
  emotion: string;
  trigger: string;
  // Absent / null / empty string is a clean signal for
  // late_regulation_in_the_moment at emotion >= 6. A short non-empty strategy
  // ("calm down") is not — length-based inference would false-positive.
  regulationStrategy?: string | null;
}): ObservationTag[] {
  const tags: ObservationTag[] = [];
  const triggerLower = input.trigger.toLowerCase();
  const hasPressureKeyword = PRESSURE_KEYWORDS.some((k) => triggerLower.includes(k));
  const hasCriticismKeyword = CRITICISM_KEYWORDS.some((k) => triggerLower.includes(k));

  // High emotion + high urge = escalation pattern
  if (input.emotionIntensity >= 7 && input.urgeIntensity >= 7) {
    tags.push("escalated_after_trigger");
  }

  // High emotion but controlled urge = withdrawal under tension
  if (input.emotionIntensity >= 7 && input.urgeIntensity <= 4) {
    tags.push("withdrew_under_tension");
  }

  // Pressure keyword + high urge = pushed for resolution while activated
  if (hasPressureKeyword && input.urgeIntensity >= 6) {
    tags.push("pushed_for_resolution_when_activated");
  }

  // emotion >= 6 AND regulation strategy is truly absent (not short).
  const rs = input.regulationStrategy;
  const strategyAbsent =
    rs === undefined || rs === null || (typeof rs === "string" && rs.trim() === "");
  if (input.emotionIntensity >= 6 && strategyAbsent) {
    tags.push("late_regulation_in_the_moment");
  }

  if (hasCriticismKeyword) tags.push("recurring_trigger_criticism");
  if (hasPressureKeyword) tags.push("recurring_trigger_pressure");

  return tags;
}

// ---------- Overwhelmed Heuristic Extractor ----------
// Multi-tag variant. Coarser 1-5 scale vs 1-10 on trigger_log, so the only
// rules that qualify are keyword-driven plus the escalation case.
// Intentionally does NOT include late_regulation_in_the_moment — a slow
// recovery on the 1-5 scale would false-positive as "late regulation" even
// when the user regulated successfully, just slowly.

export function inferOverwhelmedPatternTag(input: {
  beforeRating: number; // 1-5 overwhelm level before regulation
  afterRating: number; // 1-5 overwhelm level after regulation
  feelingLabel: string; // free text "I feel X because Y"
}): ObservationTag[] {
  // Only extract from meaningful overwhelm (3+ on 1-5 scale).
  // Low-overwhelm entries with keyword matches are noise, not pattern.
  if (input.beforeRating < 3) return [];

  const tags: ObservationTag[] = [];
  const feelingLower = input.feelingLabel.toLowerCase();

  if (CRITICISM_KEYWORDS.some((k) => feelingLower.includes(k))) {
    tags.push("recurring_trigger_criticism");
  }
  if (PRESSURE_KEYWORDS.some((k) => feelingLower.includes(k))) {
    tags.push("recurring_trigger_pressure");
  }

  // High overwhelm that didn't improve = stuck in high arousal.
  // Fires alongside keyword tags — "criticized by boss + stuck high" should
  // surface both so either pattern can qualify for the top-pattern aggregation.
  if (input.beforeRating >= 4 && input.afterRating >= input.beforeRating - 1) {
    tags.push("escalated_after_trigger");
  }

  return tags;
}

// ---------- Reflection > Regulation Comparator ----------
// Written to derived_insights as insight_type = "reflection_regulation_gap".
// Surfaces users whose Review entries show they understand interactions well
// on the replay, but whose trigger_log / overwhelmed entries show they don't
// regulate well in the moment. The value add is naming the gap, not scoring it.
// Render gated behind user_feature_flags.show_comparator until the 0.35
// threshold has been validated against real data.

export const COMPARATOR_COPY: TagCopy = {
  pattern: "You understand better on the replay than in the live moment.",
  showsUpWhen: "Emotions rise faster than you interrupt them.",
  eqImpact: "You often see the pattern after the impact is already done.",
  tryInstead: "Catch the body state earlier and pause there first.",
  direction: "negative",
};

// Tag sets that drive the comparator math. Kept as constants so tests and
// callers can introspect without importing the whole compute function.
const REFLECTION_POSITIVE_TAGS: ObservationTag[] = [
  "validation_present",
  "repair_attempt_helped",
];
const REFLECTION_NEGATIVE_TAGS: ObservationTag[] = [
  "repair_attempt_missed_ownership",
];
const REGULATION_NEGATIVE_TAGS: ObservationTag[] = [
  "escalated_after_trigger",
  "late_regulation_in_the_moment",
];
const REACTIVE_RECORD_TYPES = new Set(["trigger_log", "overwhelmed"]);

export interface ComparatorSnapshot {
  reflectionScore: number;
  regulationScore: number;
  gap: number;
  reviewCount: number;
  reactiveCount: number;
  distinctDays: number;
  qualifies: boolean;
  // null when prior window lacked enough entries to compute a gap. When
  // non-null, both prior and current are numeric gap values and verdict
  // derives from their delta.
  evolution: {
    priorGap: number | null;
    currentGap: number;
    verdict: PatternVerdict;
  } | null;
  // Which supporting tags contributed to the score this period. Stable order
  // (positive reflection, negative reflection, negative regulation) so repeat
  // writes produce the same supporting_pattern_ids array.
  contributingTags: ObservationTag[];
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

interface GapMath {
  reflectionScore: number;
  regulationScore: number;
  gap: number;
  reviewCount: number;
  reactiveCount: number;
  contributingTags: ObservationTag[];
}

function computeGapForWindow(
  observations: PatternObservation[],
  rawRecords: Array<{ record_type: string; created_at: string | null }>,
): GapMath {
  const reviewCount = rawRecords.filter((r) => r.record_type === "review").length;
  const reactiveCount = rawRecords.filter((r) =>
    REACTIVE_RECORD_TYPES.has(r.record_type),
  ).length;

  let reflectionPositive = 0;
  let reflectionNegative = 0;
  let regulationNegative = 0;
  const contributing = new Set<ObservationTag>();

  for (const o of observations) {
    if (o.observation_source !== "observed") continue;
    const tag = o.observation_tag as ObservationTag;
    if (
      o.record_type === "review" &&
      REFLECTION_POSITIVE_TAGS.includes(tag)
    ) {
      reflectionPositive++;
      contributing.add(tag);
    } else if (
      o.record_type === "review" &&
      REFLECTION_NEGATIVE_TAGS.includes(tag)
    ) {
      reflectionNegative++;
      contributing.add(tag);
    } else if (
      o.record_type &&
      REACTIVE_RECORD_TYPES.has(o.record_type) &&
      REGULATION_NEGATIVE_TAGS.includes(tag)
    ) {
      regulationNegative++;
      contributing.add(tag);
    }
  }

  // max(1, denom) guards division and clamps [-1,1] handles the edge where
  // every review fires both positive AND negative observations (sum > count).
  const reflectionScore = clamp(
    (reflectionPositive - reflectionNegative) / Math.max(1, reviewCount),
    -1,
    1,
  );
  const regulationScore = 1 - regulationNegative / Math.max(1, reactiveCount);
  const gap = reflectionScore - regulationScore;

  const contributingTags: ObservationTag[] = [
    ...REFLECTION_POSITIVE_TAGS.filter((t) => contributing.has(t)),
    ...REFLECTION_NEGATIVE_TAGS.filter((t) => contributing.has(t)),
    ...REGULATION_NEGATIVE_TAGS.filter((t) => contributing.has(t)),
  ];

  return {
    reflectionScore,
    regulationScore,
    gap,
    reviewCount,
    reactiveCount,
    contributingTags,
  };
}

function verdictFromGapDelta(prior: number | null, current: number): PatternVerdict {
  if (prior === null) return "new";
  const delta = current - prior;
  if (Math.abs(delta) < 0.15) return "steady";
  // Gap widening (current > prior) is bad for a negative-direction metric.
  return delta > 0 ? "increasing" : "decreasing";
}

export function computeReflectionRegulationGap(
  observations: PatternObservation[],
  rawRecords: Array<{ record_type: string; created_at: string | null }>,
  now: Date,
): ComparatorSnapshot {
  const nowMs = now.getTime();
  const currentCutoff = nowMs - FOURTEEN_DAYS_MS;
  const priorCutoff = nowMs - 2 * FOURTEEN_DAYS_MS;

  // All-time computation.
  const allTime = computeGapForWindow(observations, rawRecords);

  // distinctDays across qualifying entries (review + reactive only).
  const qualifyingRecords = rawRecords.filter(
    (r) => r.record_type === "review" || REACTIVE_RECORD_TYPES.has(r.record_type),
  );
  const distinctDays = new Set(
    qualifyingRecords
      .filter((r) => r.created_at)
      .map((r) => r.created_at!.slice(0, 10)),
  ).size;

  const qualifies =
    allTime.reviewCount >= 3 &&
    allTime.reactiveCount >= 3 &&
    allTime.gap >= 0.35 &&
    distinctDays >= 4;

  // Evolution: compute gap for the current 14d window + prior 14d window.
  // A window's gap is only meaningful when it has at least 1 review + 1
  // reactive entry — otherwise the score reverts to the max(1,denom) guard
  // and renders a misleading gap. Return null for such windows.
  const windowFilter = (lo: number, hi: number) => {
    const obsFiltered = observations.filter((o) => {
      const ts = new Date(o.observed_at).getTime();
      return ts >= lo && ts < hi;
    });
    const recFiltered = rawRecords.filter((r) => {
      if (!r.created_at) return false;
      const ts = new Date(r.created_at).getTime();
      return ts >= lo && ts < hi;
    });
    return { obsFiltered, recFiltered };
  };

  const currentSlice = windowFilter(currentCutoff, nowMs + 1);
  const priorSlice = windowFilter(priorCutoff, currentCutoff);

  const currentMath = computeGapForWindow(
    currentSlice.obsFiltered,
    currentSlice.recFiltered,
  );
  const priorMath = computeGapForWindow(
    priorSlice.obsFiltered,
    priorSlice.recFiltered,
  );

  const currentValid =
    currentMath.reviewCount >= 1 && currentMath.reactiveCount >= 1;
  const priorValid = priorMath.reviewCount >= 1 && priorMath.reactiveCount >= 1;

  const evolution = currentValid
    ? {
        priorGap: priorValid ? priorMath.gap : null,
        currentGap: currentMath.gap,
        verdict: verdictFromGapDelta(
          priorValid ? priorMath.gap : null,
          currentMath.gap,
        ),
      }
    : null;

  return {
    reflectionScore: allTime.reflectionScore,
    regulationScore: allTime.regulationScore,
    gap: allTime.gap,
    reviewCount: allTime.reviewCount,
    reactiveCount: allTime.reactiveCount,
    distinctDays,
    qualifies,
    evolution,
    contributingTags: allTime.contributingTags,
  };
}

export function isComparatorSnapshot(value: unknown): value is ComparatorSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.reflectionScore !== "number") return false;
  if (typeof v.regulationScore !== "number") return false;
  if (typeof v.gap !== "number") return false;
  if (typeof v.reviewCount !== "number") return false;
  if (typeof v.reactiveCount !== "number") return false;
  if (typeof v.distinctDays !== "number") return false;
  if (typeof v.qualifies !== "boolean") return false;
  if (!Array.isArray(v.contributingTags)) return false;
  if (v.evolution !== null) {
    if (!v.evolution || typeof v.evolution !== "object") return false;
    const ev = v.evolution as Record<string, unknown>;
    if (typeof ev.currentGap !== "number") return false;
    if (ev.priorGap !== null && typeof ev.priorGap !== "number") return false;
    if (typeof ev.verdict !== "string") return false;
  }
  return true;
}

// Gating for comparator render. Extracted so the 4-state matrix
// (flag × qualifies) can be unit-tested at the compute layer without
// page-render infra.
export function gateComparatorRender(params: {
  showComparator: boolean;
  qualifies: boolean;
}): boolean {
  return params.showComparator === true && params.qualifies === true;
}

// ---------- 3-Box Insights Redesign ----------

// Thresholds for the "established" comparator tier. Mirrors the rule the
// writer applies when it stamps confidence_level='established' on the
// derived_insights row (see insights-writer.ts). Kept here so reader-side
// code can derive the same verdict from a ComparatorSnapshot without a DB
// round-trip on cache miss / live recompute.
export const COMPARATOR_ESTABLISHED = {
  minReviewCount: 5,
  minReactiveCount: 5,
  minGap: 0.45,
} as const;

export function isComparatorEstablished(snapshot: ComparatorSnapshot): boolean {
  return (
    snapshot.reviewCount >= COMPARATOR_ESTABLISHED.minReviewCount &&
    snapshot.reactiveCount >= COMPARATOR_ESTABLISHED.minReactiveCount &&
    snapshot.gap >= COMPARATOR_ESTABLISHED.minGap
  );
}

// Box 2 comparator framing line renders only when the flag is on AND the
// snapshot clears the established tier (strictly above qualifies). Weak
// 0.35–0.45 gap users see nothing; the row still gets written for analytics.
export function shouldRenderComparatorLine(params: {
  showComparator: boolean;
  snapshot: ComparatorSnapshot | null;
}): boolean {
  if (!params.showComparator) return false;
  if (!params.snapshot) return false;
  if (!params.snapshot.qualifies) return false;
  return isComparatorEstablished(params.snapshot);
}

export const COMPARATOR_FRAMING_LINE =
  "You often see this more clearly afterward than you catch it in the moment.";

export const SHIFT_STATUS_COPY: Record<PatternVerdict, string> = {
  new: "Starting to show up recently.",
  increasing: "Happening more often lately.",
  steady: "Active and steady.",
  decreasing: "Easing up in recent weeks.",
  gone: "Quiet in recent weeks.",
  dormant: "No recent activity.",
};

// Box 3 picks a single person. Rank: established confidence first, then
// strong-emerging fallback. Null when no person clears the bar — Box 3 is
// omitted entirely in that case (no section header, no empty state).
//
// Strong-emerging requires:
//   entryCount >= 5, distinctDays >= 3, topNegative.count >= 3.
// The underlying getPersonPatterns already enforces reviewEntries >= 2, so
// any candidate here has cleared that floor.
export interface PersonPickCandidate {
  personId: string;
  displayName: string;
  topNegative: { tag: ObservationTag; summary: string; count: number } | null;
  topPositive: { tag: ObservationTag; summary: string; count: number } | null;
  confidenceLevel: "emerging" | "established";
  distinctEntries: number;
  distinctDays: number;
}

export const PERSON_PICK_STRONG_EMERGING = {
  minEntries: 5,
  minDistinctDays: 3,
  minNegativeCount: 3,
} as const;

export function pickTopPerson<T extends PersonPickCandidate>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null;

  // Require a negative pattern on both tiers. Positive-only is demoted to the
  // `Also` line per spec. Without this filter an established-confidence row
  // with only a positive pattern (possible when the writer found ≥2 positive
  // observations but no qualifying negative) would render Box 3 positive-only.
  const established = candidates
    .filter(
      (c) => c.confidenceLevel === "established" && c.topNegative !== null,
    )
    .sort((a, b) => b.distinctEntries - a.distinctEntries);
  if (established.length > 0) return established[0];

  const strongEmerging = candidates
    .filter(
      (c) =>
        c.distinctEntries >= PERSON_PICK_STRONG_EMERGING.minEntries &&
        c.distinctDays >= PERSON_PICK_STRONG_EMERGING.minDistinctDays &&
        c.topNegative !== null &&
        c.topNegative.count >= PERSON_PICK_STRONG_EMERGING.minNegativeCount,
    )
    .sort((a, b) => b.distinctEntries - a.distinctEntries);
  if (strongEmerging.length > 0) return strongEmerging[0];

  return null;
}
