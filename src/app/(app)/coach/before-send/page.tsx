"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { ACTION_FIELDS } from "@/lib/ai/schemas";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { safeUUID } from "@/lib/utils";
import type { AiTier } from "@/types";
import { createClient } from "@/lib/supabase/client";

// Tier metadata. Coins are NOT debited yet (Slice B); these are display-only
// cost constants so the selector reads the same as the future priced flow.
// Mirrors the Pulse Check tier selector.
const TIER_META: {
  value: AiTier;
  label: string;
  cards: string;
  coins: string;
}[] = [
  { value: "quick", label: "Quick", cards: "3 cards", coins: "4 coins" },
  { value: "deep", label: "Deep", cards: "5 cards", coins: "6 coins" },
];

// Reject stashes older than this. sessionStorage is tab-scoped, not
// account-scoped; a short window limits the cross-user bleed window to
// cases where user B logs in within 5 min of user A's tab-abandoned
// handoff. Chosen over pure userId match so even a same-user stale
// stash from an abandoned flow doesn't auto-populate days later.
const PREFILL_MAX_AGE_MS = 5 * 60 * 1000;

type MessageType =
  | "conflict"
  | "check_in"
  | "apology"
  | "repair"
  | "ask"
  | "boundary"
  | "other";

const MESSAGE_TYPES: { value: MessageType; label: string }[] = [
  { value: "conflict", label: "Conflict / pushback" },
  { value: "check_in", label: "Check-in" },
  { value: "apology", label: "Apology" },
  { value: "repair", label: "Repair opening" },
  { value: "ask", label: "Ask / request" },
  { value: "boundary", label: "Setting a boundary" },
  { value: "other", label: "Other" },
];

const PREFILL_KEY = "pure-eq:bys-prefill";

type Prefill = {
  draftText?: string;
  messageType?: MessageType;
  sourceReviewEntryId?: string;
  // Coach SOT 2026-05-06: Pulse Check `use_bys` chip stashes a check-in
  // draft and tags the source so the banner copy can distinguish a
  // pulse-check origin from a Review-repair origin.
  sourcePulseCheckEntryId?: string;
  userId?: string;
  stashedAt?: number;
};

type AiNormal = {
  mode: "normal";
  verdict: "safe" | "risky" | "do_not_send";
  // Quick tier (always present).
  how_this_will_land: string;
  thing_to_cut: string | null;
  check_in_question: string;
  // Deep tier (present only when tier === "deep").
  what_its_missing?: string;
  their_likely_reply?: string;
};

type AiRefusal = {
  mode: "refusal";
  refusal_reason: string;
  message_to_user: string;
  suggested_resource: string;
};

type AiOutput = AiNormal | AiRefusal;

// Quick fields first, then the two Deep cards. The render filter drops any
// field the model omitted (Quick output has no Deep keys), so a Quick verdict
// shows 3 cards and a Deep verdict shows 5.
const RESULT_FIELDS: { label: string; key: keyof AiNormal }[] = [
  { label: "How this will land", key: "how_this_will_land" },
  { label: "Thing to cut", key: "thing_to_cut" },
  { label: "Check-in question", key: "check_in_question" },
  { label: "What it's missing", key: "what_its_missing" },
  { label: "Their likely reply", key: "their_likely_reply" },
];

const VERDICT_LABEL: Record<AiNormal["verdict"], string> = {
  safe: "Safe to send.",
  risky: "Risky.",
  do_not_send: "Do not send.",
};

// Flat single-tint ribbon, not a pill. Muted green on safe so the
// verdict reads as context, not a bright ad bar competing with the
// action card below.
const VERDICT_RIBBON: Record<AiNormal["verdict"], string> = {
  safe: "bg-[#DFF5E7] text-[#166A3A]",
  risky: "bg-warm text-ink",
  do_not_send: "bg-danger text-white",
};

const BysBackground = () => <SkyBackground variant="calm" />;

