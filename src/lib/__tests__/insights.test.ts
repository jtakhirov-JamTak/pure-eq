import { describe, it, expect } from "vitest";
import {
  checkInsightThresholds,
  getTopPattern,
  getPatternEvolution,
  computePatternSnapshot,
  computeReflectionRegulationGap,
  gateComparatorRender,
  getPersonPatterns,
  inferTriggerPatternTag,
  inferOverwhelmedPatternTag,
  isComparatorSnapshot,
  isComparatorEstablished,
  shouldRenderComparatorLine,
  pickTopPerson,
  type ComparatorSnapshot,
  type PatternObservation,
  type PatternSnapshot,
  type PersonPickCandidate,
} from "@/lib/insights";

// Small helper: build a PatternObservation with sensible defaults so each
// test only declares what it cares about.
function obs(
  partial: Partial<PatternObservation> & Pick<PatternObservation, "observation_tag" | "observed_at">,
): PatternObservation {
  return {
    observation_source: "observed",
    source_raw_record_id: `r-${partial.observation_tag}-${partial.observed_at}`,
    record_type: "review",
    ...partial,
  };
}

describe("checkInsightThresholds", () => {
  it("returns correct state for all four threshold conditions", () => {
    // no_entries
    const noEntries = checkInsightThresholds({
      totalEntries: 0,
      distinctDays: 0,
      eventTypes: [],
      highFitEntries: 0,
    });
    expect(noEntries.state).toBe("no_entries");

    // below_threshold (under 6 entries)
    const belowThreshold = checkInsightThresholds({
      totalEntries: 3,
      distinctDays: 2,
      eventTypes: ["review"],
      highFitEntries: 1,
    });
    expect(belowThreshold.state).toBe("below_threshold");
    expect(belowThreshold.message).toContain("3");

    // needs_more_days (6+ entries but < 3 distinct days)
    const needsDays = checkInsightThresholds({
      totalEntries: 8,
      distinctDays: 2,
      eventTypes: ["review"],
      highFitEntries: 3,
    });
    expect(needsDays.state).toBe("needs_more_days");

    // threshold_met (needs 3+ event types)
    const met = checkInsightThresholds({
      totalEntries: 8,
      distinctDays: 4,
      eventTypes: ["review", "trigger_log", "overwhelmed"],
      highFitEntries: 3,
    });
    expect(met.state).toBe("threshold_met");
  });

  it("mixed event types (3+ modules) meet minEventTypes: 3", () => {
    // Integration test: realistic multi-module user
    const result = checkInsightThresholds({
      totalEntries: 7,
      distinctDays: 4,
      eventTypes: ["review", "trigger_log", "overwhelmed"],
      highFitEntries: 3,
    });
    expect(result.state).toBe("threshold_met");

    // Two event types should NOT meet threshold (need 3)
    const twoTypes = checkInsightThresholds({
      totalEntries: 10,
      distinctDays: 5,
      eventTypes: ["review", "trigger_log"],
      highFitEntries: 10,
    });
    expect(twoTypes.state).toBe("below_threshold");
    expect(twoTypes.message).toContain("different modules");

    // Single event type should NOT meet threshold
    const singleType = checkInsightThresholds({
      totalEntries: 10,
      distinctDays: 5,
      eventTypes: ["review"],
      highFitEntries: 10,
    });
    expect(singleType.state).toBe("below_threshold");
    expect(singleType.message).toContain("different modules");
  });
});

