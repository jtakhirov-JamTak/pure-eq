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

// Helpers: every column nulled, tests spread overrides on top so future
// SOT extensions don't need to touch every fixture.
type PrepareRowArg = Parameters<typeof formatPrepareSection>[0][number];
type ReviewRowArg = Parameters<typeof formatReviewSection>[0][number];

function blankPrepare(overrides: Partial<PrepareRowArg>): PrepareRowArg {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    path: null,
    situation_text: null,
    desired_outcome: null,
    primary_value: null,
    their_need: null,
    how_to_make_them_feel: null,
    what_feels_off: null,
    what_changed: null,
    story_telling_yourself: null,
    afraid_it_means: null,
    signal_noise_observation: null,
    primary_emotion: null,
    body_location: null,
    emotion_as_data: null,
    default_pattern: null,
    observed_from_them: null,
    their_state_hedged: null,
    fairest_version: null,
    predicted_reaction: null,
    hidden_expectation: null,
    neutral_check_question: null,
    specific_shift: null,
    outcome_floor: null,
    opener: null,
    trigger_plan: null,
    person_id: null,
    thread_id: null,
    ...overrides,
  };
}

function blankReview(overrides: Partial<ReviewRowArg>): ReviewRowArg {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    review_depth: null,
    what_happened: null,
    observed_raw: null,
    interpreted_raw: null,
    hardest_moment_feeling: null,
    felt_at_hardest_moment: null,
    body_location: null,
    feeling_tracking: null,
    observed_in_them: null,
    their_experience: null,
    their_in_moment_experience: null,
    what_helped: null,
    what_hurt: null,
    validated_assumptions: null,
    unresolved_and_next: null,
    what_you_did: null,
    what_you_avoided: null,
    ask_before_understanding: null,
    needs_to_happen_next: null,
    forecast: null,
    easier_or_harder: null,
    treat_as_data: null,
    something_that_helped: null,
    signs_how_they_left: null,
    turning_point: null,
    what_protecting: null,
    what_protecting_text: null,
    lesson_about_them: null,
    lesson_about_self: null,
    lesson_differently: null,
    what_else_explains: null,
    what_read_missed: null,
    calibration_block: null,
    repair_branch_active: false,
    impact_to_name: null,
    their_need_first: null,
    pressure_vs_care: null,
    timing_when: null,
    timing_now: null,
    first_repair_sentence: null,
    your_part: null,
    secret_want: null,
    could_make_them_feel: null,
    person_id: null,
    thread_id: null,
    ...overrides,
  };
}

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
        blankPrepare({
          created_at: "2026-03-20T14:22:00.000Z",
          path: "path_a",
          situation_text: "I want to ask for time off.",
          desired_outcome: "They understand why this matters.",
          primary_value: "", // empty → omitted
          person_id: "person-1",
          thread_id: "thread-1",
        }),
        blankPrepare({
          created_at: "2026-03-10T09:00:00.000Z",
          path: null, // legacy row
          desired_outcome: "Clarity on the scope.",
          primary_value: "honesty",
        }),
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
        blankPrepare({ created_at: "2026-03-20T14:22:00.000Z", situation_text: "a" }),
        blankPrepare({ created_at: "2026-03-10T09:00:00.000Z", situation_text: "b" }),
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
        blankReview({
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
        }),
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("Marcus");
    expect(out).toContain("What happened:");
    // Pre-SOT label kept (with explicit "(legacy)" suffix) so users with
    // historical data can still locate hardest_moment_feeling content after
    // the 2026-05-08 schema split into felt_at_hardest_moment + body_location.
    expect(out).toContain("Hardest moment — what I was feeling (legacy):");
    expect(out).toContain("What I observed in them:");
    expect(out).toContain("Their experience (legacy):");
    expect(out).toContain("What helped:");
    expect(out).toContain("What hurt:");
    expect(out).toContain("Assumptions I validated:");
    expect(out).toContain("Unresolved — and what's next:");
    expect(out).toContain("circle back Monday");
  });

  it("renders repair-branch fields only when repair_branch_active is true", () => {
    const out = formatReviewSection(
      [
        blankReview({
          created_at: "2026-03-20T14:22:00.000Z",
          what_happened: "We talked.",
          hardest_moment_feeling: "defensive",
          what_you_did: "interrupted twice",
          what_you_avoided: "the real ask",
          ask_before_understanding: "no",
          needs_to_happen_next: "apologize",
          repair_branch_active: true,
          your_part: "starting defensive",
          secret_want: "to be right",
          could_make_them_feel: "safe enough to disagree",
          person_id: "person-2",
        }),
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("What I did:");
    expect(out).toContain("My part in this (legacy):");
    expect(out).toContain("safe enough to disagree");
  });

  it("renders observed_raw / interpreted_raw fields when populated (cross-eval batch #1)", () => {
    const out = formatReviewSection(
      [
        blankReview({
          created_at: "2026-05-04T09:00:00.000Z",
          what_happened: "We talked about the budget.",
          observed_raw: "they kept looking at the door",
          interpreted_raw: "I read it as them wanting to leave",
          hardest_moment_feeling: "anxious",
          what_you_did: "rushed through the agenda",
          what_you_avoided: "the real ask",
          ask_before_understanding: "no",
          needs_to_happen_next: "clarify",
        }),
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("What I observed (facts):");
    expect(out).toContain("they kept looking at the door");
    expect(out).toContain("What I thought it meant:");
    expect(out).toContain("I read it as them wanting to leave");
  });

  it("renders signal_noise_observation in Prepare export when populated (cross-eval batch #1)", () => {
    const out = formatPrepareSection(
      [
        blankPrepare({
          created_at: "2026-05-04T09:00:00.000Z",
          path: "path_b",
          what_feels_off: "they've been distant",
          what_changed: "stopped texting in the morning",
          story_telling_yourself: "they're losing interest",
          afraid_it_means: "the relationship is fading",
          signal_noise_observation:
            "If they don't initiate plans in the next 5 days, that's signal.",
        }),
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("What would tell me this is real (3–7 day signal/noise):");
    expect(out).toContain("If they don't initiate plans in the next 5 days");
  });

  // SOT 2026-05-08 + 2026-05-17 followup: Prepare gains 14 new SOT fields
  // (empathy ladder, outcome, opener, trigger plan). Export.ts must read
  // each one — predicted by CLAUDE.md's "writer but no reader = dead state"
  // rule and "hand-rolled row types drift when columns rename" lesson.
  it("renders SOT-era Prepare fields when populated (2026-05-17 export gap fix)", () => {
    const out = formatPrepareSection(
      [
        blankPrepare({
          created_at: "2026-05-15T09:00:00.000Z",
          path: "sot_v2",
          situation_text: "performance conversation with my report",
          primary_emotion: "anxious",
          body_location: "chest",
          emotion_as_data: "I care about this going well",
          default_pattern: "over-explain and soften",
          observed_from_them: "they avoided eye contact last 1:1",
          their_state_hedged: "maybe disengaged or maybe just tired",
          fairest_version: "they're worried about being judged",
          predicted_reaction: "defensive at first",
          hidden_expectation: "they'll just agree",
          neutral_check_question:
            "What feels different about your work lately?",
          specific_shift: "they ask me a clarifying question",
          outcome_floor: "we leave with a clear next check-in",
          opener: "I want to share what I've been noticing.",
          trigger_plan:
            "If I notice myself softening, I will pause and restate the point.",
        }),
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("— Coach SOT");
    expect(out).toContain("Primary emotion going in:");
    expect(out).toContain("Where I feel it in my body:");
    expect(out).toContain("My default pattern under this emotion:");
    expect(out).toContain("Neutral question to ask instead of assume:");
    expect(out).toContain("Specific shift I want:");
    expect(out).toContain("Floor — what's good enough:");
    expect(out).toContain("Opener:");
    expect(out).toContain("If-then trigger plan:");
    expect(out).toContain(
      "If I notice myself softening, I will pause and restate the point.",
    );
  });

  // SOT 2026-05-08 + 2026-05-17 followup: Review gains ~22 new SOT cols
  // (felt_at_hardest_moment + body_location, feeling_tracking, calibration
  // block, lesson trio, forecast, outcome arc, 6-field repair branch). Same
  // export-gap fix as the Prepare test above.
  it("renders SOT-era Review fields (calibration + lesson + repair) when populated", () => {
    const out = formatReviewSection(
      [
        blankReview({
          created_at: "2026-05-15T18:00:00.000Z",
          review_depth: "full",
          what_happened: "the performance conversation",
          felt_at_hardest_moment: "tightness when they pushed back",
          body_location: "throat",
          feeling_tracking:
            "yes — I'd been worried about the conversation for two days",
          their_in_moment_experience:
            "they may have felt blindsided despite my prep",
          forecast: "we'll have a calmer follow-up in 5 days",
          easier_or_harder: "harder",
          treat_as_data: "yes",
          something_that_helped: "pausing before the second push",
          signs_how_they_left: "shoulders dropped at the end",
          turning_point: "when I asked the neutral question",
          what_protecting: "image",
          what_protecting_text: "looking like a fair manager",
          lesson_about_them: "they need processing time",
          lesson_about_self: "I over-explain when nervous",
          lesson_differently: "ask the question, then wait",
          what_else_explains: "they may have had a hard morning",
          what_read_missed:
            "the eye-contact reduction might have been about email, not me",
          calibration_block: {
            compare: "worse",
            shift: "about_the_same",
            floor: "met",
          },
          repair_branch_active: true,
          impact_to_name: "I cut them off at the start",
          their_need_first: "to feel heard before solutions",
          pressure_vs_care: "lean care — I was urgent for the wrong reason",
          timing_when: "tomorrow afternoon",
          timing_now: false,
          first_repair_sentence:
            "I think I jumped past what you were trying to say.",
        }),
      ],
      personMap,
      threadMap,
    );
    expect(out).toContain("— Full review");
    expect(out).toContain("What I felt at the hardest moment:");
    expect(out).toContain("Where I felt it in my body:");
    expect(out).toContain("Was that feeling tracking something real?:");
    expect(out).toContain(
      "What it might have felt like for them in that moment:",
    );
    expect(out).toContain("Forecast (5–7 day):");
    expect(out).toContain("Easier or harder than I predicted?:");
    expect(out).toContain("Turning point in the conversation:");
    expect(out).toContain("What I was wanting or protecting:");
    expect(out).toContain("Lesson — what I learned about myself:");
    expect(out).toContain("Calibration — vs prediction:");
    expect(out).toContain("Calibration — vs outcome floor:");
    expect(out).toContain("Impact to name in the repair:");
    expect(out).toContain("First repair sentence:");
    expect(out).toContain("Repair-now decision:");
    expect(out).toContain("Later");
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
