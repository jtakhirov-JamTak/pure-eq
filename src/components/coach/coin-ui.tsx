"use client";

// Shared coins UI for the Save-first Coach flow (Slice B Phase 2b).
//
// Every Coach module (Prepare, Review, Pulse Check, Before-You-Send) now uses
// the same two-step shape: save the entry for free, then spend coins to "Get AI
// feedback". The tier selector and the post-save "Get feedback" screen were
// copy-pasted across all four pages; this module is the single source so the
// pricing, copy, and balance-fetch logic can't drift between them.

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { COIN_COSTS } from "@/types";
import type { AiTier } from "@/types";

// Tier metadata for the Quick/Deep selector. The coin counts are derived from
// COIN_COSTS (the founder-final pricing table) so the displayed cost and the
// amount run-module actually debits can never disagree.
export const TIER_META: {
  value: AiTier;
  label: string;
  cards: string;
  coins: string;
}[] = [
  { value: "quick", label: "Quick", cards: "3 cards", coins: `${COIN_COSTS.quick} coins` },
  { value: "deep", label: "Deep", cards: "5 cards", coins: `${COIN_COSTS.deep} coins` },
];

/** Coin cost for a tier — the same number run-module debits. */
export function coinCostForTier(tier: AiTier): number {
  return COIN_COSTS[tier];
}

// ---------------------------------------------------------------------------
// Balance hook
// ---------------------------------------------------------------------------

/**
 * Fetches the caller's own coin balance from GET /api/coins/balance. `balance`
 * is null until the first successful fetch (render "—" while unknown). `refresh`
 * is safe to call repeatedly; a failed fetch leaves the prior value untouched
 * rather than flipping the UI to an alarming 0.
 */
export function useCoinBalance() {
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/coins/balance");
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.balance === "number") setBalance(json.balance);
    } catch {
      // Non-fatal: balance display stays at its prior value. The actual access
      // decision is server-side (spend_coins), so a stale display can't grant a
      // free generation.
    }
  }, []);

  return { balance, setBalance, refresh };
}

// ---------------------------------------------------------------------------
// Tier selector (rendered inside the post-save Get-feedback screen)
// ---------------------------------------------------------------------------

export function TierSelector({
  tier,
  onChange,
  className = "",
}: {
  tier: AiTier;
  onChange: (tier: AiTier) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 ${className}`}>
      {TIER_META.map((t) => {
        const active = tier === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            aria-pressed={active}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-card-sm px-3 py-2 transition active:scale-[0.99] ${
              active
                ? "bg-brand text-white shadow-cta"
                : "bg-surface text-ink shadow-soft"
            }`}
          >
            <span className="text-[14px] font-bold">{t.label}</span>
            <span
              className={`text-[11px] font-medium ${active ? "text-white/80" : "text-ink-muted"}`}
            >
              {t.cards} · {t.coins}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved → Get AI feedback screen
// ---------------------------------------------------------------------------

/**
 * The post-save screen: the entry is persisted (free), and the user chooses
 * whether to spend coins on AI feedback. Handles three inline sub-states:
 *   - ready        → "Get AI feedback · N coins" CTA
 *   - insufficient → coins-short panel (message + "Get coins" link to /coins + Back)
 *   - error        → generic generate failure, with the CTA still available
 * The spinner during generation is owned by each page's existing `submitting`
 * branch, so this screen is only shown when NOT generating.
 */
export function GetFeedbackScreen({
  background,
  eyebrow,
  title,
  blurb,
  tier,
  onTierChange,
  balance,
  insufficient,
  error,
  actionLabel,
  onGenerate,
  onBack,
}: {
  background: ReactNode;
  eyebrow?: ReactNode;
  title: string;
  blurb: string;
  tier: AiTier;
  /**
   * When provided, the Quick/Deep selector renders on THIS post-save screen so
   * the depth (and its coin cost) is chosen after the entry is written, not up
   * front. Omit to hide the selector (e.g. a module with a single fixed tier).
   */
  onTierChange?: (tier: AiTier) => void;
  balance: number | null;
  insufficient: { needed: number; balance: number } | null;
  error?: string | null;
  /** Verb for the CTA, e.g. "Get AI feedback" / "Get verdict". Cost is appended. */
  actionLabel: string;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const cost = coinCostForTier(tier);
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      {background}
      {eyebrow}
      <h2
        className="mt-3 font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        {title}
      </h2>
      <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
        {blurb}
      </p>

      {balance !== null && (
        <p className="mt-4 text-[13px] font-semibold text-ink-soft">
          You have{" "}
          <span className="text-ink">
            {balance} {balance === 1 ? "coin" : "coins"}
          </span>
          .
        </p>
      )}

      {/* Depth is chosen here, after the entry is saved — not at the top of the
          form. Switching tiers updates the CTA cost below; the caller's
          onTierChange clears any insufficient-coins state so a switch to the
          cheaper tier re-enables the button. */}
      {onTierChange && (
        <TierSelector tier={tier} onChange={onTierChange} className="mt-5" />
      )}

      {insufficient ? (
        <div className="mt-5 rounded-card-sm bg-surface p-4 shadow-soft">
          <p className="text-[14px] font-semibold leading-[1.5] text-ink">
            You need {insufficient.needed}{" "}
            {insufficient.needed === 1 ? "coin" : "coins"} for this — you have{" "}
            {insufficient.balance}.
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.5] text-ink-soft">
            Your entry is saved. Top up and come back to it any time.
          </p>
          <Link
            href="/coins"
            className="mt-3 inline-flex h-11 items-center justify-center rounded-pill bg-brand px-5 text-[14px] font-bold text-white shadow-cta active:scale-[0.98]"
          >
            Get coins
          </Link>
        </div>
      ) : (
        <button
          onClick={onGenerate}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98]"
        >
          {actionLabel} · {cost} {cost === 1 ? "coin" : "coins"}
        </button>
      )}

      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>
      )}

      <button
        onClick={onBack}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
      >
        Back to Coach
      </button>
    </div>
  );
}