describe("getTopPattern", () => {
  it("returns null when no tag reaches 2 distinct source_raw_record_id values", () => {
    const observations = [
      // 1 distinct raw_record for this tag — below threshold
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r1" }),
      // another tag with 1 distinct raw_record
      obs({ observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-11T00:00:00Z", source_raw_record_id: "r2" }),
    ];
    expect(getTopPattern(observations)).toBeNull();
  });

  it("counts distinct source_raw_record_id, not raw observations", () => {
    // 3 observations of same tag but all from 1 raw_record → should count as 1
    // and NOT qualify (below emergingTagCount of 2).
    const observations = [
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "same-record" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:01Z", source_raw_record_id: "same-record" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:02Z", source_raw_record_id: "same-record" }),
    ];
    expect(getTopPattern(observations)).toBeNull();

    // Add a second distinct raw_record → now qualifies
    const observations2 = [
      ...observations,
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-11T00:00:00Z", source_raw_record_id: "another-record" }),
    ];
    const result = getTopPattern(observations2);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("withdrew_under_tension");
    expect(result!.distinctEntries).toBe(2);
    expect(result!.totalObservations).toBe(4);
  });

  it("ignores observations with observation_source === 'predictive'", () => {
    const observations = [
      // 3 predictive → ignored
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r1", observation_source: "predictive" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-11T00:00:00Z", source_raw_record_id: "r2", observation_source: "predictive" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-12T00:00:00Z", source_raw_record_id: "r3", observation_source: "predictive" }),
      // 1 observed — below threshold
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-13T00:00:00Z", source_raw_record_id: "r4" }),
    ];
    expect(getTopPattern(observations)).toBeNull();
  });

  it("ignores tags where direction is not 'negative'", () => {
    const observations = [
      // 5 positive observations → filtered out
      obs({ observation_tag: "validation_present", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r1" }),
      obs({ observation_tag: "validation_present", observed_at: "2026-04-11T00:00:00Z", source_raw_record_id: "r2" }),
      obs({ observation_tag: "validation_present", observed_at: "2026-04-12T00:00:00Z", source_raw_record_id: "r3" }),
      // 2 neutral → filtered out
      obs({ observation_tag: "recurring_trigger_criticism", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r4" }),
      obs({ observation_tag: "recurring_trigger_criticism", observed_at: "2026-04-11T00:00:00Z", source_raw_record_id: "r5" }),
    ];
    expect(getTopPattern(observations)).toBeNull();
  });
});

describe("getPatternEvolution", () => {
  // now = 2026-04-20T12:00:00Z
  //   current window: [2026-04-06T12, 2026-04-20T12]
  //   prior window:   [2026-03-23T12, 2026-04-06T12)
  const now = new Date("2026-04-20T12:00:00Z");

  it("returns 'new' when prior=0 and current>0", () => {
    const observations = [
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-15T00:00:00Z", source_raw_record_id: "r1" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-18T00:00:00Z", source_raw_record_id: "r2" }),
    ];
    const ev = getPatternEvolution(observations, "withdrew_under_tension", now);
    expect(ev.verdict).toBe("new");
    expect(ev.currentWindow.count).toBe(2);
    expect(ev.priorWindow.count).toBe(0);
  });

  it("returns 'gone' when current=0 and prior>0", () => {
    const observations = [
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-03-25T00:00:00Z", source_raw_record_id: "r1" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-03-30T00:00:00Z", source_raw_record_id: "r2" }),
    ];
    const ev = getPatternEvolution(observations, "withdrew_under_tension", now);
    expect(ev.verdict).toBe("gone");
    expect(ev.currentWindow.count).toBe(0);
    expect(ev.priorWindow.count).toBe(2);
  });

  it("returns 'steady' when |delta| <= 1", () => {
    // current 3, prior 2 → delta 1 → steady
    const observations = [
      // prior: 2 observations
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-03-25T00:00:00Z", source_raw_record_id: "r1" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-03-28T00:00:00Z", source_raw_record_id: "r2" }),
      // current: 3 observations
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r3" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-14T00:00:00Z", source_raw_record_id: "r4" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-18T00:00:00Z", source_raw_record_id: "r5" }),
    ];
    const ev = getPatternEvolution(observations, "withdrew_under_tension", now);
    expect(ev.verdict).toBe("steady");
  });

  it("returns 'dormant' when prior=0 and current=0 (tag qualified all-time but absent from both windows)", () => {
    // Observation from outside the 28-day window — still counted by
    // getTopPattern for all-time qualification, but evolution windows see 0.
    const observations = [
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-01-01T00:00:00Z", source_raw_record_id: "r-ancient" }),
    ];
    const ev = getPatternEvolution(observations, "withdrew_under_tension", now);
    expect(ev.verdict).toBe("dormant");
    expect(ev.currentWindow.count).toBe(0);
    expect(ev.priorWindow.count).toBe(0);
  });

  it("returns 'increasing' when current - prior >= 2", () => {
    const observations = [
      // prior: 1
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-03-30T00:00:00Z", source_raw_record_id: "r1" }),
      // current: 4
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r2" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-12T00:00:00Z", source_raw_record_id: "r3" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-15T00:00:00Z", source_raw_record_id: "r4" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-18T00:00:00Z", source_raw_record_id: "r5" }),
    ];
    const ev = getPatternEvolution(observations, "withdrew_under_tension", now);
    expect(ev.verdict).toBe("increasing");
    expect(ev.currentWindow.count).toBe(4);
    expect(ev.priorWindow.count).toBe(1);
  });
});