function RefusalCard({
  output,
  onBack,
}: {
  output: AiRefusal;
  onBack: () => void;
}) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <BysBackground />
      <h2
        className="font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        A note before you go further.
      </h2>
      <div className="mt-5 rounded-card-sm bg-surface p-4 shadow-soft">
        <p className="text-[14px] font-medium leading-[1.55] text-ink">
          {output.message_to_user}
        </p>
      </div>
      <button
        onClick={onBack}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Back to Coach
      </button>
    </div>
  );
}

export default function BeforeYouSendPage() {
  const router = useRouter();
  const [draftText, setDraftText] = useState("");
  const [tier, setTier] = useState<AiTier>("quick");
  const [messageType, setMessageType] = useState<MessageType>("conflict");
  const [intentOptional, setIntentOptional] = useState("");
  const [riskContext, setRiskContext] = useState("");
  const [beforeYouSendEntryId, setBeforeYouSendEntryId] = useState<
    string | null
  >(null);
  // Banner copy variant — set when a fresh prefill loads. "repair" =
  // Review handoff; "pulse_check" = Pulse Check use_bys chip; null = none.
  const [prefillSource, setPrefillSource] = useState<
    "repair" | "pulse_check" | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [rewriteText, setRewriteText] = useState("");
  const submitRef = useRef(false);

  // Read sessionStorage prefill once on mount (Review → BYS handoff from
  // Commit 6). The stash is cleared on mount regardless of validation so
  // a stale/foreign prefill never replays.
  //
  // sessionStorage is tab-scoped, not account-scoped. A user who logs out
  // mid-flow and another user who logs in on the same tab would otherwise
  // inherit the first user's draft. Two-gate defense:
  //   1. stashedAt must be within PREFILL_MAX_AGE_MS (5 min)
  //   2. userId must match the current Supabase session
  // Same class as the "null-sentinel cross-account guard" lesson in
  // CLAUDE.md — the hint must be bound to a live auth signal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let parsed: Prefill | null = null;
      try {
        const raw = sessionStorage.getItem(PREFILL_KEY);
        if (raw) {
          sessionStorage.removeItem(PREFILL_KEY);
          parsed = JSON.parse(raw) as Prefill;
        }
      } catch {
        // malformed stash — already cleared
      }
      if (!parsed) return;
      if (
        typeof parsed.stashedAt !== "number" ||
        Date.now() - parsed.stashedAt > PREFILL_MAX_AGE_MS
      ) {
        return;
      }
      if (!parsed.userId) return;
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user || data.user.id !== parsed.userId) return;
      if (parsed.draftText) setDraftText(parsed.draftText);
      if (parsed.messageType) setMessageType(parsed.messageType);
      // Banner-source tagging — set after both the age + userId gates pass
      // so a stale stash doesn't surface a banner with no payload.
      if (parsed.sourcePulseCheckEntryId) {
        setPrefillSource("pulse_check");
      } else if (parsed.sourceReviewEntryId) {
        setPrefillSource("repair");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitCheck(textToCheck: string) {
    if (submitRef.current) return;
    if (!textToCheck.trim()) return;
    // Snapshot the pre-submit verdict. Used by the 403 handler if this
    // is a rewrite — the user has composed a new draft based on the
    // verdict in hand, and losing both the verdict and the rewrite text
    // to a paywall redirect erases their work. We restore the snapshot
    // on 403 and surface an inline upgrade CTA.
    const previousAiOutput = aiOutput;
    const isRewriteSubmit = previousAiOutput !== null;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setAiOutput(null);
    setSavedMessage(null);
    try {
      // FRESH idempotency key per submit — including "Check it again"
      // retries. If we reused a key, the run-module idempotency branch
      // would return the original AI output instead of re-scoring the
      // rewrite.
      const idempotencyKey = safeUUID();
      const res = await fetch("/api/coach/before-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          draftText: textToCheck,
          messageType,
          intentOptional: intentOptional.trim() || null,
          riskContext: riskContext.trim() || null,
          idempotencyKey,
        }),
      });
      if (res.status === 403) {
        // Initial submit: user hasn't seen any coaching output yet —
        // send them to the paywall.
        // Rewrite ("Check it again"): user has composed a rewrite and is
        // asking for another pass. Don't discard their in-progress draft
        // to a redirect. Restore the verdict they were looking at and
        // surface an inline upgrade prompt so they can upgrade without
        // losing context.
        if (isRewriteSubmit) {
          setAiOutput(previousAiOutput);
          setSubmitError(
            "A subscription is needed to check rewrites. Tap Done or visit the paywall to upgrade.",
          );
        } else {
          router.push("/paywall");
        }
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      // Capture the derived entry id so the result cards can attach
      // Accept/Edit/Not-true edits via POST /api/coach/card-edit. A fresh
      // id arrives on every pass (including "Check it again" rewrites), so
      // the cards are keyed by it and remount per submission.
      if (typeof result.beforeYouSendEntryId === "string") {
        setBeforeYouSendEntryId(result.beforeYouSendEntryId);
      } else {
        setBeforeYouSendEntryId(null);
      }
      if (result.aiOutput) {
        setAiOutput(result.aiOutput as AiOutput);
        // Seed the rewrite box with the text we just checked so the user
        // can edit from there for the next pass.
        setRewriteText(textToCheck);
      } else {
        setSavedMessage(
          result.message ??
            "Your draft was saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("before-send submit failed", (err as Error)?.message);
      // Keep the prior verdict on screen during a rewrite failure —
      // losing both the verdict and the rewrite text to a transient
      // network error erases the user's work.
      if (isRewriteSubmit) setAiOutput(previousAiOutput);
      setSubmitError("Could not check. Try again in a moment.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  function handleInitialSubmit() {
    submitCheck(draftText);
  }

  function handleCheckAgain() {
    setDraftText(rewriteText);
    submitCheck(rewriteText);
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <BysBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Reading your draft…
          </p>
        </div>
      </div>
    );
  }

  if (aiOutput) {
    if (isRefusal(aiOutput)) {
      return (
        <RefusalCard
          output={aiOutput}
          onBack={() => router.push("/coach")}
        />
      );
    }
    if (aiOutput.mode === "normal") {
      const verdict = aiOutput.verdict;
      return (
        <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
          <BysBackground />
          <span className="inline-block rounded-pill bg-surface-tint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink">
            Before you send
          </span>

          <div
            className={`-mx-5 mt-3 px-5 py-2 text-[14px] font-semibold ${VERDICT_RIBBON[verdict]}`}
          >
            {VERDICT_LABEL[verdict]}
          </div>

          {verdict === "do_not_send" && (
            <div className="mt-4 rounded-card-sm bg-danger p-4 shadow-soft">
              <p className="text-[14px] font-semibold leading-[1.5] text-white">
                Do not send. This message protects your ego more than the
                relationship.
              </p>
            </div>
          )}

          <p className="mt-4 text-[13px] font-medium leading-[1.5] text-ink-soft">
            Keep each card, edit it in your words, or mark it not true.
          </p>
          <div className="mt-3 space-y-3">
            {RESULT_FIELDS.filter(({ key }) => {
              const v = aiOutput[key];
              return typeof v === "string" && v.trim().length > 0;
            }).map(({ label, key }) => {
              const isAction = ACTION_FIELDS.has(key);
              const text = aiOutput[key] as string;
              // Key by entry id so a "Check it again" rewrite (fresh id)
              // remounts the cards instead of carrying a stale edit verdict.
              return beforeYouSendEntryId ? (
                <EditableCard
                  key={`${beforeYouSendEntryId}.${key}`}
                  label={label}
                  value={text}
                  cardKey={key}
                  entryTable="before_you_send_entries"
                  entryId={beforeYouSendEntryId}
                  isAction={isAction}
                />
              ) : (
                <div
                  key={key}
                  className={`rounded-card-sm bg-surface p-4 shadow-soft ${isAction ? "animate-action-in" : "animate-card-in"}`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                    {label}
                  </p>
                  <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                    {text}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-7">
            <p className="text-[13px] font-bold uppercase tracking-[1px] text-ink-muted">
              Rewrite and check it again
            </p>
            <div className="mt-2">
              <VoiceInput
                key="bys-rewrite"
                value={rewriteText}
                onChange={setRewriteText}
                rows={6}
                placeholder="Edit the draft above, then check it again."
              />
            </div>
            {submitError && (
              <p className="mt-3 text-[13px] font-medium text-danger">
                {submitError}
              </p>
            )}
            <button
              onClick={handleCheckAgain}
              disabled={!rewriteText.trim()}
              className="mt-4 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              Check it again
            </button>
          </div>

          <button
            onClick={() => router.push("/coach")}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            Done
          </button>
        </div>
      );
    }
    // Unknown output shape — fall through to saved-message state.
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
        <BysBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Draft saved
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your draft was saved, but coaching feedback isn&apos;t available for
          this one.
        </p>
        <button
          onClick={() => router.push("/coach")}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Back to Coach
        </button>
      </div>
    );
  }

  if (savedMessage) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
        <BysBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Draft saved
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          {savedMessage}
        </p>
        <button
          onClick={handleInitialSubmit}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Try again for a verdict
        </button>
        <button
          onClick={() => router.push("/coach")}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
        >
          Back to Coach
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <BysBackground />

      <span className="inline-block rounded-pill bg-surface-tint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink">
        Before you send
      </span>
      <h2
        className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Paste the draft. See how it <span className="italic">lands</span>.
      </h2>
      <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
        This isn&apos;t a proofreader. It&apos;s a gut-check on how the other
        person will read it.
      </p>

      {/* Tier selector — Quick (3 cards) vs Deep (5 cards). Display-only coin
          costs; nothing is debited until Slice B. */}
      <div className="mt-5 flex gap-2">
        {TIER_META.map((t) => {
          const active = tier === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTier(t.value)}
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

      {prefillSource && (
        <div className="mt-5 rounded-card-sm bg-surface p-3 shadow-soft">
          <p className="text-[12px] font-medium leading-[1.45] text-ink">
            {prefillSource === "repair"
              ? "From your Repair. Edit before checking."
              : "From your Pulse Check. Edit before sending."}
          </p>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          What might make this land badly?{" "}
          <span className="text-ink-muted">(optional)</span>
        </p>
        <div className="mt-2">
          <VoiceInput
            key="bys-risk-context"
            value={riskContext}
            onChange={setRiskContext}
            rows={3}
            placeholder="Pressure, blame, prior fight, their state today — anything you want the check to weigh."
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          Your draft
        </p>
        <div className="mt-2">
          <VoiceInput
            key="bys-draft"
            value={draftText}
            onChange={setDraftText}
            rows={7}
            placeholder="Paste or type what you're about to send…"
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          What kind of message is this?
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {MESSAGE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setMessageType(t.value)}
              className={`flex min-h-11 items-center justify-center rounded-card-sm px-3 text-[13px] font-semibold transition active:scale-[0.99] ${
                messageType === t.value
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          What do you want them to take away? <span className="text-ink-muted">(optional)</span>
        </p>
        <div className="mt-2">
          <VoiceInput
            key="bys-intent"
            value={intentOptional}
            onChange={setIntentOptional}
            rows={3}
            placeholder="If you want, tell the coach what you hope they feel or do."
          />
        </div>
      </div>

      {submitError && (
        <p className="mt-3 text-[13px] font-medium text-danger">{submitError}</p>
      )}

      <button
        onClick={handleInitialSubmit}
        disabled={!draftText.trim()}
        className="mt-7 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
      >
        Check this draft
      </button>
    </div>
  );
}
