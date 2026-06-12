// makeGenerationCoinCallbacks — the shared reserve/refund callback pair both
// Insights routes (weekly + monthly report) inject into their generators.
// The atomic ledger logic lives in Postgres; here we pin the GLUE: attempt
// indexing, fresh-vs-already_applied mapping, fail-closed on RPC error, and
// that the refund targets the exact key the debit used.

import { describe, it, expect, vi, beforeEach } from "vitest";

const serviceMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => serviceMock,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { makeGenerationCoinCallbacks } from "@/lib/coins";

// Thenable chain stub: every builder method returns the same object, and
// awaiting it resolves `result` (PostgREST builders are thenables).
function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "like", "maybeSingle"]) {
    q[m] = () => q;
  }
  (q as { then: (res: (v: unknown) => void) => void }).then = (res) =>
    res(result);
  return q;
}

function stubTables(tables: Record<string, unknown>) {
  serviceMock.from.mockImplementation((table: string) =>
    makeQuery(tables[table] ?? { data: null, error: null }),
  );
}

beforeEach(() => {
  serviceMock.rpc.mockReset();
  serviceMock.from.mockReset();
  // Default: no prior refunds (attempt 0), no wallet row.
  stubTables({
    coin_transactions: { data: [], error: null },
    coin_balances: { data: { balance: 0 }, error: null },
  });
});

describe("makeGenerationCoinCallbacks", () => {
  it("charges fresh on 'ok' and refunds the SAME per-attempt key on failure", async () => {
    serviceMock.rpc.mockResolvedValue({ data: "ok", error: null });
    const cb = makeGenerationCoinCallbacks("u1", 80, "debit_monthly_report", "base");

    const reserve = await cb.reserveCoins();
    expect(reserve).toEqual({ result: "charged", fresh: true });
    expect(serviceMock.rpc).toHaveBeenCalledWith("spend_coins", {
      p_user_id: "u1",
      p_amount: 80,
      p_reason: "debit_monthly_report",
      p_ref_key: "base:gen:0",
    });

    await cb.onChargedGenerationFailed();
    expect(serviceMock.rpc).toHaveBeenLastCalledWith("grant_coins", {
      p_user_id: "u1",
      p_amount: 80,
      p_reason: "refund",
      p_ref_key: "base:gen:0:refund",
    });
  });

  it("maps 'already_applied' to fresh:false (the concurrent winner keeps its charge)", async () => {
    serviceMock.rpc.mockResolvedValue({ data: "already_applied", error: null });
    const cb = makeGenerationCoinCallbacks("u1", 20, "debit_weekly_insights", "base");
    expect(await cb.reserveCoins()).toEqual({ result: "charged", fresh: false });
  });

  it("returns the live balance on 'insufficient' without throwing", async () => {
    serviceMock.rpc.mockResolvedValue({ data: "insufficient", error: null });
    stubTables({
      coin_transactions: { data: [], error: null },
      coin_balances: { data: { balance: 12 }, error: null },
    });
    const cb = makeGenerationCoinCallbacks("u1", 80, "debit_monthly_report", "base");
    expect(await cb.reserveCoins()).toEqual({
      result: "insufficient",
      balance: 12,
      needed: 80,
    });
  });

  it("fails closed to 'error' when the spend RPC errors", async () => {
    serviceMock.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    const cb = makeGenerationCoinCallbacks("u1", 80, "debit_monthly_report", "base");
    expect(await cb.reserveCoins()).toEqual({ result: "error" });
  });

  it("refund is a no-op before any reserve (no spend key yet)", async () => {
    const cb = makeGenerationCoinCallbacks("u1", 80, "debit_monthly_report", "base");
    await cb.onChargedGenerationFailed();
    expect(serviceMock.rpc).not.toHaveBeenCalled();
  });

  it("advances the attempt index from prior refund rows (retry-leak fix)", async () => {
    serviceMock.rpc.mockResolvedValue({ data: "ok", error: null });
    stubTables({
      // Two prior refunds → this attempt is :gen:2.
      coin_transactions: { data: [{ transaction_id: "a" }, { transaction_id: "b" }], error: null },
      coin_balances: { data: { balance: 100 }, error: null },
    });
    const cb = makeGenerationCoinCallbacks("u1", 20, "debit_weekly_insights", "base");
    await cb.reserveCoins();
    expect(serviceMock.rpc).toHaveBeenCalledWith(
      "spend_coins",
      expect.objectContaining({ p_ref_key: "base:gen:2" }),
    );
  });
});
