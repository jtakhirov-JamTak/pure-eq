import { describe, it, expect } from "vitest";
import { scoreProfile, QUESTIONS } from "@/lib/onboarding";
import type { QuizOption } from "@/lib/onboarding";

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
    expect(result.improvementGoal).toBe("staying_calm"); // Q9-A
    expect(result.recommendedModule).toBe("prepare"); // v0 clamp
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
