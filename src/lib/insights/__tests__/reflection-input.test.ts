import { describe, it, expect } from "vitest";
import {
  buildReflectionInput,
  REFLECTION_INPUT_MAX_ENTRIES,
  REFLECTION_INPUT_FIELD_TRUNCATION,
} from "../reflection-input";

describe("buildReflectionInput", () => {
  const samplePerson = {
    person_id: "p-1",
    display_name: "Jessie",
    relationship_domain: "romantic",
  };

  const sampleRaw = {
    raw_record_id: "r-1",
    record_type: "review",
    created_at: "2026-04-20T12:00:00Z",
    person_id: "p-1",
    payload_json: {
      fields: {
        whatHappened: "We argued about dinner",
        hardestMomentFeeling: "I went quiet",
      },
      profile_used: "reflective",
    },
  };

  it("passes through valid entries with person name resolved", () => {
    const out = buildReflectionInput([sampleRaw], [samplePerson]);
    expect(out.persons).toEqual([
      { displayName: "Jessie", relationshipDomain: "romantic" },
    ]);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].person_display_name).toBe("Jessie");
    expect(out.entries[0].raw_record_id).toBe("r-1");
    expect(out.entries[0].fields).toEqual({
      whatHappened: "We argued about dinner",
      hardestMomentFeeling: "I went quiet",
    });
  });

  it("sets person_display_name to null when person_id is null", () => {
    const raw = { ...sampleRaw, person_id: null };
    const out = buildReflectionInput([raw], [samplePerson]);
    expect(out.entries[0].person_display_name).toBeNull();
  });

  it("sets person_display_name to null when the person_id is unknown", () => {
    const raw = { ...sampleRaw, person_id: "p-missing" };
    const out = buildReflectionInput([raw], [samplePerson]);
    expect(out.entries[0].person_display_name).toBeNull();
  });

  it(`caps entries at ${REFLECTION_INPUT_MAX_ENTRIES}`, () => {
    const many = Array.from({ length: 75 }, (_, i) => ({
      ...sampleRaw,
      raw_record_id: `r-${i}`,
    }));
    const out = buildReflectionInput(many, [samplePerson]);
    expect(out.entries).toHaveLength(REFLECTION_INPUT_MAX_ENTRIES);
    // Confirms the slice preserves input order (caller feeds DESC-sorted).
    expect(out.entries[0].raw_record_id).toBe("r-0");
    expect(out.entries[49].raw_record_id).toBe("r-49");
  });

  it(`truncates long string fields at ${REFLECTION_INPUT_FIELD_TRUNCATION} chars`, () => {
    const long = "x".repeat(600);
    const raw = {
      ...sampleRaw,
      payload_json: {
        fields: { situation: long, short: "ok" },
      },
    };
    const out = buildReflectionInput([raw], []);
    const fields = out.entries[0].fields;
    expect(typeof fields.situation).toBe("string");
    expect((fields.situation as string).length).toBe(
      REFLECTION_INPUT_FIELD_TRUNCATION,
    );
    expect(fields.short).toBe("ok");
  });

  it("leaves non-string field values untouched (numbers, nulls, booleans)", () => {
    const raw = {
      ...sampleRaw,
      payload_json: {
        fields: {
          emotionIntensity: 7,
          validated: null,
          completed: true,
        },
      },
    };
    const out = buildReflectionInput([raw], []);
    expect(out.entries[0].fields).toEqual({
      emotionIntensity: 7,
      validated: null,
      completed: true,
    });
  });

  it("degrades gracefully when payload_json shape is wrong", () => {
    const cases = [
      { ...sampleRaw, payload_json: null },
      { ...sampleRaw, payload_json: "just a string" },
      { ...sampleRaw, payload_json: { notFields: {} } },
      { ...sampleRaw, payload_json: { fields: "not-an-object" } },
    ];
    for (const raw of cases) {
      const out = buildReflectionInput([raw], []);
      expect(out.entries[0].fields).toEqual({});
    }
  });
});
