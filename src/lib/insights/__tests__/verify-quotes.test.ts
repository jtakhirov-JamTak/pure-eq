import { describe, it, expect } from "vitest";
import { verifyQuotes, deriveConfidence, MIN_QUOTE_CHARS } from "../generate";
import type {
  ReflectionNormal,
  ReflectionObservation,
  ReflectionFocus,
} from "@/lib/ai/schemas";

// Typed so `modules` is contextually narrowed to the FocusModule enum.
const FOCUS: ReflectionFocus = {
  theme: "A theme",
  practice: "Practice this next week.",
  modules: ["review"],
};

function mkEvidence(quote: string, sourceId: string) {
  return { quote, source_record_id: sourceId, source_date: "2026-04-20" };
}

// Helpers — build minimal valid observations for the verifier.
function mkObservation(
  quote: string,
  sourceId = "r-1",
  counter: Array<{ quote: string; sourceId: string }> = [],
) {
  return {
    theme: "A theme",
    observation: "An observation about a pattern",
    evidence: [mkEvidence(quote, sourceId)],
    counter_evidence: counter.map((c) => mkEvidence(c.quote, c.sourceId)),
    confidence: "early" as const,
  };
}

function mkReflection(...observations: ReturnType<typeof mkObservation>[]): ReflectionNormal {
  return {
    mode: "reflection",
    summary: "Summary of patterns",
    observations,
    focus: FOCUS,
    focus_followup: null,
  };
}

