"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { reflectionOutputSchema, type ReflectionOutput } from "@/lib/ai/schemas";
import { COIN_COSTS } from "@/types";
import { useCoinBalance } from "@/components/coach/coin-ui";
import { ReflectionCard } from "./ReflectionCard";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { pillAccentClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Kind values sent by the API route (from ReflectionGenerationError.kind).
// Map each to a short human label so a silent writer regression is
// visible to the user per the migration-0018 defense.
const KIND_LABELS: Record<string, string> = {
  insert_failed: "couldn't save",
  db_read_failed: "couldn't read your entries",
  api_error: "AI service issue",
  schema_mismatch: "unexpected AI response",
  json_parse: "unexpected AI response",
  no_text: "unexpected AI response",
  banned_phrase: "response blocked by content filter",
  coin_charge_failed: "couldn't process coins",
};

const COST = COIN_COSTS.weekly_insights;

interface Props {
  // When true, the page already had a reflection but it's stale (older than
  // the 7-day window or a bumped generator_version). Used to tailor the CTA
  // copy ("your previous reflection is no longer current").
  hasStaleCached: boolean;
  // When rendered inside a collapsible InsightsSection, the section header owns
  // the "Your weekly reflection" title, so suppress the CTA card's own title.
  // The freshly-generated result card (ready phase) keeps its full header so
  // the new reflection is self-labelled with its date.
  hideHeader?: boolean;
}

type State =
  | { phase: "idle" }
  | { phase: "generating" }
  | { phase: "ready"; reflection: ReflectionOutput; generatedAt: string }
  | { phase: "error"; message: string; kind?: string }
  | { phase: "insufficient"; needed: number; balance: number };

/**
 * Slice B3: a weekly reflection costs coins, so generation is NO LONGER
 * auto-fired on mount (that would silently spend 20 coins just for opening
 * the Insights tab). Instead we show an explicit "Generate this week's
 * reflection · N coins" button. The charge happens server-side only on tap;
 * a re-visit inside the 7-day window renders the cached row on the page
 * (this component isn't even mounted), so the user is never re-charged.
 *
 * Mirrors the Coach Save-first / pay-to-generate shape (coin-ui.tsx).
 */
export function ReflectionKickoff({ hasStaleCached, hideHeader }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const { balance, refresh } = useCoinBalance();
  const inFlight = useRef(false);

  // Show the user's balance under the CTA. Read-only — the actual spend gate
  // is server-side (spend_coins), so a stale display can't grant a free run.
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function generate() {
    // useRef guard: double-tap on a slow network must not fire two POSTs
    // (each would compute its own attempt key; the unique index dedups a true
    // double-fire to one charge, but the guard avoids the wasted round-trip).
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "generating" });

    try {
      const res = await fetch("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 402 && data?.error === "insufficient_coins") {
        setState({
          phase: "insufficient",
          needed: typeof data.needed === "number" ? data.needed : COST,
          balance: typeof data.balance === "number" ? data.balance : 0,
        });
        return;
      }

      // Not enough Coach entries yet (server gate). Normally the page hides the
      // button below the threshold, so this only lands on a race or a page-load
      // count read that failed open. Show a clear, non-alarming message.
      if (res.status === 409 && data?.error === "insufficient_entries") {
        const needed = typeof data.needed === "number" ? data.needed : 5;
        setState({
          phase: "error",
          message: `You need at least ${needed} Coach entries before your first reflection. Keep using Prepare, Review, Repair, and Pulse Check.`,
        });
        return;
      }

      if (!res.ok) {
        setState({
          phase: "error",
          message:
            typeof data?.error === "string"
              ? data.error
              : "Could not generate your reflection right now.",
          kind: typeof data?.kind === "string" ? data.kind : undefined,
        });
        return;
      }

      if (!data?.reflection?.ai_json || !data?.reflection?.generated_at) {
        setState({
          phase: "error",
          message: "Generation returned an unexpected shape.",
        });
        return;
      }

      // Defensive Zod re-parse — the server validates before INSERT, but a
      // cache-hit branch returns a stored row whose ai_json could have drifted
      // (hand-edit, partial migration). Fall through to error rather than
      // render a broken card.
      const parsed = reflectionOutputSchema.safeParse(data.reflection.ai_json);
      if (!parsed.success) {
        setState({
          phase: "error",
          message: "Generation returned an unexpected shape.",
          kind: "schema_mismatch",
        });
        return;
      }

      setState({
        phase: "ready",
        reflection: parsed.data,
        generatedAt: data.reflection.generated_at as string,
      });
    } catch {
      setState({
        phase: "error",
        message:
          "Could not reach the reflection service. Check your connection and try again.",
      });
    } finally {
      inFlight.current = false;
      // Balance may have changed (charge, or refund on a refusal) — refresh it.
      refresh();
    }
  }

  // Screen-reader status. The component swaps its whole subtree between phases
  // with no inherent announcement, and generation can take ~60s — without a
  // persistent live region a non-sighted user gets zero feedback that anything
  // is happening, then zero feedback when the result lands. Keep ONE always-
  // mounted polite region (mounted before the text changes, so the change is
  // announced) and write a short status string to it on each phase.
  const statusText =
    state.phase === "generating"
      ? "Generating your weekly reflection. This can take up to a minute."
      : state.phase === "ready"
        ? state.reflection.mode === "refusal"
          ? "Checked — not enough material for a reflection this week. You weren't charged."
          : "Your weekly reflection is ready."
        : state.phase === "error"
          ? "Could not generate your reflection. You weren't charged."
          : state.phase === "insufficient"
            ? "Not enough coins to generate this week's reflection."
            : "";

  const kindLabel =
    state.phase === "error" && state.kind ? KIND_LABELS[state.kind] : null;

  let body: ReactNode;
  if (state.phase === "ready") {
    body = (
      <ReflectionCard
        reflection={state.reflection}
        generatedAt={state.generatedAt}
      />
    );
  } else if (state.phase === "generating") {
    body = (
      <Card className="mt-4 p-5">
        {!hideHeader && <Kicker as="h2">Your weekly reflection</Kicker>}
        <div className="mt-3 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          <p className="text-[13px] font-medium text-ink-soft">
            Reading your last 7 days…
          </p>
        </div>
        <p className="mt-2 text-[12px] font-medium text-ink-soft">
          This can take up to a minute.
        </p>
      </Card>
    );
  } else if (state.phase === "insufficient") {
    body = (
      <Card className="mt-4 p-5">
        {!hideHeader && <Kicker as="h2">Your weekly reflection</Kicker>}
        <p className="mt-2 text-[14px] font-semibold leading-[1.5] text-ink">
          You need {state.needed} {state.needed === 1 ? "coin" : "coins"} for
          this — you have {state.balance}.
        </p>
        <p className="mt-1.5 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Top up and come back any time — your entries are waiting.
        </p>
        <Link
          href="/coins"
          className={cn(pillAccentClass, "mt-3 inline-flex h-11 px-5 text-[14px]")}
        >
          Get coins
        </Link>
      </Card>
    );
  } else if (state.phase === "error") {
    body = (
      <Card className="mt-4 p-5">
        {!hideHeader && <Kicker as="h2">Your weekly reflection</Kicker>}
        {/* The DIFFERENTIATED message (server copy for 503/429/409, network
            copy offline) — state.message was previously computed but never
            rendered, so every error showed the same generic paragraph. */}
        <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink-soft">
          {state.message}
        </p>
        <p className="mt-1.5 text-[12px] font-medium text-ink-soft">
          You weren&apos;t charged.
        </p>
        {kindLabel ? (
          <p className="mt-2 text-[12px] font-medium text-ink-soft">
            Reason: {kindLabel}.
          </p>
        ) : null}
        <button
          onClick={generate}
          className={cn(pillAccentClass, "mt-4 h-12 w-full text-[14px]")}
        >
          Try again · {COST} coins
        </button>
      </Card>
    );
  } else {
    // idle — the explicit CTA.
    body = (
      <Card className="mt-4 p-5">
        {!hideHeader && <Kicker as="h2">Your weekly reflection</Kicker>}
        <p className="mt-2 text-[14px] font-medium leading-[1.55] text-ink-soft">
          {hasStaleCached
            ? "Your previous reflection is no longer current. Generate a fresh read of your last 7 days."
            : "Reading your last 7 days for the one pattern worth your attention, grounded in your own words."}
        </p>
        {balance !== null && (
          <p className="mt-3 text-[13px] font-semibold text-ink-soft">
            You have{" "}
            <span className="text-ink">
              {balance} {balance === 1 ? "coin" : "coins"}
            </span>
            .
          </p>
        )}
        <button
          onClick={generate}
          className={cn(pillAccentClass, "mt-4 h-14 w-full text-[15px]")}
        >
          Generate this week&apos;s reflection · {COST} coins
        </button>
      </Card>
    );
  }

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {statusText}
      </div>
      {body}
    </>
  );
}
