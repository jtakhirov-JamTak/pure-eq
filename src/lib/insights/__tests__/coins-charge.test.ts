import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Slice B3 money path. generateReflection takes its supabase client as a
// parameter and its coin reserve/refund as caller-supplied callbacks, so we
// can drive every charge branch with a hand-rolled fake + vi.fn callbacks. The
// ONLY hard dependency to stub is the Anthropic SDK (instantiated internally).
const anthropicMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicMock.create };
  },
}));

import { generateReflection, ReflectionGenerationError } from "../generate";

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";

// A reflection whose quotes substring-match the entry below (multi-word,
// ≥ MIN_QUOTE_CHARS) so verifyQuotes keeps both observations → "created".
function validReflectionJson() {
  return {
    mode: "reflection",
    summary: "A pattern across the last few weeks.",
    observations: [
      {
        theme: "Conflict avoidance",
        observation: "You tend to circle the same disagreement.",
        evidence: [
          {
            quote: "argued about the dishes",
            source_record_id: ENTRY_ID,
            source_date: "2026-05-20",
          },
        ],
        confidence: "tentative",
      },
      {
        theme: "Repair attempts",
        observation: "You reach back out after a pause.",
        evidence: [
          {
            quote: "tried to make it right",
            source_record_id: ENTRY_ID,
            source_date: "2026-05-21",
          },
        ],
        confidence: "tentative",
      },
    ],
  };
}

// A valid stored refusal — used for the cache-hit row (must pass the reader's
// reflectionOutputSchema.safeParse).
function refusalRow() {
  return {
    generated_at: "2026-05-29T00:00:00.000Z",
    generator_version: "reflection_v3",
    ai_json: {
      mode: "refusal",
      refusal_reason: "out_of_scope",
      message_to_user: "Not enough grounded patterns yet — come back next week.",
      suggested_resource: "none",
    },
  };
}

interface FakeConfig {
  cached?: { data: unknown; error: unknown };
  profile?: { data: unknown; error: unknown };
  entries?: { data: unknown; error: unknown };
  insert?: { data: unknown; error: unknown };
  /**
   * Drives the entry-count gate (countReflectionEligibleEntries). The count
   * query and the windowed entries read both hit raw_records in this fake, so
   * the result object carries both `.count` (gate) and `.data` (entries).
   * Defaults to 5 — at/above MIN_ENTRIES_FOR_REFLECTION — so the coin-path
   * tests below clear the gate without each having to set it.
   */
  entryCount?: number;
}

// Minimal chainable Supabase fake. Each `.from(table)` returns a fresh closure
// that captures its own table (so the parallel Promise.all reads don't clobber
// a shared `table` var). Terminal resolution:
//   .maybeSingle() → user_profiles ? profile : cached (weekly_reflections read)
//   .single()      → insert result (weekly_reflections insert)
//   await chain    → list result keyed by table (persons / raw_records / …)
function makeFakeSupabase(cfg: FakeConfig): SupabaseClient<Database> {
  const lists: Record<string, { data?: unknown; error: unknown; count?: number }> = {
    persons: { data: [], error: null },
    // `count` clears (or, when entryCount < 5, triggers) the entry-count gate;
    // `data` feeds the windowed entries read. Same object serves both queries.
    raw_records: { count: cfg.entryCount ?? 5, ...(cfg.entries ?? { data: [], error: null }) },
    before_you_send_entries: { data: [], error: null },
    review_entries: { data: [], error: null },
  };
  function chain(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      insert: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      not: () => b,
      gte: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () =>
        Promise.resolve(
          table === "user_profiles"
            ? (cfg.profile ?? { data: null, error: null })
            : (cfg.cached ?? { data: null, error: null }),
        ),
      single: () => Promise.resolve(cfg.insert ?? { data: null, error: null }),
      then: (
        res: (v: unknown) => unknown,
        rej: (e: unknown) => unknown,
      ) =>
        Promise.resolve(lists[table] ?? { data: [], error: null }).then(res, rej),
    };
    return b;
  }
  return { from: (t: string) => chain(t) } as unknown as SupabaseClient<Database>;
}

const PROFILE_OK = { data: { primary_profile: "reflective" }, error: null };
const ENTRIES_OK = {
  data: [
    {
      raw_record_id: ENTRY_ID,
      record_type: "review",
      created_at: "2026-05-20T00:00:00.000Z",
      person_id: null,
      payload_json: {
        fields: {
          whatHappened: "We argued about the dishes again, then I tried to make it right.",
        },
      },
    },
  ],
  error: null,
};
const INSERT_OK = {
  data: { generated_at: "2026-05-30T00:00:00.000Z" },
  error: null,
};

function anthropicReturns(json: unknown) {
  anthropicMock.create.mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(json) }],
  });
}

beforeEach(() => {
  anthropicMock.create.mockReset();
});

