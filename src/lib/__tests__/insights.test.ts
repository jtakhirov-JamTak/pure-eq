import { describe, it, expect } from "vitest";
import {
  checkInsightThresholds,
  getTopBlindSpot,
  getHowYouTendToLand,
  getPersonPatterns,
  inferTriggerPatternTag,
  inferOverwhelmedPatternTag,
} from "@/lib/insights";

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

describe("getTopBlindSpot", () => {
  it("returns null for empty observations", () => {
    expect(getTopBlindSpot([], 10)).toBeNull();
  });

  it("filters positive tags and returns top negative with correct freshness", () => {
    const observations = [
      // 3x negative tag (should win)
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", observation_source: "observed" },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-11T00:00:00Z", observation_source: "observed" },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-12T00:00:00Z", observation_source: "observed" },
      // 5x positive tag (should be filtered out)
      { observation_tag: "validation_present", observed_at: "2026-04-10T00:00:00Z", observation_source: "observed" },
      { observation_tag: "validation_present", observed_at: "2026-04-11T00:00:00Z", observation_source: "observed" },
      { observation_tag: "validation_present", observed_at: "2026-04-12T00:00:00Z", observation_source: "observed" },
      { observation_tag: "validation_present", observed_at: "2026-04-13T00:00:00Z", observation_source: "observed" },
      { observation_tag: "validation_present", observed_at: "2026-04-14T00:00:00Z", observation_source: "observed" },
      // 2x another negative tag (should lose to 3x)
      { observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-10T00:00:00Z", observation_source: "observed" },
      { observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-11T00:00:00Z", observation_source: "observed" },
    ];

    const result = getTopBlindSpot(observations, 10);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("withdrew_under_tension");
    expect(result!.count).toBe(3);
    // totalEntries=10 → nextThreshold = ceil(11/6)*6 = 12
    expect(result!.freshnessLabel).toContain("10");
    expect(result!.freshnessLabel).toContain("12");
  });

  it("returns null when only positive tags present", () => {
    const observations = [
      { observation_tag: "validation_present", observed_at: "2026-04-10T00:00:00Z", observation_source: "observed" },
      { observation_tag: "validation_present", observed_at: "2026-04-11T00:00:00Z", observation_source: "observed" },
      { observation_tag: "repair_attempt_helped", observed_at: "2026-04-12T00:00:00Z", observation_source: "observed" },
    ];
    expect(getTopBlindSpot(observations, 6)).toBeNull();
  });

  it("excludes predictive observations from blind spot count", () => {
    const observations = [
      // 3x negative but predictive — should NOT count
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-10T00:00:00Z", observation_source: "predictive" },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-11T00:00:00Z", observation_source: "predictive" },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-12T00:00:00Z", observation_source: "predictive" },
      // 1x negative observed — below emergingTagCount threshold (2)
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-13T00:00:00Z", observation_source: "observed" },
    ];
    // Only 1 observed → doesn't meet emergingTagCount of 2 → null
    expect(getTopBlindSpot(observations, 8)).toBeNull();
  });
});