describe("computePatternSnapshot", () => {
  it("returns null when getTopPattern returns null", () => {
    const observations = [
      // Only 1 distinct raw_record for this tag — below threshold
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r1" }),
    ];
    expect(computePatternSnapshot(observations, new Date("2026-04-20T12:00:00Z"))).toBeNull();
  });

  it("round-trips through JSON.stringify/parse with matching key structure", () => {
    // Cache contract: what computePatternSnapshot returns is what lands in
    // metadata_json and what the page reads back. A deep-equal check after
    // round-trip guards against shape drift (e.g. Date objects or Sets that
    // would serialize lossily).
    const observations = [
      // prior
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-03-25T00:00:00Z", source_raw_record_id: "r1", record_type: "review" }),
      // current: 3 entries → qualifies (distinct >= 2)
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", source_raw_record_id: "r2", record_type: "review" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-14T00:00:00Z", source_raw_record_id: "r3", record_type: "trigger_log" }),
      obs({ observation_tag: "withdrew_under_tension", observed_at: "2026-04-18T00:00:00Z", source_raw_record_id: "r4", record_type: "review" }),
      // positive counter
      obs({ observation_tag: "validation_present", observed_at: "2026-04-12T00:00:00Z", source_raw_record_id: "r5", record_type: "review" }),
      obs({ observation_tag: "validation_present", observed_at: "2026-04-16T00:00:00Z", source_raw_record_id: "r6", record_type: "review" }),
    ];
    const snapshot = computePatternSnapshot(observations, new Date("2026-04-20T12:00:00Z"));
    expect(snapshot).not.toBeNull();

    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as PatternSnapshot;
    expect(roundTripped).toEqual(snapshot);
    // Spot-check the specific load-bearing fields.
    expect(roundTripped.tag).toBe("withdrew_under_tension");
    expect(roundTripped.copy.direction).toBe("negative");
    expect(roundTripped.distinctEntries).toBeGreaterThanOrEqual(2);
    expect(roundTripped.evolution.currentWindow.count).toBeGreaterThan(0);
    expect(Array.isArray(roundTripped.evolution.counterObservations)).toBe(true);
    expect(Array.isArray(roundTripped.eventTypesContributing)).toBe(true);
  });
});

describe("getPersonPatterns", () => {
  function personObs(p: {
    tag: string;
    date: string;
    person_id: string;
    source?: string;
  }) {
    return {
      observation_tag: p.tag,
      observed_at: p.date,
      observation_source: p.source ?? "observed",
      source_raw_record_id: `r-${p.tag}-${p.date}`,
      record_type: "review" as string | null,
      person_id: p.person_id,
    };
  }

  it("returns empty array when no person meets thresholds", () => {
    const result = getPersonPatterns([], new Map());
    expect(result).toEqual([]);
  });

  it("returns pattern for person meeting thresholds (positive needs 2+ count)", () => {
    const personId = "person-1";
    const observations = [
      personObs({ tag: "assumed_meaning_without_checking", date: "2026-04-10", person_id: personId }),
      personObs({ tag: "assumed_meaning_without_checking", date: "2026-04-11", person_id: personId }),
      // 2x positive — meets emergingTagCount
      personObs({ tag: "validation_present", date: "2026-04-12", person_id: personId }),
      personObs({ tag: "validation_present", date: "2026-04-13", person_id: personId }),
    ];

    const personStats = new Map([
      [personId, {
        totalEntries: 5,
        distinctDays: 3,
        reviewEntries: 3,
        repairEntries: 0,
        displayName: "Sarah",
      }],
    ]);

    const result = getPersonPatterns(observations, personStats);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe(personId);
    expect(result[0].topNegative!.tag).toBe("assumed_meaning_without_checking");
    expect(result[0].topPositive!.tag).toBe("validation_present");
    expect(result[0].confidenceLevel).toBe("emerging");
  });

  it("excludes predictive observations", () => {
    const personId = "person-1";
    const observations = [
      personObs({ tag: "withdrew_under_tension", date: "2026-04-10", person_id: personId, source: "predictive" }),
      personObs({ tag: "withdrew_under_tension", date: "2026-04-11", person_id: personId, source: "predictive" }),
      personObs({ tag: "withdrew_under_tension", date: "2026-04-12", person_id: personId, source: "predictive" }),
    ];

    const personStats = new Map([
      [personId, {
        totalEntries: 5,
        distinctDays: 3,
        reviewEntries: 3,
        repairEntries: 1,
        displayName: "Sarah",
      }],
    ]);

    const result = getPersonPatterns(observations, personStats);
    expect(result).toHaveLength(0);
  });

  it("skips person without enough review entries", () => {
    const personId = "person-1";
    const observations = [
      personObs({ tag: "withdrew_under_tension", date: "2026-04-10", person_id: personId }),
      personObs({ tag: "withdrew_under_tension", date: "2026-04-11", person_id: personId }),
    ];

    const personStats = new Map([
      [personId, {
        totalEntries: 5,
        distinctDays: 3,
        reviewEntries: 1, // Below minReviewEntries (2)
        repairEntries: 0,
        displayName: "Sarah",
      }],
    ]);

    const result = getPersonPatterns(observations, personStats);
    expect(result).toHaveLength(0);
  });

  it("does not show positive counter-pattern from n=1 evidence", () => {
    const personId = "person-1";
    const observations = [
      personObs({ tag: "assumed_meaning_without_checking", date: "2026-04-10", person_id: personId }),
      personObs({ tag: "assumed_meaning_without_checking", date: "2026-04-11", person_id: personId }),
      // Only 1 positive — below emergingTagCount, should NOT show
      personObs({ tag: "validation_present", date: "2026-04-12", person_id: personId }),
    ];

    const personStats = new Map([
      [personId, {
        totalEntries: 5,
        distinctDays: 3,
        reviewEntries: 3,
        repairEntries: 0,
        displayName: "Sarah",
      }],
    ]);

    const result = getPersonPatterns(observations, personStats);
    expect(result).toHaveLength(1);
    expect(result[0].topNegative!.tag).toBe("assumed_meaning_without_checking");
    expect(result[0].topPositive).toBeNull(); // n=1 positive not shown
  });
});