describe("verifyQuotes min-length guard", () => {
  it("drops observations whose quote is a single word even when source contains it", () => {
    // User text contains "apologize" — exact substring match would pass a
    // naive verifier. The min-length guard must reject it anyway.
    const lookup = new Map([["r-1", "I tried to apologize but she stayed quiet."]]);
    const refl = mkReflection(mkObservation("apologize"));
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it("drops single-word quotes that match FIELD GLOSSARY enum tokens", () => {
    const lookup = new Map([
      ["r-1", "I want to set a boundary with my manager. Also clarify the ask."],
    ]);
    const refl = mkReflection(
      mkObservation("boundary"),
      mkObservation("clarify"),
      mkObservation("ask"),
    );
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it("accepts multi-word quotes that substring-match the source", () => {
    const lookup = new Map([["r-1", "I tried to apologize but she stayed quiet."]]);
    const refl = mkReflection(mkObservation("stayed quiet"));
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(1);
  });

  it("trims quotes before length/space check (padded single word still rejected)", () => {
    const lookup = new Map([["r-1", "I need to apologize before we talk again."]]);
    const refl = mkReflection(mkObservation("   apologize   "));
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it("rejects very short multi-word quotes below the char floor", () => {
    const lookup = new Map([["r-1", "I am."]]);
    const refl = mkReflection(mkObservation("I am"));
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it(`rejects multi-word quote one char below the MIN_QUOTE_CHARS (${MIN_QUOTE_CHARS}) boundary`, () => {
    // Build a source long enough to contain the quote, then derive the
    // quote at exactly MIN_QUOTE_CHARS - 1 chars with a space in it.
    const under = "a bcd".slice(0, MIN_QUOTE_CHARS - 1); // e.g. "a bcd" slice(0,5) → "a bcd" if min=6
    const source = `padding ${under} padding`;
    const lookup = new Map([["r-1", source]]);
    const refl = mkReflection(mkObservation(under));
    expect(under.length).toBe(MIN_QUOTE_CHARS - 1);
    expect(under).toContain(" ");
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it(`accepts multi-word quote exactly at the MIN_QUOTE_CHARS (${MIN_QUOTE_CHARS}) boundary`, () => {
    const ok = "ab cde".slice(0, MIN_QUOTE_CHARS); // "ab cde" → "ab cde" if min=6
    const source = `padding ${ok} padding`;
    const lookup = new Map([["r-1", source]]);
    const refl = mkReflection(mkObservation(ok));
    expect(ok.length).toBe(MIN_QUOTE_CHARS);
    expect(ok).toContain(" ");
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(1);
  });

  it("drops observations whose source_record_id is not in the lookup", () => {
    const lookup = new Map([["r-1", "Some user text here."]]);
    const refl = mkReflection(mkObservation("some user text", "r-unknown"));
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it("drops observations whose multi-word quote is not a substring of source", () => {
    const lookup = new Map([["r-1", "I tried to apologize but she stayed quiet."]]);
    const refl = mkReflection(mkObservation("I slammed the door"));
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });

  it("keeps mixed observations — drops bad, keeps good", () => {
    const lookup = new Map([["r-1", "I tried to apologize but she stayed quiet."]]);
    const refl = mkReflection(
      mkObservation("apologize"), // too short — drop
      mkObservation("stayed quiet"), // valid — keep
    );
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(1);
    expect(out.observations[0].evidence[0].quote).toBe("stayed quiet");
  });
});

describe("verifyQuotes counter-evidence", () => {
  it("keeps the observation but drops an unverifiable counter quote", () => {
    const lookup = new Map([["r-1", "I tried to apologize but she stayed quiet."]]);
    // Supporting quote verifies; counter quote does not (not in source).
    const refl = mkReflection(
      mkObservation("stayed quiet", "r-1", [
        { quote: "I held my ground calmly", sourceId: "r-1" },
      ]),
    );
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(1);
    expect(out.observations[0].counter_evidence).toHaveLength(0);
  });

  it("keeps a verifiable counter quote", () => {
    const lookup = new Map([
      ["r-1", "I tried to apologize but she stayed quiet."],
      ["r-2", "This time I held my ground calmly and said my piece."],
    ]);
    const refl = mkReflection(
      mkObservation("stayed quiet", "r-1", [
        { quote: "held my ground calmly", sourceId: "r-2" },
      ]),
    );
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(1);
    expect(out.observations[0].counter_evidence).toHaveLength(1);
  });

  it("drops the whole observation when a SUPPORTING quote fails, regardless of counters", () => {
    const lookup = new Map([["r-1", "Some unrelated user text here."]]);
    const refl = mkReflection(
      mkObservation("I slammed the door", "r-1", [
        { quote: "unrelated user text", sourceId: "r-1" },
      ]),
    );
    const out = verifyQuotes(refl, lookup);
    expect(out.observations).toHaveLength(0);
  });
});

describe("deriveConfidence (net distinct-entry read)", () => {
  function mkObs(
    supportIds: string[],
    counterIds: string[] = [],
  ): ReflectionObservation {
    return {
      theme: "t",
      observation: "o",
      evidence: supportIds.map((id, i) => mkEvidence(`support quote ${i}`, id)),
      counter_evidence: counterIds.map((id, i) =>
        mkEvidence(`counter quote ${i}`, id),
      ),
      confidence: "early",
    };
  }

  it("1 supporting entry → early", () => {
    expect(deriveConfidence(mkObs(["r-1"]))).toBe("early");
  });

  it("2 distinct supporting entries → emerging", () => {
    expect(deriveConfidence(mkObs(["r-1", "r-2"]))).toBe("emerging");
  });

  it("3 distinct supporting entries → clear", () => {
    expect(deriveConfidence(mkObs(["r-1", "r-2", "r-3"]))).toBe("clear");
  });

  it("counts DISTINCT entries — two quotes from one entry stay early", () => {
    expect(deriveConfidence(mkObs(["r-1", "r-1"]))).toBe("early");
  });

  it("3 supporting − 1 contradicting entry → emerging (net 2)", () => {
    expect(deriveConfidence(mkObs(["r-1", "r-2", "r-3"], ["r-4"]))).toBe(
      "emerging",
    );
  });

  it("3 supporting − 2 contradicting entries → early (net 1)", () => {
    expect(deriveConfidence(mkObs(["r-1", "r-2", "r-3"], ["r-4", "r-5"]))).toBe(
      "early",
    );
  });

  it("never returns below early even when contradictions exceed support", () => {
    expect(deriveConfidence(mkObs(["r-1"], ["r-2", "r-3"]))).toBe("early");
  });
});