describe("getHowYouTendToLand", () => {
  const baseStats = {
    totalEntries: 10,
    distinctDays: 4,
    eventTypes: ["review", "trigger_log", "prepare"],
    highFitEntries: 4, // Review count for this family
    reviewEntries: 3,
  };

  it("returns null when thresholds not met", () => {
    expect(getHowYouTendToLand([], { ...baseStats, totalEntries: 3 })).toBeNull();
    expect(getHowYouTendToLand([], { ...baseStats, reviewEntries: 1 })).toBeNull();
    expect(getHowYouTendToLand([], { ...baseStats, highFitEntries: 2 })).toBeNull();
    expect(getHowYouTendToLand([], { ...baseStats, eventTypes: ["review"] })).toBeNull();
  });

  it("returns top negative interpersonal pattern with counter-pattern (needs 2+ positive)", () => {
    const observations = [
      { observation_tag: "defended_intent_early", observed_at: "2026-04-10", observation_source: "observed" },
      { observation_tag: "defended_intent_early", observed_at: "2026-04-11", observation_source: "observed" },
      { observation_tag: "defended_intent_early", observed_at: "2026-04-12", observation_source: "observed" },
      // 2x positive — meets emergingTagCount threshold
      { observation_tag: "validation_present", observed_at: "2026-04-10", observation_source: "observed" },
      { observation_tag: "validation_present", observed_at: "2026-04-11", observation_source: "observed" },
    ];

    const result = getHowYouTendToLand(observations, baseStats);
    expect(result).not.toBeNull();
    expect(result!.topPattern).toBe("defended_intent_early");
    expect(result!.counterPattern).not.toBeNull();
    expect(result!.counterPattern!.tag).toBe("validation_present");
    expect(result!.confidenceLevel).toBe("emerging");
  });

  it("does not show positive counter-pattern from n=1 evidence", () => {
    const observations = [
      { observation_tag: "defended_intent_early", observed_at: "2026-04-10", observation_source: "observed" },
      { observation_tag: "defended_intent_early", observed_at: "2026-04-11", observation_source: "observed" },
      // Only 1 positive — below emergingTagCount, should NOT show
      { observation_tag: "validation_present", observed_at: "2026-04-10", observation_source: "observed" },
    ];

    const result = getHowYouTendToLand(observations, baseStats);
    expect(result).not.toBeNull();
    expect(result!.topPattern).toBe("defended_intent_early");
    expect(result!.counterPattern).toBeNull();
  });

  it("excludes trigger_pattern type tags", () => {
    // recurring_trigger_criticism is trigger_pattern type — excluded from "tend to land"
    const observations = [
      { observation_tag: "recurring_trigger_criticism", observed_at: "2026-04-10", observation_source: "observed" },
      { observation_tag: "recurring_trigger_criticism", observed_at: "2026-04-11", observation_source: "observed" },
      { observation_tag: "recurring_trigger_criticism", observed_at: "2026-04-12", observation_source: "observed" },
    ];

    const result = getHowYouTendToLand(observations, baseStats);
    expect(result).toBeNull();
  });

  it("returns established confidence at 18+ entries", () => {
    const observations = [
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-10", observation_source: "observed" },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-11", observation_source: "observed" },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-12", observation_source: "observed" },
    ];

    const result = getHowYouTendToLand(observations, {
      totalEntries: 20,
      distinctDays: 10,
      eventTypes: ["review", "trigger_log", "prepare"],
      highFitEntries: 8,
      reviewEntries: 4,
    });
    expect(result).not.toBeNull();
    expect(result!.confidenceLevel).toBe("established");
  });
});

describe("getPersonPatterns", () => {
  it("returns empty array when no person meets thresholds", () => {
    const result = getPersonPatterns([], new Map());
    expect(result).toEqual([]);
  });

  it("returns pattern for person meeting thresholds (positive needs 2+ count)", () => {
    const personId = "person-1";
    const observations = [
      { observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-10", observation_source: "observed", person_id: personId },
      { observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-11", observation_source: "observed", person_id: personId },
      // 2x positive — meets emergingTagCount
      { observation_tag: "validation_present", observed_at: "2026-04-12", observation_source: "observed", person_id: personId },
      { observation_tag: "validation_present", observed_at: "2026-04-13", observation_source: "observed", person_id: personId },
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
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-10", observation_source: "predictive", person_id: personId },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-11", observation_source: "predictive", person_id: personId },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-12", observation_source: "predictive", person_id: personId },
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
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-10", observation_source: "observed", person_id: personId },
      { observation_tag: "withdrew_under_tension", observed_at: "2026-04-11", observation_source: "observed", person_id: personId },
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
      { observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-10", observation_source: "observed", person_id: personId },
      { observation_tag: "assumed_meaning_without_checking", observed_at: "2026-04-11", observation_source: "observed", person_id: personId },
      // Only 1 positive — below emergingTagCount, should NOT show
      { observation_tag: "validation_present", observed_at: "2026-04-12", observation_source: "observed", person_id: personId },
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
    // Keywords take priority over intensity heuristic — a user who writes
    // "I was criticized" at high intensity should get the keyword tag.
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
    // Low overwhelm entries shouldn't generate pattern tags even with keywords
    expect(
      inferOverwhelmedPatternTag({
        beforeRating: 2,
        afterRating: 1,
        feelingLabel: "I feel a bit criticized today",
      })
    ).toBeNull();
  });
});
