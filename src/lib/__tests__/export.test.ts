import { describe, it, expect } from "vitest";
import {
  formatProfileSection,
  formatPrepareSection,
  formatReviewSection,
  formatRepairSection,
  formatTriggerSection,
  formatOverwhelmedSection,
  formatPersonsSection,
  formatThreadsSection,
  formatMemoriesSection,
} from "@/lib/export";

const personMap = new Map<string, string>([
  ["person-1", "Sarah"],
  ["person-2", "Marcus"],
]);
const threadMap = new Map<string, string | null>([
  ["thread-1", "Quarterly review"],
  ["thread-2", null],
]);

describe("formatProfileSection", () => {
  it("renders 'No entries yet.' when profile is null", () => {
    const out = formatProfileSection(null, null);
    expect(out).toContain("COMMUNICATION PROFILE");
    expect(out).toContain("No entries yet.");
  });

  it("renders profile with secondary and quiz answers from snapshot", () => {
    const out = formatProfileSection(
      {
        primary_profile: "reflective",
        secondary_profile: "warm",
        created_at: "2026-03-15T10:00:00.000Z",
      },
      {
        created_at: "2026-03-15T10:00:00.000Z",
        payload_json: {
          answers: [
            { q_index: 0, selected: "B" },
            { q_index: 1, selected: "C" },
          ],
          question_snapshot: [
            {
              text: "Question one?",
              options: { A: "opt a", B: "opt b", C: "opt c" },
            },
            {
              text: "Question two?",
              options: { A: "a2", B: "b2", C: "c2" },
            },
          ],
        },
      },
    );
    expect(out).toContain("Primary profile: reflective");
    expect(out).toContain("Secondary profile: warm");
    expect(out).toContain("Q1. Question one?");
    expect(out).toContain("→ B: opt b");
    expect(out).toContain("Q2. Question two?");
    expect(out).toContain("→ C: c2");
  });

  it("omits secondary line when secondary_profile is null", () => {
    const out = formatProfileSection(
      {
        primary_profile: "direct",
        secondary_profile: null,
        created_at: "2026-03-15T10:00:00.000Z",
      },
      null,
    );
    expect(out).toContain("Primary profile: direct");
    expect(out).not.toContain("Secondary profile:");
  });

  it("falls back to live QUESTIONS when snapshot missing", () => {
    const out = formatProfileSection(
      {
        primary_profile: "direct",
        secondary_profile: null,
        created_at: "2026-03-15T10:00:00.000Z",
      },
      {
        created_at: "2026-03-15T10:00:00.000Z",
        payload_json: {
          answers: [{ q_index: 0, selected: "A" }],
        },
      },
    );
    // live Q1 text
    expect(out).toContain(
      "When conversations go well, what feels most natural to you?",
    );
    expect(out).toContain("→ A: Saying what matters clearly and directly");
  });
});

