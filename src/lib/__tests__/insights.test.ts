import { describe, it, expect } from "vitest";
import {
  checkInsightThresholds,
  getTopBlindSpot,
  inferTriggerPatternTag,
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

    // threshold_met (needs 2+ event types now)
    const met = checkInsightThresholds({
      totalEntries: 8,
      distinctDays: 4,
      eventTypes: ["review", "trigger_log"],
      highFitEntries: 3,
    });
    expect(met.state).toBe("threshold_met");
  });

  it("mixed event types (review + trigger) meet minEventTypes: 2", () => {
    // Integration test: realistic multi-module user with 2 Reviews + 1 Trigger
    const result = checkInsightThresholds({
      totalEntries: 7,     // 2 reviews + 1 trigger + 4 other entries
      distinctDays: 4,
      eventTypes: ["review", "trigger_log", "prepare"],
      highFitEntries: 3,   // 2 reviews + 1 trigger = 3 high-fit
    });
    expect(result.state).toBe("threshold_met");

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