describe("inferTriggerPatternTag", () => {
  it("high emotion + high urge → includes escalated_after_trigger", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 8,
        urgeIntensity: 9,
        emotion: "angry",
        trigger: "they interrupted me",
        regulationStrategy: "took a breath",
      })
    ).toContain("escalated_after_trigger");
  });

  it("high emotion + low urge → includes withdrew_under_tension", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 8,
        urgeIntensity: 3,
        emotion: "hurt",
        trigger: "they dismissed what I said",
        regulationStrategy: "stepped away",
      })
    ).toContain("withdrew_under_tension");
  });

  it("criticism keyword in trigger → includes recurring_trigger_criticism", () => {
    const tags = inferTriggerPatternTag({
      emotionIntensity: 5,
      urgeIntensity: 5,
      emotion: "frustrated",
      trigger: "I was criticized in front of everyone",
      regulationStrategy: "breathed deep",
    });
    expect(tags).toContain("recurring_trigger_criticism");
  });

  it("ambiguous input returns empty array", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 5,
        urgeIntensity: 5,
        emotion: "confused",
        trigger: "something happened at work",
        regulationStrategy: "thought it through",
      })
    ).toEqual([]);
  });

  it("multiple rules firing → array contains all matching tags", () => {
    // high emotion + high urge (escalated) + pressure keyword + urge >= 6
    // (pushed_for_resolution) + pressure keyword also adds recurring_trigger_pressure
    const tags = inferTriggerPatternTag({
      emotionIntensity: 8,
      urgeIntensity: 8,
      emotion: "anxious",
      trigger: "a hard deadline was forced on me",
      regulationStrategy: "asked for an extension",
    });
    expect(tags).toContain("escalated_after_trigger");
    expect(tags).toContain("pushed_for_resolution_when_activated");
    expect(tags).toContain("recurring_trigger_pressure");
  });

  it("emotion >= 6 + non-empty regulation strategy → NOT late_regulation_in_the_moment", () => {
    const tags = inferTriggerPatternTag({
      emotionIntensity: 7,
      urgeIntensity: 5,
      emotion: "frustrated",
      trigger: "a difficult moment at work",
      regulationStrategy: "calm down",
    });
    expect(tags).not.toContain("late_regulation_in_the_moment");
  });

  it("emotion >= 6 + null regulation strategy → includes late_regulation_in_the_moment", () => {
    const tags = inferTriggerPatternTag({
      emotionIntensity: 6,
      urgeIntensity: 5,
      emotion: "overwhelmed",
      trigger: "a difficult moment at work",
      regulationStrategy: null,
    });
    expect(tags).toContain("late_regulation_in_the_moment");
  });

  it("emotion >= 6 + empty string regulation strategy → includes late_regulation_in_the_moment", () => {
    const tags = inferTriggerPatternTag({
      emotionIntensity: 8,
      urgeIntensity: 5,
      emotion: "overwhelmed",
      trigger: "a difficult moment at work",
      regulationStrategy: "   ",
    });
    expect(tags).toContain("late_regulation_in_the_moment");
  });

  it("emotion < 6 + null regulation strategy → does NOT include late_regulation_in_the_moment", () => {
    const tags = inferTriggerPatternTag({
      emotionIntensity: 5,
      urgeIntensity: 5,
      emotion: "mild frustration",
      trigger: "a thing happened",
      regulationStrategy: null,
    });
    expect(tags).not.toContain("late_regulation_in_the_moment");
  });
});

