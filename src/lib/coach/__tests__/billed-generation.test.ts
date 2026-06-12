import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  BilledGenerationArgs,
  CoinPrimitives,
  GenerationResult,
} from "../billed-generation";

// runBilledGeneration owns the Coach money path (reserve → generate → refund →
// net spend). It's fully injectable — the coin primitives and the generate /
// persist closures are all parameters — so every billing branch is driven with
// vi.fn() and no live DB. The only hard dependency is Sentry (the AI-failure
// capture), which we stub to assert it fires.
const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
}));

import { runBilledGeneration } from "../billed-generation";

type Out = { ok: true };

function makeCoins(over: Partial<CoinPrimitives> = {}): CoinPrimitives {
  return {
    nextGenerationAttempt: vi.fn().mockResolvedValue(0),
    spendCoins: vi.fn().mockResolvedValue("ok"),
    refundCoins: vi.fn().mockResolvedValue("ok"),
    getBalance: vi.fn().mockResolvedValue(0),
    ...over,
  };
}

function genSuccess(): () => Promise<GenerationResult<Out>> {
  return vi.fn().mockResolvedValue({
    aiOutput: { ok: true },
    failureKind: "none",
    lastErr: null,
    attempts: 1,
    latencyMs: 5,
  });
}

function genFail(): () => Promise<GenerationResult<Out>> {
  return vi.fn().mockResolvedValue({
    aiOutput: null,
    failureKind: "schema_mismatch",
    lastErr: new Error("schema mismatch"),
    attempts: 2,
    latencyMs: 5,
  });
}

function baseArgs(
  over: Partial<BilledGenerationArgs<Out>> = {},
): BilledGenerationArgs<Out> {
  return {
    userId: "u1",
    module: "prepare",
    adminUser: false,
    idempotencyKey: "idem-1",
    tier: "quick",
    coinCost: 4,
    coins: makeCoins(),
    generate: genSuccess(),
    persist: vi.fn().mockResolvedValue({ error: false }),
    ...over,
  };
}

beforeEach(() => {
  sentryMock.captureException.mockReset();
});

