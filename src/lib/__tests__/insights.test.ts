import { describe, it, expect } from "vitest";
import {
  checkInsightThresholds,
  getTopPattern,
  getPatternEvolution,
  computePatternSnapshot,
  getPersonPatterns,
  inferTriggerPatternTag,
  inferOverwhelmedPatternTag,
  type PatternObservation,
  type PatternSnapshot,
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
  it("high emotion + high urge → escalated_after_trigger", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 8,
        urgeIntensity: 9,
        emotion: "angry",
        trigger: "they interrupted me",
      })
    ).toBe("escalated_after_trigger");
  });

  it("high emotion + low urge → withdrew_under_tension", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 8,
        urgeIntensity: 3,
        emotion: "hurt",
        trigger: "they dismissed what I said",
      })
    ).toBe("withdrew_under_tension");
  });

  it("criticism keyword in trigger → recurring_trigger_criticism", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 5,
        urgeIntensity: 5,
        emotion: "frustrated",
        trigger: "I was criticized in front of everyone",
      })
    ).toBe("recurring_trigger_criticism");
  });

  it("ambiguous input returns null", () => {
    expect(
      inferTriggerPatternTag({
        emotionIntensity: 5,
        urgeIntensity: 5,
        emotion: "confused",
        trigger: "something happened at work",
      })
    ).toBeNull();
  });
});

describe("inferOverwhelmedPatternTag", () => {
  it("high overwhelm + no improvement → escalated_after_trigger", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 5,
        afterRating: 5,
        feelingLabel: "I feel terrible because everything is falling apart",
      })
    ).toBe("escalated_after_trigger");
  });

  it("high overwhelm + slight improvement still escalation", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 4,
        afterRating: 3,
        feelingLabel: "I feel anxious because of the meeting",
      })
    ).toBe("escalated_after_trigger");
  });

  it("criticism keyword in feeling → recurring_trigger_criticism (keyword before intensity)", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 5,
        afterRating: 5,
        feelingLabel: "I feel terrible because I was criticized by my boss",
      })
    ).toBe("recurring_trigger_criticism");
  });

  it("pressure keyword in feeling → recurring_trigger_pressure", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 3,
        afterRating: 1,
        feelingLabel: "I feel stressed because of the deadline",
      })
    ).toBe("recurring_trigger_pressure");
  });

  it("effective regulation with no keywords → null", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 4,
        afterRating: 1,
        feelingLabel: "I feel tense because of a difficult conversation",
      })
    ).toBeNull();
  });

  it("low overwhelm (beforeRating < 3) always returns null", () => {
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 2,
        afterRating: 1,
        feelingLabel: "I feel a bit criticized today",
      })
    ).toBeNull();
  });
});