describe("inferOverwhelmedPatternTag", () => {
  it("high overwhelm + no improvement → includes escalated_after_trigger", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 5,
        afterRating: 5,
        feelingLabel: "I feel terrible because everything is falling apart",
      })
    ).toContain("escalated_after_trigger");
  });

  it("high overwhelm + slight improvement still includes escalated_after_trigger", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 4,
        afterRating: 3,
        feelingLabel: "I feel anxious because of the meeting",
      })
    ).toContain("escalated_after_trigger");
  });

  it("criticism keyword in feeling → includes recurring_trigger_criticism", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 5,
        afterRating: 5,
        feelingLabel: "I feel terrible because I was criticized by my boss",
      })
    ).toContain("recurring_trigger_criticism");
  });

  it("pressure keyword in feeling → includes recurring_trigger_pressure", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 3,
        afterRating: 1,
        feelingLabel: "I feel stressed because of the deadline",
      })
    ).toContain("recurring_trigger_pressure");
  });

  it("effective regulation with no keywords → empty array", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 4,
        afterRating: 1,
        feelingLabel: "I feel tense because of a difficult conversation",
      })
    ).toEqual([]);
  });

  it("low overwhelm (beforeRating < 3) always returns empty array", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 2,
        afterRating: 1,
        feelingLabel: "I feel a bit criticized today",
      })
    ).toEqual([]);
  });

  it("never returns late_regulation_in_the_moment under any input (rule removed from overwhelmed)", () => {
    // The trigger-log route has the late-regulation rule; overwhelmed does
    // not because a slow recovery on the coarser 1-5 scale would false-
    // positive as "late regulation" even when the user regulated successfully.
    const inputs = [
      { beforeRating: 5, afterRating: 5, feelingLabel: "I feel stuck" },
      { beforeRating: 4, afterRating: 4, feelingLabel: "I feel stuck because of pressure" },
      { beforeRating: 5, afterRating: 2, feelingLabel: "I feel criticized" },
      { beforeRating: 3, afterRating: 1, feelingLabel: "I feel anxious" },
    ];
    for (const input of inputs) {
      expect(inferOverwhelmedPatternTag(input)).not.toContain(
        "late_regulation_in_the_moment",
      );
    }
  });
});

// ---------- computeReflectionRegulationGap ----------

