"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { ACTION_FIELDS } from "@/lib/ai/schemas";
import { StormBackground } from "@/components/brand/StormBackground";
import {
  FlowScreen,
  FlowHeader,
  FlowFooter,
} from "@/components/ui/flow-screen";
import { ProgressDots } from "@/components/ui/progress-dots";
import { SelectableRow } from "@/components/ui/selectable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Kicker } from "@/components/ui/kicker";
import { Card } from "@/components/ui/card";
import {
  flattenVisibleSteps,
  questionCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import type { AiTier } from "@/types";
import { createClient } from "@/lib/supabase/client";
import {
  GetFeedbackScreen,
  useCoinBalance,
  coinCostForTier,
} from "@/components/coach/coin-ui";

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

// Stepped wizard (redesign §5). Two sections (progress dots): the message
// itself, then optional context. The draft leads — it's the required core
// input; the two optional context fields trail. Payload + copy unchanged from
// the prior single-scroll form.
//   1 draft:   draftText (required), messageType (default "conflict")
//   2 context: riskContext (optional), intentOptional (optional)
const BYS_PAGES: PageDef[] = [
  {
    pageKey: "draft",
    qs: [
      {
        key: "draftText",
        title: "Your draft",
        prompt:
          "This isn't a proofreader. It's a gut-check on how the other person will read it.",
        kind: "textarea",
      },
      {
        key: "messageType",
        title: "What kind of message is this?",
        prompt: null,
        kind: "select_message_type",
      },
    ],
  },
  {
    pageKey: "context",
    qs: [
      {
        key: "riskContext",
        title: "What might make this land badly?",
        prompt:
          "Optional — pressure, blame, a prior fight, their state today. Anything you want the check to weigh.",
        kind: "textarea",
        optional: true,
      },
      {
        key: "intentOptional",
        title: "What do you want them to take away?",
        prompt: "Optional — tell the coach what you hope they feel or do.",
        kind: "textarea",
        optional: true,
      },
    ],
  },
];

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

// Flat single-tint ribbon, not a pill — reads as context, not a bright ad bar.
// Storm dark palette: deep-tinted fill + light same-hue text (the safe pair is
// the dark counterpart logged in memory project_darkmode_verdict_palette).
const VERDICT_RIBBON: Record<AiNormal["verdict"], string> = {
  safe: "bg-[#1B3A2A] text-[#A8D8B8]",
  risky: "bg-[#3A2E18] text-[#E8C58A]",
  do_not_send: "bg-danger text-white",
};

// Reading screen (results/refusal/saved) — scrollable, renders inside the app
// shell over the body's Storm gradient.
function ReadingScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-10">
      <StormBackground />
      {children}
    </div>
  );
}

function RefusalCard({
  output,
  onBack,
}: {
  output: AiRefusal;
  onBack: () => void;
}) {
  return (
    <ReadingScreen>
      <h1
        className="text-[24px] font-medium leading-[1.18] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        A note before you go further.
      </h1>
      <Card className="mt-5">
        <p className="text-[14px] font-medium leading-[1.55] text-ink">
          {output.message_to_user}
        </p>
      </Card>
      <PrimaryButton onClick={onBack} className="mt-8">
        Back to Coach
      </PrimaryButton>
    </ReadingScreen>
  );
}

