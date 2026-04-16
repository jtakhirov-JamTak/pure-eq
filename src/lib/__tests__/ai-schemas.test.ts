import { describe, it, expect } from "vitest";
import { checkBannedPhrases, validateAIOutput } from "@/lib/ai/schemas";
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
