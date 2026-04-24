import { describe, it, expect } from "vitest";
import {
  MODULE_TO_PATH,
  V0_MODULES_ENABLED,
  scoreProfile,
} from "@/lib/onboarding";
import type { QuizOption, RecommendedModule } from "@/lib/onboarding";
import { submitQuizSchema } from "@/lib/validation";

describe("scoreProfile", () => {
  it("scores a clear winner correctly", () => {
    // All 8 scoring questions answered "A":
    // Q1-A=direct, Q2-A=direct, Q3-A=direct, Q4-A=intense, Q5-A=intense(+1 direct secondary),
    // Q6-A=direct, Q7-A=direct, Q8-A=direct
    // direct: 5×2 + 1 = 11, intense: 2×2 = 4
    const answers: (QuizOption | null)[] = ["A", "A", "A", "A", "A", "A", "A", "A", "A"];
    const result = scoreProfile(answers);

    expect(result.primary).toBe("direct");
    // Q1-A=direct(2), Q2-A=direct(2), Q3-A=direct(2), Q6-A=direct(2), Q7-A=direct(2), Q8-A=direct(2) = 12
    // Q5-A secondary = +1 direct = 13 total
    expect(result.scores.direct).toBe(13);
    expect(result.scores.intense).toBe(4); // Q4-A=intense(2) + Q5-A=intense(2)
    expect(result.secondary).toBe("intense");
    // Forecast-era: improvementGoal is null on every new submission; routing
    // comes from FORECAST_MAPPING. Writing the old "staying_calm" sentinel
    // would conflate post-rewrite users with pre-rewrite Q9-A users in any
    // future analytics query.
    expect(result.improvementGoal).toBeNull();
    expect(result.recommendedModule).toBe("prepare"); // Q9-A → "Hard convo incoming"
  });

  it("Q9=A (hard convo incoming) routes to prepare", () => {
    const answers: (QuizOption | null)[] = [
      "A", "A", "A", "A", "A", "A", "A", "A", "A",
    ];
    expect(scoreProfile(answers).recommendedModule).toBe("prepare");
  });

  it("Q9=B (in it right now) routes to before_send", () => {
    const answers: (QuizOption | null)[] = [
      "A", "A", "A", "A", "A", "A", "A", "A", "B",
    ];
    expect(scoreProfile(answers).recommendedModule).toBe("before_send");
  });

  it("Q9=C (just looking around) routes to prepare", () => {
    const answers: (QuizOption | null)[] = [
      "A", "A", "A", "A", "A", "A", "A", "A", "C",
    ];
    expect(scoreProfile(answers).recommendedModule).toBe("prepare");
  });

  it("resolves ties using Q8→Q7 cascade", () => {
    // Build answers that tie "direct" and "reflective" at 4 pts each:
    // Q1-A=direct(2), Q2-B=reflective(2), Q3-A=direct(2), Q4-B=reflective(2)
    // Q5-D=measured(2), Q6-D=measured(2), Q7-D=measured(2)
    // Q8-A=direct(2) ← this is the tiebreaker
    // direct: 2+2 = 4 from Q1,Q3 → then +2 from Q8 = 6. But Q8 breaks the tie.
    // Wait — with Q8-A, direct gets 6 total, reflective gets 4. Not a tie.
    //
    // True tie: direct=4, reflective=4 with Q8 used to break it.
    // Q1-A=direct(2), Q2-B=reflective(2), Q3-A=direct(2), Q4-B=reflective(2)
    // Q5-D=measured(2), Q6-D=measured(2), Q7-D=measured(2), Q8-B=reflective(2)
    // direct: 4, reflective: 6 — not a tie.
    //
    // To make a true tie we need equal top scores.
    // Q1-A=direct(2), Q2-B=reflective(2), Q3-B=reflective(2), Q4-D=measured(2)
    // Q5-D=measured(2), Q6-D=measured(2), Q7-A=direct(2), Q8-D=measured(2)
    // direct: 2+2=4, reflective: 2+2=4, measured: 2+2+2+2=8 → measured wins, not a tie
    //
    // Simplest tie: exactly 2 profiles at top.
    // Q1-A=direct(2), Q2-C=warm(2), Q3-A=direct(2), Q4-C=warm(2)
    // Q5-C=warm(2), Q6-C=warm(2), Q7-A=direct(2), Q8-A=direct(2), Q9-A
    // direct: Q1(2)+Q3(2)+Q7(2)+Q8(2)=8, warm: Q2(2)+Q4(2)+Q5(2)+Q6(2)=8
    // Q5-A secondary doesn't apply (Q5=C). Tie is direct=8, warm=8.
    // Tiebreaker: Q8(index 7) maps A→direct → direct wins.
    const answers: (QuizOption | null)[] = ["A", "C", "A", "C", "C", "C", "A", "A", "A"];
    const result = scoreProfile(answers);

    expect(result.primary).toBe("direct");
    expect(result.scores.direct).toBe(8);
    expect(result.scores.warm).toBe(8);
  });

  it("throws on all-null input", () => {
    const answers: (QuizOption | null)[] = [null, null, null, null, null, null, null, null, null];
    expect(() => scoreProfile(answers)).toThrow("no scorable answers");
  });

  it("Q9=null falls through to prepare (defensive default)", () => {
    // All scoring questions answered, Q9 missing. scoreProfile must not throw
    // and must default routing to "prepare" — guards against an upstream
    // submit path stripping Q9 without us noticing.
    const answers: (QuizOption | null)[] = [
      "A", "A", "A", "A", "A", "A", "A", "A", null,
    ];
    expect(scoreProfile(answers).recommendedModule).toBe("prepare");
  });

  it("Q5-A secondary rule adds +1 to direct", () => {
    // Q5-A maps primary to "intense" (2 pts) and secondary +1 to "direct"
    // Set Q5=A, everything else null to isolate.
    const answers: (QuizOption | null)[] = [null, null, null, null, "A", null, null, null, null];
    const result = scoreProfile(answers);

    expect(result.scores.intense).toBe(2); // Q5 primary mapping
    expect(result.scores.direct).toBe(1); // Q5 secondary rule
    expect(result.primary).toBe("intense"); // 2 > 1
  });
});

