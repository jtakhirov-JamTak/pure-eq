import { describe, it, expect } from "vitest";
import {
  checkInsightThresholds,
  getTopBlindSpot,
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

    // threshold_met
    const met = checkInsightThresholds({
      totalEntries: 8,
      distinctDays: 4,
      eventTypes: ["review"],
      highFitEntries: 3,
    });
    expect(met.state).toBe("threshold_met");
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
});
