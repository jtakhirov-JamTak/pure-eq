import { describe, it, expect } from "vitest";
import {
  checkBannedPhrases,
  validateAIOutput,
  prepareOutputSchema,
} from "@/lib/ai/schemas";
import { submitQuizSchema } from "@/lib/validation";

describe("checkBannedPhrases", () => {
  it("detects banned phrases case-insensitively and returns null for clean text", () => {
    // Case variation should still match
    expect(checkBannedPhrases("DEEP DOWN you feel hurt")).toBe("Deep down");
    expect(checkBannedPhrases("you are someone who struggles")).toBe(
      "You are someone who"
    );
    expect(checkBannedPhrases("Your trauma response is to shut down")).toBe(
      "Your trauma response is"
    );

    // Clean text
    expect(checkBannedPhrases("You tend to over-explain under stress")).toBeNull();
    expect(checkBannedPhrases("")).toBeNull();
  });
});

describe("validateAIOutput", () => {
  it("throws on banned phrase and identifies the field", () => {
    const output = {
      field1: "This is fine",
      field2: "You are someone who avoids conflict",
      field3: 42, // non-string, should be skipped
    };

    expect(() => validateAIOutput(output)).toThrow("field2");
    expect(() => validateAIOutput(output)).toThrow("You are someone who");

    // Clean output returns true
    expect(
      validateAIOutput({
        field1: "You tend to withdraw under pressure",
        field2: "A repeated pattern is defensiveness",
      })
    ).toBe(true);
  });
});

describe("validateAIOutput — stripGeneric on action fields", () => {
  it("nullifies 'Be more patient with her.' on best_next_move", () => {
    const output: Record<string, unknown> = {
      best_next_move: "Be more patient with her.",
    };
    validateAIOutput(output);
    expect(output.best_next_move).toBeNull();
  });

  it("nullifies 'try to listen better' on thing_to_cut", () => {
    const output: Record<string, unknown> = {
      thing_to_cut: "try to listen better",
    };
    validateAIOutput(output);
    expect(output.thing_to_cut).toBeNull();
  });

  it("nullifies exact 'Be more patient.' via exact_be_more_patient", () => {
    const output: Record<string, unknown> = {
      best_next_move: "Be more patient.",
    };
    validateAIOutput(output);
    expect(output.best_next_move).toBeNull();
  });

  it("preserves a real action on best_next_move", () => {
    const output: Record<string, unknown> = {
      best_next_move: "Add a check-in question and hit send.",
    };
    validateAIOutput(output);
    expect(output.best_next_move).toBe("Add a check-in question and hit send.");
  });

  it("preserves 'Try a Prepare before Sunday' — leading_try_to does not fire on 'Try a '", () => {
    const output: Record<string, unknown> = {
      best_next_move: "Try a Prepare before Sunday's dinner.",
    };
    validateAIOutput(output);
    expect(output.best_next_move).toBe("Try a Prepare before Sunday's dinner.");
  });
});

describe("prepareOutputSchema — action-field nullability + cap", () => {
  const baseNormal = {
    mode: "normal" as const,
    real_issue: "Something concrete and specific happens when X.",
    reality_check_question: "What did you actually notice first?",
    thing_not_to_do: "Don't open with 'I just want to say one thing.'",
    they_might_need: "Acknowledgement before anything else.",
    pattern_tag: "withdrew_under_tension" as const,
  };

  it("accepts best_next_move: null", () => {
    const result = prepareOutputSchema.safeParse({
      ...baseNormal,
      best_next_move: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects best_next_move over the 120 cap", () => {
    const result = prepareOutputSchema.safeParse({
      ...baseNormal,
      best_next_move: "a".repeat(121),
    });
    expect(result.success).toBe(false);
  });
});

describe("submitQuizSchema", () => {
  it("rejects duplicate question indices and accepts valid 0-8", () => {
    const validAnswers = Array.from({ length: 9 }, (_, i) => ({
      questionIndex: i,
      selectedOption: "A" as const,
    }));

    // Valid: indices 0-8, each once
    const validResult = submitQuizSchema.safeParse({ answers: validAnswers });
    expect(validResult.success).toBe(true);

    // Invalid: all indices are 0 (duplicates)
    const duplicateAnswers = Array.from({ length: 9 }, () => ({
      questionIndex: 0,
      selectedOption: "A" as const,
    }));
    const dupResult = submitQuizSchema.safeParse({ answers: duplicateAnswers });
    expect(dupResult.success).toBe(false);

    // Invalid: only 8 answers
    const shortAnswers = validAnswers.slice(0, 8);
    const shortResult = submitQuizSchema.safeParse({ answers: shortAnswers });
    expect(shortResult.success).toBe(false);
  });
});
