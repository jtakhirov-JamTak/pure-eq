// Pure EQ domain — coins wallet helpers (Slice B, migration 0043).
//
// Thin, server-only wrappers over the atomic Postgres functions spend_coins /
// grant_coins. ALL coin writes go through these (and thus through the service-
// role client) — coin_balances has no client-writable RLS policy, and the RPCs
// are execute-revoked from anon/authenticated, so a compromised client cannot
// move coins. NEVER import this in a client component or middleware.
//
// Charge model (founder-final): reserve at start, finalize on success, refund
// on app failure. spendCoins is the reserve (debit, keyed by idempotencyKey);
// refundCoins is the compensating credit when generation fails before output is
// saved. "Disliked output" is post-save → no refund. Idempotency lives in the
// DB: re-calling with the same ref_key is a no-op, so retries never double-move.

import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "@/lib/supabase/service";
import {
  COIN_COSTS,
  SIGNUP_GRANT_COINS,
  SIGNUP_GRANT_REF_KEY,
  type AiTier,
  type CoinGrantResult,
  type CoinSpendResult,
  type CoinTxnReason,
} from "@/types";

/** Coin cost for an AI tier (quick = 4, deep = 6). */
export function costForTier(tier: AiTier): number {
  return COIN_COSTS[tier];
}

/**
 * Current balance for a user. Returns 0 when no wallet row exists yet (a user
 * who hasn't been granted any coins). Fails CLOSED to 0 on a DB error — callers
 * gate access on balance, and 0 simply shows "needs coins" rather than granting
 * a free generation during an outage.
 */
export async function getBalance(userId: string): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("coin_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("coins: getBalance failed", error.code);
    Sentry.captureException(error, {
      tags: { area: "coins", kind: "get_balance_failed" },
    });
    return 0;
  }
  return data?.balance ?? 0;
}

/**
 * Atomically debit coins (the reserve step). Returns the RPC result:
 *   'ok'              — debited
 *   'insufficient'    — balance too low; nothing debited
 *   'already_applied' — this ref_key already produced a txn (retry/no-op)
 *   'invalid'         — non-positive amount
 * Fails CLOSED to 'invalid' on an unexpected RPC error so a DB hiccup never
 * grants a free generation.
 */
export async function spendCoins(
  userId: string,
  amount: number,
  reason: CoinTxnReason,
  refKey: string,
): Promise<CoinSpendResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("spend_coins", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref_key: refKey,
  });
  if (error) {
    console.error("coins: spend_coins rpc failed", error.code);
    Sentry.captureException(error, {
      tags: { area: "coins", kind: "spend_failed" },
    });
    return "invalid";
  }
  return (data as CoinSpendResult) ?? "invalid";
}

/**
 * Atomically credit coins (signup grant, purchase, refund, admin adjust).
 * Returns 'ok' | 'already_applied' | 'invalid'. Idempotent on ref_key.
 */
export async function grantCoins(
  userId: string,
  amount: number,
  reason: CoinTxnReason,
  refKey: string | null,
): Promise<CoinGrantResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("grant_coins", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref_key: refKey,
  });
  if (error) {
    console.error("coins: grant_coins rpc failed", error.code);
    Sentry.captureException(error, {
      tags: { area: "coins", kind: "grant_failed" },
    });
    return "invalid";
  }
  return (data as CoinGrantResult) ?? "invalid";
}

/**
 * Compensating refund when a paid generation fails before its output is saved
 * (reserve → release). Keyed off the original idempotencyKey + ':refund' so the
 * refund itself is idempotent and never collides with the original debit row.
 */
export async function refundCoins(
  userId: string,
  amount: number,
  idempotencyKey: string,
): Promise<CoinGrantResult> {
  return grantCoins(userId, amount, "refund", `${idempotencyKey}:refund`);
}

/**
 * Grant the one-time 50-coin signup bonus. Idempotent on the fixed
 * SIGNUP_GRANT_REF_KEY — a retake of onboarding, a strict-mode double-fire, or
 * a retry all collapse to a single grant per user. Safe to call on every
 * onboarding completion.
 */
export async function grantSignupCoins(
  userId: string,
): Promise<CoinGrantResult> {
  return grantCoins(
    userId,
    SIGNUP_GRANT_COINS,
    "signup_grant",
    SIGNUP_GRANT_REF_KEY,
  );
}