describe("MODULE_TO_PATH (binding canary)", () => {
  it("before_send maps to the hyphenated route", () => {
    // The whole reason MODULE_TO_PATH exists is the underscore-vs-hyphen
    // gap. If this assertion fails, /api/onboarding/submit is returning
    // /coach/before_send (404) for Q9=B users.
    expect(MODULE_TO_PATH.before_send).toBe("/coach/before-send");
  });

  it("covers every RecommendedModule key with a non-empty path starting with /", () => {
    for (const key of Object.keys(V0_MODULES_ENABLED) as RecommendedModule[]) {
      const path = MODULE_TO_PATH[key];
      expect(path).toBeTruthy();
      expect(path.startsWith("/")).toBe(true);
    }
  });
});

describe("submitQuizSchema Q9 superRefine", () => {
  function build(q9: "A" | "B" | "C" | "D" | "E") {
    return {
      answers: Array.from({ length: 9 }, (_, i) => ({
        questionIndex: i,
        selectedOption: i === 8 ? q9 : "A",
      })),
    };
  }

  it("accepts Q9=A, B, C", () => {
    for (const q9 of ["A", "B", "C"] as const) {
      expect(submitQuizSchema.safeParse(build(q9)).success).toBe(true);
    }
  });

  it("rejects Q9=D and Q9=E (UI cannot submit them; curl bypass blocked)", () => {
    for (const q9 of ["D", "E"] as const) {
      expect(submitQuizSchema.safeParse(build(q9)).success).toBe(false);
    }
  });
});