export default function BeforeYouSendPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  // Wizard state. messageType defaults to "conflict" so its step is always
  // advanceable (matches the old pre-selected chip).
  const [data, setData] = useState<Record<string, unknown>>({
    messageType: "conflict",
  });
  const [tier, setTier] = useState<AiTier>("quick");
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
  // Save-first coins flow (Slice B Phase 2b). The initial draft is saved free
  // (handleSaveDraft) and lands on the "Get verdict" screen; the verdict spends
  // coins. A rewrite ("Check it again") is a brand-new entry — it mints a fresh
  // key and runs a combined save+verdict, so it's charged like a new draft.
  const [awaitingGenerate, setAwaitingGenerate] = useState(false);
  const [insufficient, setInsufficient] = useState<{
    needed: number;
    balance: number;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const { balance, refresh: refreshBalance } = useCoinBalance();
  const submitRef = useRef(false);
  // Stable key for the current draft's save→verdict lifecycle. Re-minted per
  // rewrite so each rewrite scores as its own entry (the old per-submit fresh
  // key is now lifecycle-scoped).
  const keyRef = useRef<string>("");
  if (!keyRef.current) {
    keyRef.current = safeUUID();
  }

  // Read sessionStorage prefill once on mount (Review/Pulse → BYS handoff).
  // The stash is cleared on mount regardless of validation so a stale/foreign
  // prefill never replays.
  //
  // sessionStorage is tab-scoped, not account-scoped. A user who logs out
  // mid-flow and another who logs in on the same tab would otherwise inherit
  // the first user's draft. Two-gate defense:
  //   1. stashedAt must be within PREFILL_MAX_AGE_MS (5 min)
  //   2. userId must match the current Supabase session
  // Same class as the "null-sentinel cross-account guard" lesson in CLAUDE.md.
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
      const { data: authData } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!authData.user || authData.user.id !== parsed.userId) return;
      const prefilled = parsed;
      setData((d) => ({
        ...d,
        ...(prefilled.draftText ? { draftText: prefilled.draftText } : {}),
        ...(prefilled.messageType
          ? { messageType: prefilled.messageType }
          : {}),
      }));
      // Banner-source tagging — set after both the age + userId gates pass
      // so a stale stash doesn't surface a banner with no payload.
      if (prefilled.sourcePulseCheckEntryId) {
        setPrefillSource("pulse_check");
      } else if (prefilled.sourceReviewEntryId) {
        setPrefillSource("repair");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One-question-per-screen sequence (redesign §5). No conditionals in BYS, but
  // we use the same flatten so the wizard machinery matches the other flows.
  const steps = flattenVisibleSteps(BYS_PAGES, data);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const current = steps[safeIndex];
  const isLastStep = safeIndex === steps.length - 1;
  const canAdvance = questionCanAdvance(current.q, data);

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function handleNext() {
    if (!questionCanAdvance(current.q, data)) return;
    // Terminal-button branching keys off whether a later visible step exists,
    // not an index constant (CLAUDE.md dynamic-STEPS rule).
    if (safeIndex < steps.length - 1) {
      setStepIndex(safeIndex + 1);
    } else {
      handleSaveDraft();
    }
  }

  function handleBack() {
    if (safeIndex > 0) setStepIndex(safeIndex - 1);
    else router.push("/coach");
  }

  // Shared request body. `key` ties a save and its verdict to one entry; `text`
  // is the draft being scored (the rewrite box sends a different text).
  function buildBody(text: string, key: string, generateAi: boolean) {
    return {
      tier,
      draftText: text,
      messageType: (data.messageType as MessageType | undefined) ?? "conflict",
      intentOptional:
        ((data.intentOptional as string | undefined) ?? "").trim() || null,
      riskContext:
        ((data.riskContext as string | undefined) ?? "").trim() || null,
      idempotencyKey: key,
      generateAi,
    };
  }

  // Step 1 — free save of the initial draft. No coins, no verdict. Lands on the
  // "Get verdict" screen.
  async function handleSaveDraft() {
    if (submitRef.current) return;
    const draftText = ((data.draftText as string | undefined) ?? "").trim();
    if (!draftText) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/coach/before-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(draftText, keyRef.current, false)),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.beforeYouSendEntryId === "string") {
        setBeforeYouSendEntryId(result.beforeYouSendEntryId);
      }
      setInsufficient(null);
      setAwaitingGenerate(true);
      refreshBalance();
    } catch (err) {
      console.error("before-send save failed", (err as Error)?.message);
      setSubmitError("Could not save. Try again in a moment.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  // Step 2 — paid verdict for the saved draft. Same key as the save; a 402 means
  // the balance is short (draft already saved), surfaced inline on the screen.
  async function handleGenerate() {
    if (submitRef.current) return;
    const draftText = ((data.draftText as string | undefined) ?? "").trim();
    submitRef.current = true;
    setSubmitting(true);
    setGenerateError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/coach/before-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(draftText, keyRef.current, true)),
      });
      if (res.status === 402) {
        const j = (await res.json().catch(() => ({}))) as {
          needed?: number;
          balance?: number;
          beforeYouSendEntryId?: string;
        };
        if (typeof j.beforeYouSendEntryId === "string") {
          setBeforeYouSendEntryId(j.beforeYouSendEntryId);
        }
        setInsufficient({
          needed: j.needed ?? coinCostForTier(tier),
          balance: j.balance ?? 0,
        });
        setAwaitingGenerate(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.beforeYouSendEntryId === "string") {
        setBeforeYouSendEntryId(result.beforeYouSendEntryId);
      }
      if (result.aiOutput) {
        setAwaitingGenerate(false);
        setAiOutput(result.aiOutput as AiOutput);
        // Seed the rewrite box with the text we just checked.
        setRewriteText(draftText);
      } else {
        setAwaitingGenerate(false);
        setSavedMessage(
          result.message ??
            "Your draft was saved. Coaching feedback wasn't available this time.",
        );
      }
      refreshBalance();
    } catch (err) {
      console.error("before-send generate failed", (err as Error)?.message);
      setGenerateError("Could not get a verdict. Try again in a moment.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  // Rewrite loop — a fresh draft scored as its own entry (fresh key, combined
  // save+verdict in one call). On a 402 we restore the verdict the user was
  // looking at and surface an inline coins-short message so their rewrite text
  // isn't lost. Same protect-the-work shape the old 403 rewrite path had.
  async function handleCheckAgain() {
    if (submitRef.current) return;
    const text = rewriteText;
    if (!text.trim()) return;
    const previousAiOutput = aiOutput;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setAiOutput(null);
    setSavedMessage(null);
    setFieldValue("draftText", text);
    // Fresh key — reusing the prior key would return the original verdict from
    // the idempotency branch instead of re-scoring the rewrite.
    keyRef.current = safeUUID();
    try {
      const res = await fetch("/api/coach/before-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(text, keyRef.current, true)),
      });
      if (res.status === 402) {
        const j = (await res.json().catch(() => ({}))) as {
          needed?: number;
          balance?: number;
        };
        setAiOutput(previousAiOutput);
        setSubmitError(
          `You need ${j.needed ?? coinCostForTier(tier)} coins to check a rewrite — you have ${j.balance ?? 0}.`,
        );
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.beforeYouSendEntryId === "string") {
        setBeforeYouSendEntryId(result.beforeYouSendEntryId);
      } else {
        setBeforeYouSendEntryId(null);
      }
      if (result.aiOutput) {
        setAiOutput(result.aiOutput as AiOutput);
        setRewriteText(text);
      } else {
        setSavedMessage(
          result.message ??
            "Your draft was saved. Coaching feedback wasn't available this time.",
        );
      }
      refreshBalance();
    } catch (err) {
      console.error("before-send rewrite failed", (err as Error)?.message);
      // Keep the prior verdict on screen during a rewrite failure.
      if (previousAiOutput) setAiOutput(previousAiOutput);
      setSubmitError("Could not check. Try again in a moment.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <StormBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-hairline-strong border-t-accent" />
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
        <RefusalCard output={aiOutput} onBack={() => router.push("/coach")} />
      );
    }
    if (aiOutput.mode === "normal") {
      const verdict = aiOutput.verdict;
      return (
        <ReadingScreen>
          <Kicker className="text-accent-ink">Before You Send</Kicker>

          <div
            className={`-mx-5 mt-3 px-5 py-2 text-[14px] font-semibold ${VERDICT_RIBBON[verdict]}`}
          >
            {VERDICT_LABEL[verdict]}
          </div>

          {verdict === "do_not_send" && (
            <Card className="mt-4 bg-danger">
              <p className="text-[14px] font-semibold leading-[1.5] text-white">
                Do not send. This message protects your ego more than the
                relationship.
              </p>
            </Card>
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
                <Card
                  key={key}
                  className={isAction ? "animate-action-in" : "animate-card-in"}
                >
                  <Kicker>{label}</Kicker>
                  <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                    {text}
                  </p>
                </Card>
              );
            })}
          </div>

          <div className="mt-7">
            <Kicker>Rewrite and check it again</Kicker>
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
            <PrimaryButton
              onClick={handleCheckAgain}
              disabled={!rewriteText.trim()}
              className="mt-4"
            >
              Check it again · {coinCostForTier(tier)}{" "}
              {coinCostForTier(tier) === 1 ? "coin" : "coins"}
            </PrimaryButton>
          </div>

          <SecondaryButton
            onClick={() => router.push("/coach")}
            className="mt-3 w-full"
          >
            Done
          </SecondaryButton>
        </ReadingScreen>
      );
    }
    // Unknown output shape — fall through to saved-message state.
    return (
      <ReadingScreen>
        <h1
          className="text-[24px] font-medium leading-[1.18] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          Draft saved
        </h1>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your draft was saved, but coaching feedback isn&apos;t available for
          this one.
        </p>
        <PrimaryButton onClick={() => router.push("/coach")} className="mt-8">
          Back to Coach
        </PrimaryButton>
      </ReadingScreen>
    );
  }

  if (awaitingGenerate) {
    return (
      <GetFeedbackScreen
        background={<StormBackground />}
        eyebrow={<Kicker className="text-accent-ink">Before You Send</Kicker>}
        title="Draft saved."
        blurb="Your draft is saved. Get a verdict on how it'll land whenever you're ready."
        tier={tier}
        onTierChange={(t) => {
          setTier(t);
          setInsufficient(null);
          setGenerateError(null);
        }}
        balance={balance}
        insufficient={insufficient}
        error={generateError}
        actionLabel="Get verdict"
        onGenerate={handleGenerate}
        onBack={() => router.push("/coach")}
      />
    );
  }

  if (savedMessage) {
    return (
      <ReadingScreen>
        <h1
          className="text-[24px] font-medium leading-[1.18] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          Draft saved
        </h1>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          {savedMessage}
        </p>
        <PrimaryButton onClick={handleGenerate} className="mt-8">
          Try again for a verdict
        </PrimaryButton>
        <SecondaryButton
          onClick={() => router.push("/coach")}
          className="mt-3 w-full"
        >
          Back to Coach
        </SecondaryButton>
      </ReadingScreen>
    );
  }

  // --- Form: one question per screen (no-scroll FlowScreen) ---
  function renderStep(step: StepDef) {
    if (step.kind === "select_message_type") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {MESSAGE_TYPES.map((t) => (
            <SelectableRow
              key={t.value}
              selected={value === t.value}
              onClick={() => setFieldValue(step.key, t.value)}
            >
              {t.label}
            </SelectableRow>
          ))}
        </div>
      );
    }
    if (step.kind === "textarea") {
      const value = (data[step.key] as string | undefined) ?? "";
      const placeholder =
        step.key === "draftText"
          ? "Paste or type what you're about to send…"
          : step.key === "riskContext"
            ? "Pressure, blame, prior fight, their state today — anything you want the check to weigh."
            : "If you want, tell the coach what you hope they feel or do.";
      const input = (
        <VoiceInput
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          fill
          placeholder={placeholder}
        />
      );
      // The Review/Pulse → BYS handoff banner rides above the draft field.
      if (step.key === "draftText" && prefillSource) {
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 shrink-0 rounded-card-sm border border-hairline bg-surface p-3">
              <p className="text-[12px] font-medium leading-[1.45] text-ink">
                {prefillSource === "repair"
                  ? "From your Repair. Edit before checking."
                  : "From your Pulse Check. Edit before sending."}
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{input}</div>
          </div>
        );
      }
      return input;
    }
    return null;
  }

  return (
    <FlowScreen
      header={
        <FlowHeader
          onBack={handleBack}
          eyebrow="Before You Send"
          counter={`${safeIndex + 1} / ${steps.length}`}
          dots={
            <ProgressDots
              total={BYS_PAGES.length}
              current={current.sectionIndex}
            />
          }
        />
      }
      footer={
        <FlowFooter
          onBack={safeIndex > 0 ? handleBack : undefined}
          primaryLabel={isLastStep ? "Save draft" : "Next"}
          onPrimary={handleNext}
          primaryDisabled={!canAdvance}
        />
      }
      title={current.q.title}
      helper={current.q.prompt ?? undefined}
    >
      <div
        key={`${current.pageKey}.${current.q.key}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {renderStep(current.q)}
        {isLastStep && submitError && (
          <p className="mt-2 shrink-0 text-[13px] font-medium text-danger">
            {submitError}
          </p>
        )}
      </div>
    </FlowScreen>
  );
}