describe("generateReflection — coin charge (Slice B3)", () => {
  it("returns insufficient_coins WITHOUT calling the LLM when the reserve is short", async () => {
    const reserveCoins = vi.fn().mockResolvedValue({
      result: "insufficient",
      balance: 7,
      needed: 20,
    });
    const onChargedGenerationFailed = vi.fn();

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: ENTRIES_OK,
    });

    const out = await generateReflection(supabase, "user-1", {
      reserveCoins,
      onChargedGenerationFailed,
    });

    expect(out.status).toBe("insufficient_coins");
    if (out.status === "insufficient_coins") {
      expect(out.balance).toBe(7);
      expect(out.needed).toBe(20);
    }
    expect(anthropicMock.create).not.toHaveBeenCalled();
    expect(onChargedGenerationFailed).not.toHaveBeenCalled();
  });

  it("NEVER reserves coins on a cache hit (free re-visit inside the window)", async () => {
    const reserveCoins = vi.fn();
    const supabase = makeFakeSupabase({
      cached: { data: refusalRow(), error: null },
    });

    const out = await generateReflection(supabase, "user-1", { reserveCoins });

    expect(out.status).toBe("cached");
    expect(reserveCoins).not.toHaveBeenCalled();
    expect(anthropicMock.create).not.toHaveBeenCalled();
  });

  it("refunds (onChargedGenerationFailed) when the result downgrades to a refusal", async () => {
    // No entries → quotes can't verify → < 2 observations survive → refusal.
    anthropicReturns(validReflectionJson());
    const reserveCoins = vi.fn().mockResolvedValue({ result: "charged", fresh: true });
    const onChargedGenerationFailed = vi.fn().mockResolvedValue(undefined);

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: { data: [], error: null },
      insert: INSERT_OK,
    });

    const out = await generateReflection(supabase, "user-1", {
      reserveCoins,
      onChargedGenerationFailed,
    });

    expect(out.status).toBe("created");
    if (out.status === "created") {
      expect((out.row.ai_json as { mode: string }).mode).toBe("refusal");
    }
    expect(onChargedGenerationFailed).toHaveBeenCalledTimes(1);
  });

  it("does NOT refund when a charged generation succeeds with a real reflection", async () => {
    anthropicReturns(validReflectionJson());
    const reserveCoins = vi.fn().mockResolvedValue({ result: "charged", fresh: true });
    const onChargedGenerationFailed = vi.fn();

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: ENTRIES_OK,
      insert: INSERT_OK,
    });

    const out = await generateReflection(supabase, "user-1", {
      reserveCoins,
      onChargedGenerationFailed,
    });

    expect(out.status).toBe("created");
    if (out.status === "created") {
      expect((out.row.ai_json as { mode: string }).mode).toBe("reflection");
    }
    expect(onChargedGenerationFailed).not.toHaveBeenCalled();
  });

  it("refunds and propagates when a charged generation throws (AI error)", async () => {
    anthropicMock.create.mockRejectedValue(new Error("anthropic 500"));
    const reserveCoins = vi.fn().mockResolvedValue({ result: "charged", fresh: true });
    const onChargedGenerationFailed = vi.fn().mockResolvedValue(undefined);

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: ENTRIES_OK,
      insert: INSERT_OK,
    });

    await expect(
      generateReflection(supabase, "user-1", {
        reserveCoins,
        onChargedGenerationFailed,
      }),
    ).rejects.toBeInstanceOf(ReflectionGenerationError);

    expect(onChargedGenerationFailed).toHaveBeenCalledTimes(1);
  });

  it("does NOT refund a concurrent 'already_applied' spend (fresh:false) when generation throws", async () => {
    // Regression guard: an 'already_applied' reserve means another request
    // under the same per-attempt key actually paid. If THIS request's
    // generation fails, refunding would reverse the paying request's charge
    // (free generation). fresh:false must suppress the refund — mirrors
    // run-module.ts's `coinsCharged = spend === "ok"`.
    anthropicMock.create.mockRejectedValue(new Error("anthropic 500"));
    const reserveCoins = vi
      .fn()
      .mockResolvedValue({ result: "charged", fresh: false });
    const onChargedGenerationFailed = vi.fn().mockResolvedValue(undefined);

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: ENTRIES_OK,
      insert: INSERT_OK,
    });

    await expect(
      generateReflection(supabase, "user-1", {
        reserveCoins,
        onChargedGenerationFailed,
      }),
    ).rejects.toBeInstanceOf(ReflectionGenerationError);

    expect(onChargedGenerationFailed).not.toHaveBeenCalled();
  });

  it("returns insufficient_entries WITHOUT reserving coins or calling the LLM when below the gate", async () => {
    // Entry-count gate: fewer than MIN_ENTRIES_FOR_REFLECTION reflective-module
    // entries → no profile read, no coin reserve, no LLM. The gate runs after
    // the cache miss and before any charge, so a below-bar user is never billed.
    const reserveCoins = vi.fn();
    const onChargedGenerationFailed = vi.fn();

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: ENTRIES_OK,
      entryCount: 3,
    });

    const out = await generateReflection(supabase, "user-1", {
      reserveCoins,
      onChargedGenerationFailed,
    });

    expect(out.status).toBe("insufficient_entries");
    if (out.status === "insufficient_entries") {
      expect(out.count).toBe(3);
      expect(out.needed).toBe(5);
    }
    expect(reserveCoins).not.toHaveBeenCalled();
    expect(anthropicMock.create).not.toHaveBeenCalled();
  });

  it("throws coin_charge_failed (no LLM) when the reserve errors", async () => {
    const reserveCoins = vi.fn().mockResolvedValue({ result: "error" });
    const onChargedGenerationFailed = vi.fn();

    const supabase = makeFakeSupabase({
      cached: { data: null, error: null },
      profile: PROFILE_OK,
      entries: ENTRIES_OK,
    });

    await expect(
      generateReflection(supabase, "user-1", {
        reserveCoins,
        onChargedGenerationFailed,
      }),
    ).rejects.toMatchObject({ kind: "coin_charge_failed" });

    expect(anthropicMock.create).not.toHaveBeenCalled();
    // 'error' means nothing was debited (spend returned invalid), so no refund.
    expect(onChargedGenerationFailed).not.toHaveBeenCalled();
  });
});