describe("computeReflectionRegulationGap", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  // Helper to build a raw_record row in the shape the compute expects.
  function rec(record_type: string, created_at: string) {
    return { record_type, created_at };
  }

  it("returns not qualified when reviewCount < 3", () => {
    const rawRecords = [
      rec("review", "2026-04-10T00:00:00Z"),
      rec("review", "2026-04-12T00:00:00Z"),
      rec("trigger_log", "2026-04-10T00:00:00Z"),
      rec("trigger_log", "2026-04-12T00:00:00Z"),
      rec("trigger_log", "2026-04-14T00:00:00Z"),
      rec("trigger_log", "2026-04-16T00:00:00Z"),
    ];
    const snap = computeReflectionRegulationGap([], rawRecords, now);
    expect(snap.qualifies).toBe(false);
    expect(snap.reviewCount).toBe(2);
  });

  it("returns not qualified when reactiveCount < 3", () => {
    const rawRecords = [
      rec("review", "2026-04-10T00:00:00Z"),
      rec("review", "2026-04-12T00:00:00Z"),
      rec("review", "2026-04-14T00:00:00Z"),
      rec("review", "2026-04-15T00:00:00Z"),
      rec("trigger_log", "2026-04-10T00:00:00Z"),
      rec("trigger_log", "2026-04-12T00:00:00Z"),
    ];
    const snap = computeReflectionRegulationGap([], rawRecords, now);
    expect(snap.qualifies).toBe(false);
    expect(snap.reactiveCount).toBe(2);
  });

  it("returns not qualified when gap < 0.35 even with enough entries", () => {
    // 3 reviews with no positive tags + 3 reactives with no regulation negatives
    //  → reflectionScore = 0, regulationScore = 1, gap = -1 (much less than 0.35)
    const rawRecords = [
      rec("review", "2026-04-10T00:00:00Z"),
      rec("review", "2026-04-12T00:00:00Z"),
      rec("review", "2026-04-14T00:00:00Z"),
      rec("trigger_log", "2026-04-11T00:00:00Z"),
      rec("trigger_log", "2026-04-13T00:00:00Z"),
      rec("trigger_log", "2026-04-15T00:00:00Z"),
    ];
    const snap = computeReflectionRegulationGap([], rawRecords, now);
    expect(snap.gap).toBeLessThan(0.35);
    expect(snap.qualifies).toBe(false);
  });

  it("qualifies on realistic qualifying input: high reflection + high regulation negatives", () => {
    // 4 reviews, 4 reactives. 3 reviews fire validation_present (pos);
    // 3 reactives fire escalated_after_trigger (neg regulation).
    // distinctDays = 4+ (entries across 4 different days).
    const rawRecords = [
      rec("review", "2026-04-08T00:00:00Z"),
      rec("review", "2026-04-10T00:00:00Z"),
      rec("review", "2026-04-12T00:00:00Z"),
      rec("review", "2026-04-14T00:00:00Z"),
      rec("trigger_log", "2026-04-09T00:00:00Z"),
      rec("trigger_log", "2026-04-11T00:00:00Z"),
      rec("trigger_log", "2026-04-13T00:00:00Z"),
      rec("trigger_log", "2026-04-15T00:00:00Z"),
    ];
    const observations: PatternObservation[] = [
      {
        observation_tag: "validation_present",
        observed_at: "2026-04-08T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-1",
        record_type: "review",
      },
      {
        observation_tag: "validation_present",
        observed_at: "2026-04-10T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-2",
        record_type: "review",
      },
      {
        observation_tag: "validation_present",
        observed_at: "2026-04-12T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-3",
        record_type: "review",
      },
      {
        observation_tag: "escalated_after_trigger",
        observed_at: "2026-04-09T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "t-1",
        record_type: "trigger_log",
      },
      {
        observation_tag: "escalated_after_trigger",
        observed_at: "2026-04-11T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "t-2",
        record_type: "trigger_log",
      },
      {
        observation_tag: "escalated_after_trigger",
        observed_at: "2026-04-13T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "t-3",
        record_type: "trigger_log",
      },
    ];
    const snap = computeReflectionRegulationGap(observations, rawRecords, now);
    expect(snap.qualifies).toBe(true);
    expect(snap.reflectionScore).toBeGreaterThan(0);
    expect(snap.regulationScore).toBeLessThan(0.5);
    expect(snap.gap).toBeGreaterThanOrEqual(0.35);
    expect(snap.distinctDays).toBeGreaterThanOrEqual(4);
    expect(snap.contributingTags).toContain("validation_present");
    expect(snap.contributingTags).toContain("escalated_after_trigger");
  });

  it("reviewCount === 0 → not qualified and no NaN from division", () => {
    const snap = computeReflectionRegulationGap(
      [],
      [rec("trigger_log", "2026-04-10T00:00:00Z")],
      now,
    );
    expect(snap.reviewCount).toBe(0);
    expect(snap.qualifies).toBe(false);
    expect(Number.isNaN(snap.reflectionScore)).toBe(false);
    expect(Number.isNaN(snap.regulationScore)).toBe(false);
    expect(Number.isNaN(snap.gap)).toBe(false);
  });

  it("reflectionScore clamps to [-1, 1] when positives + negatives both fire on every review", () => {
    // 2 reviews but 2 positive + 2 negative observations → raw numerator is 0
    // after subtraction; bump the positive side to exceed review count to hit
    // the upper clamp.
    const rawRecords = [
      rec("review", "2026-04-10T00:00:00Z"),
      rec("review", "2026-04-12T00:00:00Z"),
    ];
    const observations: PatternObservation[] = [
      // 4 positive observations on 2 reviews — pos - neg = 4, denom = 2 → 2.0 unclamped
      {
        observation_tag: "validation_present",
        observed_at: "2026-04-10T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-1",
        record_type: "review",
      },
      {
        observation_tag: "repair_attempt_helped",
        observed_at: "2026-04-10T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-1",
        record_type: "review",
      },
      {
        observation_tag: "validation_present",
        observed_at: "2026-04-12T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-2",
        record_type: "review",
      },
      {
        observation_tag: "repair_attempt_helped",
        observed_at: "2026-04-12T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: "rev-2",
        record_type: "review",
      },
    ];
    const snap = computeReflectionRegulationGap(observations, rawRecords, now);
    expect(snap.reflectionScore).toBeLessThanOrEqual(1);
    expect(snap.reflectionScore).toBeGreaterThanOrEqual(-1);
  });

  it("computed snapshot round-trips through JSON and passes isComparatorSnapshot", () => {
    const rawRecords = [
      rec("review", "2026-04-10T00:00:00Z"),
      rec("trigger_log", "2026-04-11T00:00:00Z"),
    ];
    const snap = computeReflectionRegulationGap([], rawRecords, now);
    const roundTripped = JSON.parse(JSON.stringify(snap));
    expect(isComparatorSnapshot(roundTripped)).toBe(true);
  });
});

