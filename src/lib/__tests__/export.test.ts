import { describe, it, expect } from "vitest";
import {
  formatProfileSection,
  formatPrepareSection,
  formatReviewSection,
  formatRepairSection,
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
          path: "path_a",
          situation_text: "I want to ask for time off.",
          desired_outcome: "They understand why this matters.",
          primary_value: "", // empty → omitted
          their_need: null,
          how_to_make_them_feel: null,
          what_feels_off: null,
          what_changed: null,
          story_telling_yourself: null,
          afraid_it_means: null,
          person_id: "person-1",
          thread_id: "thread-1",
        },
        {
          created_at: "2026-03-10T09:00:00.000Z",
          path: null, // legacy row
          situation_text: null, // null → omitted
          desired_outcome: "Clarity on the scope.",
          primary_value: "honesty",
          their_need: null,
          how_to_make_them_feel: null,
          what_feels_off: null,
          what_changed: null,
          story_telling_yourself: null,
          afraid_it_means: null,
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
          path: null,
          situation_text: "a",
          desired_outcome: null,
          primary_value: null,
          their_need: null,
          how_to_make_them_feel: null,
          what_feels_off: null,
          what_changed: null,
          story_telling_yourself: null,
          afraid_it_means: null,
          person_id: null,
          thread_id: null,
        },
        {
          created_at: "2026-03-10T09:00:00.000Z",
          path: null,
          situation_text: "b",
          desired_outcome: null,
          primary_value: null,
          their_need: null,
          how_to_make_them_feel: null,
          what_feels_off: null,
          what_changed: null,
          story_telling_yourself: null,
          afraid_it_means: null,
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
  it("renders all content-bearing legacy fields that are present", () => {
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
          what_you_did: null,
          what_you_avoided: null,
          ask_before_understanding: null,
          needs_to_happen_next: null,
          repair_branch_active: false,
          your_part: null,
          secret_want: null,
          could_make_them_feel: null,
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

  it("renders repair-branch fields only when repair_branch_active is true", () => {
    const out = formatReviewSection(
      [
        {
          created_at: "2026-03-20T14:22:00.000Z",
          what_happened: "We talked.",
          hardest_moment_feeling: "defensive",
          observed_in_them: null,
          their_experience: null,
          what_helped: null,
          what_hurt: null,
          validated_assumptions: null,
          unresolved_and_next: null,
          what_you_did: "interrupted twice",
          what_you_avoided: "the real ask",
          ask_before_understanding: "no",
          needs_to_happen_next: "apologize",
          repair_branch_active: true,
          your_part: "starting defensive",
          secret_want: "to be right",
          could_make_them_feel: "safe enough to disagree",
          person_id: "person-2",
          thread_id: null,
        },
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("What I did:");
    expect(out).toContain("My part in this:");
    expect(out).toContain("safe enough to disagree");
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
