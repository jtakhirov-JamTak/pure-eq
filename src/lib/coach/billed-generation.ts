// Coin-charge orchestration for a Coach AI generation, extracted from
// run-module.ts so the money-sensitive branches are unit-testable in isolation
// (the route around it — origin/auth/validation/person/thread/raw+derived insert
// — is not). This is the Coach half of the dual-shape charge policy; the Insights
// half (generate.ts) uses caller-supplied callbacks. Both reserve-at-start and
// refund on AI failure, derived-write failure, AND a downgrade — keep them
// symmetric (memory: project_coin_charge_dual_shape). A finalize-on-success
// change must touch BOTH.
//
// The AI call (with its retry loop) and the derived-row write stay in the caller
// as the `generate` and `persist` closures — they need the per-module config +
// the request-scoped Supabase client. This function owns ONLY the billing
// decisions: when to reserve, when to refund, and the net coins spent.

import * as Sentry from "@sentry/nextjs";
import { generationSpendKey } from "@/lib/coins";
import type {
  AiTier,
  CoinGrantResult,
  CoinSpendResult,
  CoinTxnReason,
} from "@/types";

/**
 * The coin primitives, injectable so a test can drive every branch with vi.fn()
 * without a live DB. Shapes match the real exports in src/lib/coins.ts.
 */
export interface CoinPrimitives {
  nextGenerationAttempt: (userId: string, idempotencyKey: string) => Promise<number>;
  spendCoins: (
    userId: string,
    amount: number,
    reason: CoinTxnReason,
    refKey: string,
  ) => Promise<CoinSpendResult>;
  refundCoins: (
    userId: string,
    amount: number,
    spendKey: string,
  ) => Promise<CoinGrantResult>;
  getBalance: (userId: string) => Promise<number>;
}

/** What the caller's AI-call closure returns. */
export interface GenerationResult<TAiOutput> {
  /** Validated AI output, or null if every attempt failed. */
  aiOutput: TAiOutput | null;
  /** Failure classification for the Sentry tag ("none" on success). */
  failureKind: string;
  /** The last error thrown (captured to Sentry on total failure). */
  lastErr: unknown;
  /** How many attempts ran (1 = first-try success). */
  attempts: number;
  /** Wall-clock latency of the AI call(s), ms. */
  latencyMs: number;
}

export interface BilledGenerationArgs<TAiOutput> {
  userId: string;
  /** Module name — used in the AI-failure Sentry tag. */
  module: string;
  /** Admins bypass the debit entirely (no reserve, no refund, coinsSpent = 0). */
  adminUser: boolean;
  idempotencyKey: string;
  tier: AiTier;
  coinCost: number;
  coins: CoinPrimitives;
  /** Run the AI call (retry loop lives here). */
  generate: () => Promise<GenerationResult<TAiOutput>>;
  /** Persist the AI output to the derived row. Resolve { error: true } on a DB failure. */
  persist: (aiOutput: TAiOutput) => Promise<{ error: boolean }>;
}

export type BilledOutcome<TAiOutput> =
  /** Balance too low — nothing charged, generation not attempted. */
  | { kind: "insufficient"; balance: number }
  /** Unexpected spend RPC error — fail closed, generation not attempted. */
  | { kind: "spend_error" }
  /** Generation ran (success OR AI failure); billing reconciled. */
  | {
      kind: "complete";
      aiOutput: TAiOutput | null;
      /** Net coins spent: coinCost only when charged AND output persisted; 0 otherwise. */
      coinsSpent: number;
      /** Derived-write failed after a successful generation (output not saved). */
      saveWarning: boolean;
      failureKind: string;
      attempts: number;
      latencyMs: number;
    };

/**
 * Reserve → generate → (refund on AI failure) → persist → (refund on persist
 * failure) → net spend. Returns a billing OUTCOME; the caller maps it to HTTP.
 *
 * Refund invariants (kept symmetric with Insights generate.ts):
 *   - Only a FRESH charge (spend === "ok") is refundable. An 'already_applied'
 *     spend means a prior attempt under this per-attempt key paid — refunding
 *     would reverse THAT request's charge (free generation).
 *   - Refunds are idempotent on the per-attempt spendKey, so a repeat failure
 *     on the same key never stacks credits.
 */
export async function runBilledGeneration<TAiOutput>(
  args: BilledGenerationArgs<TAiOutput>,
): Promise<BilledOutcome<TAiOutput>> {
  const { userId, module, adminUser, idempotencyKey, tier, coinCost, coins } =
    args;

  // Reserve (admins bypass).
  let coinsCharged = false;
  let spendKey: string | null = null;
  if (!adminUser) {
    const attempt = await coins.nextGenerationAttempt(userId, idempotencyKey);
    spendKey = generationSpendKey(idempotencyKey, attempt);
    const reason: CoinTxnReason = tier === "deep" ? "debit_deep" : "debit_quick";
    const spend = await coins.spendCoins(userId, coinCost, reason, spendKey);
    if (spend === "insufficient") {
      const balance = await coins.getBalance(userId);
      return { kind: "insufficient", balance };
    }
    if (spend === "invalid") {
      // Unexpected RPC failure (already logged + captured in spendCoins). The
      // entry is saved; don't run a generation we couldn't charge for.
      return { kind: "spend_error" };
    }
    // 'ok' = freshly charged this request → refundable on failure below.
    // 'already_applied' = a prior attempt charged under this key; proceed
    // without a second charge and DON'T refund (that charge belongs to it).
    coinsCharged = spend === "ok";
  }

  // Generate → persist, with a refund backstop on a THROWN error. The resolved
  // failure paths below (aiOutput null, persist {error:true}) refund explicitly;
  // the catch covers the window where `generate` or `persist` THROWS instead of
  // resolving — without it a fresh charge would be stranded with no refund row.
  // Mirrors the outer catch in the Insights twin (generate.ts) — keep them
  // symmetric. Safe against double-refund: refunds are idempotent on the
  // per-attempt `:refund` key.
  try {
    const gen = await args.generate();
    const aiOutput = gen.aiOutput;

    if (!aiOutput) {
      Sentry.captureException(gen.lastErr, {
        tags: { area: "coach", module, kind: gen.failureKind },
      });
      // Release the reservation — generation failed before any output was saved.
      if (coinsCharged && spendKey) {
        await coins.refundCoins(userId, coinCost, spendKey);
      }
    }

    // Persist the output to the derived row.
    let saveWarning = false;
    if (aiOutput) {
      const res = await args.persist(aiOutput);
      if (res.error) {
        saveWarning = true;
        // Output generated but not saved to history — treat as a failure for
        // billing: release the hold, symmetric with the AI-failure refund above
        // and the Insights insert-failure path. Clearing coinsCharged nets
        // coinsSpent to 0 for this stranded run; a retry regenerates + charges.
        if (coinsCharged && spendKey) {
          await coins.refundCoins(userId, coinCost, spendKey);
          coinsCharged = false;
        }
      }
    }

    return {
      kind: "complete",
      aiOutput,
      coinsSpent: aiOutput && coinsCharged ? coinCost : 0,
      saveWarning,
      failureKind: gen.failureKind,
      attempts: gen.attempts,
      latencyMs: gen.latencyMs,
    };
  } catch (err) {
    // Only a FRESH charge is refundable here — same invariant as the resolved
    // paths: reversing an 'already_applied' spend would refund the request
    // that actually paid.
    if (coinsCharged && spendKey) {
      await coins.refundCoins(userId, coinCost, spendKey);
    }
    throw err;
  }
}