// ---------- gateComparatorRender ----------

describe("gateComparatorRender (4-state matrix)", () => {
  it("(flag=false, qualifies=false) → false", () => {
    expect(gateComparatorRender({ showComparator: false, qualifies: false })).toBe(
      false,
    );
  });

  it("(flag=false, qualifies=true) → false", () => {
    expect(gateComparatorRender({ showComparator: false, qualifies: true })).toBe(
      false,
    );
  });

  it("(flag=true, qualifies=false) → false", () => {
    expect(gateComparatorRender({ showComparator: true, qualifies: false })).toBe(
      false,
    );
  });

  it("(flag=true, qualifies=true) → true", () => {
    expect(gateComparatorRender({ showComparator: true, qualifies: true })).toBe(
      true,
    );
  });
});

// ---------- Multi-tag distinct-count regression ----------
// Locks in the "one entry producing N tags counts as 1 distinct entry per
// tag, not N" semantics. Prompt 1's getTopPattern already counts via
// Set(source_raw_record_id); this test guards against a future refactor
// that accidentally reintroduces row-level counting.

describe("multi-tag distinct counting (getTopPattern regression)", () => {
  it("single trigger entry with 3 tags → no tag reaches the 2-distinct-entry threshold", () => {
    const sharedRawId = "shared-trigger-record";
    const observations: PatternObservation[] = [
      {
        observation_tag: "escalated_after_trigger",
        observed_at: "2026-04-15T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: sharedRawId,
        record_type: "trigger_log",
      },
      {
        observation_tag: "pushed_for_resolution_when_activated",
        observed_at: "2026-04-15T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: sharedRawId,
        record_type: "trigger_log",
      },
      {
        observation_tag: "late_regulation_in_the_moment",
        observed_at: "2026-04-15T00:00:00Z",
        observation_source: "observed",
        source_raw_record_id: sharedRawId,
        record_type: "trigger_log",
      },
    ];
    // emergingTagCount is 2. All 3 tags have distinctEntries = 1 (same raw
    // record). Top pattern returns null.
    expect(getTopPattern(observations)).toBeNull();
  });
});

// ---------- 3-Box Redesign Helpers ----------

function makeComparator(
  overrides: Partial<ComparatorSnapshot> = {},
): ComparatorSnapshot {
  return {
    reflectionScore: 0.6,
    regulationScore: 0.1,
    gap: 0.5,
    reviewCount: 6,
    reactiveCount: 6,
    distinctDays: 5,
    qualifies: true,
    evolution: null,
    contributingTags: [],
    ...overrides,
  };
}

describe("isComparatorEstablished", () => {
  it("requires review >= 5, reactive >= 5, gap >= 0.45", () => {
    expect(isComparatorEstablished(makeComparator())).toBe(true);

    // Each threshold tested by dropping just below the bar
    expect(
      isComparatorEstablished(makeComparator({ reviewCount: 4 })),
    ).toBe(false);
    expect(
      isComparatorEstablished(makeComparator({ reactiveCount: 4 })),
    ).toBe(false);
    expect(isComparatorEstablished(makeComparator({ gap: 0.44 }))).toBe(false);

    // Exactly at the bar qualifies
    expect(
      isComparatorEstablished(
        makeComparator({ reviewCount: 5, reactiveCount: 5, gap: 0.45 }),
      ),
    ).toBe(true);
  });
});

describe("shouldRenderComparatorLine", () => {
  it("returns false when flag is off", () => {
    expect(
      shouldRenderComparatorLine({
        showComparator: false,
        snapshot: makeComparator(),
      }),
    ).toBe(false);
  });

  it("returns false when snapshot is null", () => {
    expect(
      shouldRenderComparatorLine({
        showComparator: true,
        snapshot: null,
      }),
    ).toBe(false);
  });

  it("returns false when snapshot does not qualify", () => {
    expect(
      shouldRenderComparatorLine({
        showComparator: true,
        snapshot: makeComparator({ qualifies: false }),
      }),
    ).toBe(false);
  });

  it("returns false on emerging (qualifies but below established)", () => {
    // gap 0.4 qualifies (>= 0.35) but is below established (0.45)
    expect(
      shouldRenderComparatorLine({
        showComparator: true,
        snapshot: makeComparator({ gap: 0.4 }),
      }),
    ).toBe(false);
  });

  it("returns true only when flag on AND established", () => {
    expect(
      shouldRenderComparatorLine({
        showComparator: true,
        snapshot: makeComparator(),
      }),
    ).toBe(true);
  });
});