describe("formatPrepareSection", () => {
  it("renders 'No entries yet.' when rows empty", () => {
    const out = formatPrepareSection([], personMap, threadMap);
    expect(out).toContain("PREPARE ENTRIES (0)");
    expect(out).toContain("No entries yet.");
  });

  it("renders entries with person and thread labels, omits empty fields", () => {
    const out = formatPrepareSection(
      [
        {
          created_at: "2026-03-20T14:22:00.000Z",
          situation_text: "I want to ask for time off.",
          desired_outcome: "They understand why this matters.",
          primary_value: "", // empty → omitted
          person_id: "person-1",
          thread_id: "thread-1",
        },
        {
          created_at: "2026-03-10T09:00:00.000Z",
          situation_text: null, // null → omitted
          desired_outcome: "Clarity on the scope.",
          primary_value: "honesty",
          person_id: null,
          thread_id: null,
        },
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("PREPARE ENTRIES (2)");
    expect(out).toContain("Sarah — Thread: Quarterly review");
    expect(out).toContain("I want to ask for time off.");
    expect(out).toContain("Desired outcome:");
    expect(out).not.toContain("What matters to me:\n    \n"); // empty value omitted for row 1
    expect(out).toContain("No person set");
    expect(out).toContain("honesty");
  });

  it("separates multiple entries with a divider", () => {
    const out = formatPrepareSection(
      [
        {
          created_at: "2026-03-20T14:22:00.000Z",
          situation_text: "a",
          desired_outcome: null,
          primary_value: null,
          person_id: null,
          thread_id: null,
        },
        {
          created_at: "2026-03-10T09:00:00.000Z",
          situation_text: "b",
          desired_outcome: null,
          primary_value: null,
          person_id: null,
          thread_id: null,
        },
      ],
      personMap,
      threadMap,
    );
    const dividerCount = (out.match(/-{30,}/g) ?? []).length;
    // One entry separator between two entries.
    expect(dividerCount).toBeGreaterThanOrEqual(1);
  });
});

describe("formatReviewSection", () => {
  it("renders all content-bearing fields that are present", () => {
    const out = formatReviewSection(
      [
        {
          created_at: "2026-03-20T14:22:00.000Z",
          what_happened: "It went sideways.",
          hardest_moment_feeling: "anxious",
          observed_in_them: "they crossed their arms",
          their_experience: "they felt cornered",
          what_helped: "slowing down",
          what_hurt: "interrupting",
          validated_assumptions: "yes on one, no on the other",
          unresolved_and_next: "circle back Monday",
          person_id: "person-2",
          thread_id: null,
        },
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("Marcus");
    expect(out).toContain("What happened:");
    expect(out).toContain("Hardest moment — what I was feeling:");
    expect(out).toContain("What I observed in them:");
    expect(out).toContain("Their experience:");
    expect(out).toContain("What helped:");
    expect(out).toContain("What hurt:");
    expect(out).toContain("Assumptions I validated:");
    expect(out).toContain("Unresolved — and what's next:");
    expect(out).toContain("circle back Monday");
  });
});

describe("formatRepairSection", () => {
  it("renders non-nullable fields", () => {
    const out = formatRepairSection(
      [
        {
          created_at: "2026-03-22T10:00:00.000Z",
          what_needs_repair: "I raised my voice.",
          your_responsibility: "starting the conversation hot",
          their_need: "to be heard without interruption",
          desired_outcome: "rebuild_trust",
          channel: "in_person",
          timing: "today",
          person_id: "person-1",
          thread_id: "thread-1",
        },
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("REPAIR ENTRIES (1)");
    expect(out).toContain("I raised my voice.");
    expect(out).toContain("Channel:");
    expect(out).toContain("in_person");
  });
});

describe("formatTriggerSection", () => {
  it("does not print a Thread: label (trigger entries are person-only)", () => {
    const out = formatTriggerSection(
      [
        {
          created_at: "2026-03-20T14:22:00.000Z",
          event_text: "email arrived",
          interpretation: "they're mad",
          emotion: "panic",
          urge: "reply immediately",
          behavior: "closed the laptop",
          outcome: "cooled down",
          learning: "breathe first",
          person_id: "person-1",
        },
      ],
      personMap,
    );
    expect(out).toContain("Sarah");
    expect(out).not.toContain("Thread:");
    expect(out).toContain("Learning:");
  });
});

describe("formatOverwhelmedSection", () => {
  it("includes the 1-5 scale suffix for intensity ratings", () => {
    const out = formatOverwhelmedSection([
      {
        created_at: "2026-03-20T14:22:00.000Z",
        what_happened: "backed up",
        body_sensations: "tight chest",
        overwhelm_before: 4,
        overwhelm_after: 2,
        technique_used: "4-7-8",
      },
    ]);
    expect(out).toContain("4 / 5");
    expect(out).toContain("2 / 5");
  });

  it("omits 0 intensity when null", () => {
    const out = formatOverwhelmedSection([
      {
        created_at: "2026-03-20T14:22:00.000Z",
        what_happened: "x",
        body_sensations: null,
        overwhelm_before: null,
        overwhelm_after: null,
        technique_used: null,
      },
    ]);
    expect(out).not.toContain("/ 5");
  });
});

describe("formatPersonsSection", () => {
  it("renders domain with optional subtype", () => {
    const out = formatPersonsSection([
      {
        display_name: "Sarah",
        relationship_domain: "work",
        relationship_subtype: "manager",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      {
        display_name: "Mom",
        relationship_domain: "family",
        relationship_subtype: null,
        created_at: "2026-03-02T00:00:00.000Z",
      },
    ]);
    expect(out).toContain("- Sarah (work — manager)");
    expect(out).toContain("- Mom (family)");
  });
});

describe("formatThreadsSection", () => {
  it("handles null title with '(untitled)' fallback", () => {
    const out = formatThreadsSection(
      [
        {
          title: null,
          status: "open",
          started_at: "2026-03-01T00:00:00.000Z",
          last_activity_at: "2026-03-05T00:00:00.000Z",
          person_id: "person-1",
        },
      ],
      personMap,
    );
    expect(out).toContain("(untitled)");
    expect(out).toContain("Status: open");
  });
});

describe("formatMemoriesSection", () => {
  it("filters out rows with only empty notes and context", () => {
    const out = formatMemoriesSection(
      [
        {
          user_written_context: "  ", // whitespace-only counts as empty
          pinned_notes: "",
          last_interaction_at: null,
          person_id: "person-1",
        },
        {
          user_written_context: "context here",
          pinned_notes: null,
          last_interaction_at: "2026-03-10T00:00:00.000Z",
          person_id: "person-2",
        },
      ],
      personMap,
    );
    expect(out).toContain("RELATIONSHIP NOTES (1)");
    expect(out).toContain("Marcus");
    expect(out).toContain("context here");
    expect(out).not.toContain("Sarah");
  });

  it("renders empty section when no memories", () => {
    const out = formatMemoriesSection([], personMap);
    expect(out).toContain("RELATIONSHIP NOTES (0)");
    expect(out).toContain("No entries yet.");
  });
});