describe("runBilledGeneration — Coach coin charge", () => {
  it("admin bypasses the debit entirely (no reserve, no refund, coinsSpent 0)", async () => {
    const coins = makeCoins();
    const persist = vi.fn().mockResolvedValue({ error: false });
    const out = await runBilledGeneration(
      baseArgs({ adminUser: true, coins, persist }),
    );

    expect(coins.nextGenerationAttempt).not.toHaveBeenCalled();
    expect(coins.spendCoins).not.toHaveBeenCalled();
    expect(coins.refundCoins).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: "complete", coinsSpent: 0, saveWarning: false });
  });

  it("returns insufficient WITHOUT generating when the balance is short", async () => {
    const coins = makeCoins({
      spendCoins: vi.fn().mockResolvedValue("insufficient"),
      getBalance: vi.fn().mockResolvedValue(2),
    });
    const generate = genSuccess();
    const out = await runBilledGeneration(baseArgs({ coins, generate }));

    expect(out).toEqual({ kind: "insufficient", balance: 2 });
    expect(generate).not.toHaveBeenCalled();
    expect(coins.refundCoins).not.toHaveBeenCalled();
  });

  it("returns spend_error (no generation, no refund) when the spend RPC fails", async () => {
    const coins = makeCoins({ spendCoins: vi.fn().mockResolvedValue("invalid") });
    const generate = genSuccess();
    const out = await runBilledGeneration(baseArgs({ coins, generate }));

    expect(out).toEqual({ kind: "spend_error" });
    expect(generate).not.toHaveBeenCalled();
    expect(coins.refundCoins).not.toHaveBeenCalled();
  });

  it("charges the per-attempt key and keeps the charge on a clean success", async () => {
    const coins = makeCoins();
    const out = await runBilledGeneration(baseArgs({ coins }));

    expect(coins.spendCoins).toHaveBeenCalledWith(
      "u1",
      4,
      "debit_quick",
      "idem-1:gen:0",
    );
    expect(coins.refundCoins).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: "complete", coinsSpent: 4, saveWarning: false });
  });

  it("uses debit_deep + the deep cost for the deep tier", async () => {
    const coins = makeCoins();
    await runBilledGeneration(baseArgs({ coins, tier: "deep", coinCost: 6 }));

    expect(coins.spendCoins).toHaveBeenCalledWith(
      "u1",
      6,
      "debit_deep",
      "idem-1:gen:0",
    );
  });

  it("keys the spend on the attempt index from nextGenerationAttempt", async () => {
    const coins = makeCoins({
      nextGenerationAttempt: vi.fn().mockResolvedValue(2),
    });
    await runBilledGeneration(baseArgs({ coins }));

    expect(coins.spendCoins).toHaveBeenCalledWith(
      "u1",
      4,
      "debit_quick",
      "idem-1:gen:2",
    );
  });

  it("refunds + captures + nets coinsSpent 0 when a FRESH charge fails to generate", async () => {
    const coins = makeCoins();
    const persist = vi.fn();
    const out = await runBilledGeneration(
      baseArgs({ coins, generate: genFail(), persist }),
    );

    expect(coins.refundCoins).toHaveBeenCalledWith("u1", 4, "idem-1:gen:0");
    expect(coins.refundCoins).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: "complete", aiOutput: null, coinsSpent: 0 });
  });

  it("does NOT refund an 'already_applied' spend when generation fails (a prior attempt paid)", async () => {
    // Regression guard mirroring run-module.ts's `coinsCharged = spend === "ok"`
    // and the Insights twin: refunding here would reverse the paying request's
    // charge (free generation).
    const coins = makeCoins({
      spendCoins: vi.fn().mockResolvedValue("already_applied"),
    });
    const out = await runBilledGeneration(
      baseArgs({ coins, generate: genFail() }),
    );

    expect(coins.refundCoins).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: "complete", coinsSpent: 0 });
  });

  it("refunds + sets saveWarning + nets 0 when persistence fails after a fresh charge", async () => {
    const coins = makeCoins();
    const persist = vi.fn().mockResolvedValue({ error: true });
    const out = await runBilledGeneration(baseArgs({ coins, persist }));

    expect(coins.refundCoins).toHaveBeenCalledWith("u1", 4, "idem-1:gen:0");
    expect(coins.refundCoins).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({
      kind: "complete",
      saveWarning: true,
      coinsSpent: 0,
    });
  });

  it("nets coinsSpent 0 on an 'already_applied' SUCCESS (this request didn't pay)", async () => {
    const coins = makeCoins({
      spendCoins: vi.fn().mockResolvedValue("already_applied"),
    });
    const persist = vi.fn().mockResolvedValue({ error: false });
    const out = await runBilledGeneration(baseArgs({ coins, persist }));

    expect(coins.refundCoins).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: "complete", coinsSpent: 0, saveWarning: false });
  });

  it("propagates generation telemetry (attempts, latency, failureKind) into the outcome", async () => {
    const out = await runBilledGeneration(baseArgs({ generate: genFail() }));
    expect(out).toMatchObject({
      kind: "complete",
      failureKind: "schema_mismatch",
      attempts: 2,
      latencyMs: 5,
    });
  });

  it("refunds a fresh charge and propagates when persist THROWS (not resolves {error:true})", async () => {
    // The thrown-error backstop: a derived-write that throws (instead of
    // resolving { error: true }) must not strand the charge. Mirrors the
    // Insights outer catch (generate.ts).
    const coins = makeCoins();
    const persist = vi.fn().mockRejectedValue(new Error("derived write blew up"));

    await expect(
      runBilledGeneration(baseArgs({ coins, persist })),
    ).rejects.toThrow("derived write blew up");
    expect(coins.refundCoins).toHaveBeenCalledWith("u1", 4, "idem-1:gen:0");
    expect(coins.refundCoins).toHaveBeenCalledTimes(1);
  });

  it("refunds a fresh charge and propagates when generate THROWS", async () => {
    // run-module's generate closure catches its own AI errors today, but the
    // backstop must hold if a future closure throws from outside its loop.
    const coins = makeCoins();
    const generate = vi.fn().mockRejectedValue(new Error("closure escaped"));
    const persist = vi.fn();

    await expect(
      runBilledGeneration(baseArgs({ coins, generate, persist })),
    ).rejects.toThrow("closure escaped");
    expect(coins.refundCoins).toHaveBeenCalledWith("u1", 4, "idem-1:gen:0");
    expect(coins.refundCoins).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("does NOT refund an 'already_applied' charge when persist throws (not ours to reverse)", async () => {
    const coins = makeCoins({
      spendCoins: vi.fn().mockResolvedValue("already_applied"),
    });
    const persist = vi.fn().mockRejectedValue(new Error("derived write blew up"));

    await expect(
      runBilledGeneration(baseArgs({ coins, persist })),
    ).rejects.toThrow("derived write blew up");
    expect(coins.refundCoins).not.toHaveBeenCalled();
  });
});
