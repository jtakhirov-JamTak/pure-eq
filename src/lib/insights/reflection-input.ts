// Pure function: build the structured USER INPUT block for the weekly
// reflection prompt. Keeping this separate from the orchestrator (generate.ts)
// so it's deterministic + unit-testable without touching Supabase or the
// Anthropic client.

export interface ReflectionInputRawRecord {
  raw_record_id: string;
  record_type: string;
  created_at: string; // ISO timestamp
  person_id: string | null;
  payload_json: unknown; // { fields: {...}, profile_used: string } typically
}

export interface ReflectionInputPerson {
  person_id: string;
  display_name: string;
  relationship_domain: string;
}

export interface BuiltReflectionInput {
  persons: Array<{ displayName: string; relationshipDomain: string }>;
  entries: Array<{
    raw_record_id: string;
    record_type: string;
    created_at: string;
    person_display_name: string | null;
    fields: Record<string, unknown>;
  }>;
}

// Hard caps so the prompt token budget is deterministic regardless of how
// heavy a user's history is. Cap is enforced before entries are passed to
// the LLM; a user with 500 entries gets the 50 most recent.
const MAX_ENTRIES = 50;
const FIELD_TRUNCATION = 400;

function truncate(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= FIELD_TRUNCATION) return value;
  return value.slice(0, FIELD_TRUNCATION);
}

function normalizeFields(raw: unknown): Record<string, unknown> {
  // raw_records.payload_json is `{ fields: {...}, profile_used: string }` for
  // Coach modules, or `{ fields: {...} }` for Tools writes. Either way, the
  // text the LLM needs is inside `.fields`. Defensive: if the shape drifts,
  // degrade to an empty object rather than throwing.
  if (!raw || typeof raw !== "object") return {};
  const payload = raw as Record<string, unknown>;
  const fields = payload.fields;
  if (!fields || typeof fields !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    out[k] = truncate(v);
  }
  return out;
}

/**
 * Turn raw DB rows into the structured USER INPUT block for the reflection
 * prompt. Entries are already assumed sorted by created_at DESC; caller
 * queries with that order.
 */
export function buildReflectionInput(
  rawRecords: ReflectionInputRawRecord[],
  persons: ReflectionInputPerson[],
): BuiltReflectionInput {
  const personMap = new Map(persons.map((p) => [p.person_id, p]));

  const capped = rawRecords.slice(0, MAX_ENTRIES);

  const entries = capped.map((r) => ({
    raw_record_id: r.raw_record_id,
    record_type: r.record_type,
    created_at: r.created_at,
    person_display_name: r.person_id
      ? personMap.get(r.person_id)?.display_name ?? null
      : null,
    fields: normalizeFields(r.payload_json),
  }));

  return {
    persons: persons.map((p) => ({
      displayName: p.display_name,
      relationshipDomain: p.relationship_domain,
    })),
    entries,
  };
}

export const REFLECTION_INPUT_MAX_ENTRIES = MAX_ENTRIES;
export const REFLECTION_INPUT_FIELD_TRUNCATION = FIELD_TRUNCATION;