function makePerson(
  overrides: Partial<PersonPickCandidate>,
): PersonPickCandidate {
  return {
    personId: "p-" + Math.random().toString(36).slice(2, 8),
    displayName: "Someone",
    topNegative: null,
    topPositive: null,
    confidenceLevel: "emerging",
    distinctEntries: 0,
    distinctDays: 0,
    ...overrides,
  };
}

describe("pickTopPerson", () => {
  it("returns null on empty input", () => {
    expect(pickTopPerson([])).toBeNull();
  });

  it("prefers an established person even when emerging persons have more entries", () => {
    const established = makePerson({
      personId: "a",
      displayName: "Alice",
      confidenceLevel: "established",
      distinctEntries: 9,
      distinctDays: 6,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 5,
      },
    });
    const stronglyEmerging = makePerson({
      personId: "b",
      displayName: "Bob",
      confidenceLevel: "emerging",
      distinctEntries: 50,
      distinctDays: 10,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 40,
      },
    });
    const picked = pickTopPerson([stronglyEmerging, established]);
    expect(picked?.personId).toBe("a");
  });

  it("falls back to strong-emerging when no one is established", () => {
    const weak = makePerson({
      personId: "w",
      distinctEntries: 3,
      distinctDays: 2,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 2,
      },
    });
    const strong = makePerson({
      personId: "s",
      distinctEntries: 6,
      distinctDays: 4,
      topNegative: {
        tag: "withdrew_under_tension",
        summary: "x",
        count: 4,
      },
    });
    const picked = pickTopPerson([weak, strong]);
    expect(picked?.personId).toBe("s");
  });

  it("returns null when no one clears the strong-emerging bar", () => {
    // Meets entries + days but negative count below minNegativeCount
    const belowNegCount = makePerson({
      distinctEntries: 6,
      distinctDays: 4,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 2,
      },
    });
    // Meets count + days but below minEntries
    const belowEntries = makePerson({
      distinctEntries: 4,
      distinctDays: 4,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 3,
      },
    });
    // Meets count + entries but below minDistinctDays
    const belowDays = makePerson({
      distinctEntries: 6,
      distinctDays: 2,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 3,
      },
    });
    expect(pickTopPerson([belowNegCount, belowEntries, belowDays])).toBeNull();
  });

  it("returns null for positive-only persons at the strong-emerging tier", () => {
    // Strong-emerging requires a negative pattern. Positive-only does not
    // qualify for Box 3 — spec says counter-patterns demote to `Also` line.
    const positiveOnly = makePerson({
      distinctEntries: 10,
      distinctDays: 5,
      topNegative: null,
      topPositive: {
        tag: "validation_present",
        summary: "x",
        count: 5,
      },
    });
    expect(pickTopPerson([positiveOnly])).toBeNull();
  });

  it("rejects established persons that have only a positive pattern", () => {
    // Regression: an established-confidence row with topNegative=null (writer
    // found ≥2 positive observations but no qualifying negative) would have
    // passed the established filter if it only keyed on confidenceLevel.
    // Positive-only must demote to the `Also` line, never lead Box 3.
    const establishedPositiveOnly = makePerson({
      confidenceLevel: "established",
      distinctEntries: 12,
      distinctDays: 7,
      topNegative: null,
      topPositive: {
        tag: "validation_present",
        summary: "x",
        count: 6,
      },
    });
    expect(pickTopPerson([establishedPositiveOnly])).toBeNull();
  });

  it("picks a strong-emerging negative person over an established positive-only person", () => {
    const establishedPositiveOnly = makePerson({
      personId: "pos",
      confidenceLevel: "established",
      distinctEntries: 20,
      distinctDays: 10,
      topNegative: null,
      topPositive: {
        tag: "validation_present",
        summary: "x",
        count: 10,
      },
    });
    const strongEmergingNegative = makePerson({
      personId: "neg",
      confidenceLevel: "emerging",
      distinctEntries: 5,
      distinctDays: 3,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 3,
      },
    });
    const picked = pickTopPerson([
      establishedPositiveOnly,
      strongEmergingNegative,
    ]);
    expect(picked?.personId).toBe("neg");
  });

  it("picks the established person with more entries when multiple are established", () => {
    const smaller = makePerson({
      personId: "small",
      confidenceLevel: "established",
      distinctEntries: 10,
      distinctDays: 6,
      topNegative: {
        tag: "defended_intent_early",
        summary: "x",
        count: 5,
      },
    });
    const bigger = makePerson({
      personId: "big",
      confidenceLevel: "established",
      distinctEntries: 20,
      distinctDays: 8,
      topNegative: {
        tag: "withdrew_under_tension",
        summary: "x",
        count: 8,
      },
    });
    expect(pickTopPerson([smaller, bigger])?.personId).toBe("big");
  });
});
