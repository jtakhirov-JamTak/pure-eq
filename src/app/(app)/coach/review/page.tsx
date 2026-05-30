"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { CoachPage } from "@/components/coach/coach-page";
import {
  TextareaTwoColumn,
  type TextareaTwoColumnValue,
} from "@/components/coach/steps/textarea-two-column";
import {
  pageCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import { REVIEW_NEXT_MOVE_VALUES } from "@/types";
import type { AiTier, ReviewNextMove } from "@/types";
import {
  TierSelector,
  GetFeedbackScreen,
  useCoinBalance,
  coinCostForTier,
} from "@/components/coach/coin-ui";

// Lean Review next-move chip labels (column next_move). Records what the user
// thinks should happen after the conversation. "Repair it" routes to the future
// standalone Repair module (Slice D); for now it's persisted intent.
const NEXT_MOVE_LABELS: Record<ReviewNextMove, string> = {
  nothing: "Nothing — let it settle",
  repair: "Repair it",
  prepare: "Prepare for a follow-up",
  set_boundary: "Set a boundary",
  follow_up: "Follow up lightly",
  step_back: "Step back",
  save_pattern: "Save it as a pattern",
};

// Coins redesign Slice A 2026-05-29: lean 7-field Review across 3 pages.
//   1 setup: personName, whatHappened
//   2 read:  observedInterpreted (two-column), whatYouDid
//   3 learn: easierOrHarder, dataAndUpdate, nextMove
const REVIEW_PAGES: PageDef[] = [
  {
    pageKey: "setup",
    qs: [
      {
        key: "personName",
        title: "Who was this conversation with?",
        prompt: "Start typing to see people you've mentioned before.",
        kind: "person",
      },
      {
        key: "whatHappened",
        title: "What happened?",
        prompt:
          "Stick to facts. What was said and done — not interpretations yet.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "read",
    qs: [
      {
        key: "observedInterpreted",
        title: "What did you observe vs. what did you think it meant?",
        prompt:
          "Two columns. Left: what you saw or heard. Right: what you concluded.",
        kind: "textarea_two_column",
      },
      {
        key: "whatYouDid",
        title: "What did you do?",
        prompt: "The actual move. Quote yourself if you can.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "learn",
    qs: [
      {
        key: "easierOrHarder",
        title: "What did you make easier or harder for them to do next?",
        prompt:
          "Did you make it easier for them to be honest, repair, soften? Or harder? Name the behavior of yours that did it.",
        kind: "textarea",
      },
      {
        key: "dataAndUpdate",
        title: "What did this teach you — and what should change next time?",
        prompt:
          "The takeaway plus the actual behavior swap. One or two sentences.",
        kind: "textarea",
      },
      {
        key: "nextMove",
        title: "What do you think should happen next?",
        prompt: "Pick the closest. It shapes the feedback.",
        kind: "select_review_next_move",
      },
    ],
  },
];

type AiNormal = {
  mode: "normal";
  turning_point: string;
  pattern_data: string;
  recommended_move: string;
  their_likely_experience?: string;
  repeat_stop_update?: string;
  pattern_tag: string;
};

type AiRefusal = {
  mode: "refusal";
  refusal_reason: string;
  message_to_user: string;
  suggested_resource: string;
};

type AiOutput = AiNormal | AiRefusal;

const RESULT_FIELDS: { label: string; key: keyof AiNormal }[] = [
  { label: "Turning point", key: "turning_point" },
  { label: "The pattern this is data about", key: "pattern_data" },
  { label: "Recommended next move", key: "recommended_move" },
  { label: "How they likely experienced it", key: "their_likely_experience" },
  { label: "Repeat · stop · update", key: "repeat_stop_update" },
];

const ReviewBackground = () => <SkyBackground variant="warm" />;

function NormalResultCard({
  output,
  entryId,
  onBack,
}: {
  output: AiNormal;
  entryId: string | null;
  onBack: () => void;
}) {
  const visible = RESULT_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />
      <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-ink">
        Review
      </span>
      <h2
        className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Your <span className="italic">reflection</span>.
      </h2>
      <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
        Keep each card, edit it in your words, or mark it not true.
      </p>
      <div className="mt-5 space-y-3">
        {visible.map(({ label, key }) => {
          const text = output[key] as string;
          return entryId ? (
            <EditableCard
              key={key}
              label={label}
              value={text}
              cardKey={key}
              entryTable="review_entries"
              entryId={entryId}
            />
          ) : (
            <div
              key={key}
              className="rounded-card-sm bg-surface p-4 shadow-soft animate-card-in"
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
      <button
        onClick={onBack}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Done
      </button>
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
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />
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

function EmptyOutputCard({
  onRetryCoaching,
  onBack,
  message,
}: {
  onRetryCoaching: () => void;
  onBack: () => void;
  message?: string;
}) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />
      <h2
        className="font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Reflection saved
      </h2>
      <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
        {message ??
          "Your reflection is saved, but no coaching feedback is available to show for this one."}
      </p>
      <button
        onClick={onRetryCoaching}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Try again for coaching feedback
      </button>
      <button
        onClick={onBack}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
      >
        Back to Coach
      </button>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  const [tier, setTier] = useState<AiTier>("quick");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [reviewEntryId, setReviewEntryId] = useState<string | null>(null);
  // Save-first coins flow (Slice B Phase 2b). After the free save succeeds we
  // land on the "Get AI feedback" screen instead of generating immediately.
  const [awaitingGenerate, setAwaitingGenerate] = useState(false);
  const [insufficient, setInsufficient] = useState<{
    needed: number;
    balance: number;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const { balance, refresh: refreshBalance } = useCoinBalance();
  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
  }

  const totalPages = REVIEW_PAGES.length;
  const currentPage = REVIEW_PAGES[pageIndex];

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function canAdvance(): boolean {
    return pageCanAdvance(currentPage, data);
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (pageIndex < totalPages - 1) {
      setPageIndex(pageIndex + 1);
    } else {
      handleSave();
    }
  }

  function handleBack() {
    if (pageIndex > 0) setPageIndex(pageIndex - 1);
  }

  // Build the request body. The stable idempotencyKey ties the free save and
  // the paid generate to ONE entry — the generate call reuses the saved row and
  // only the coin debit is new.
  function buildBody(generateAi: boolean) {
    const observedInterpreted =
      (data.observedInterpreted as TextareaTwoColumnValue | undefined) ?? {
        left: "",
        right: "",
      };
    return {
      tier,
      personName: data.personName,
      whatHappened: data.whatHappened,
      observedRaw: observedInterpreted.left,
      interpretedRaw: observedInterpreted.right,
      whatYouDid: data.whatYouDid,
      easierOrHarder: data.easierOrHarder,
      dataAndUpdate: data.dataAndUpdate,
      nextMove: data.nextMove,
      personId: personId || null,
      idempotencyKey: idempotencyKeyRef.current,
      generateAi,
    };
  }

  // Step 1 — free save. No coins, no AI. Lands on the Get-feedback screen.
  async function handleSave() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/coach/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(false)),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.reviewEntryId === "string") {
        setReviewEntryId(result.reviewEntryId);
      }
      setInsufficient(null);
      setAwaitingGenerate(true);
      refreshBalance();
    } catch (err) {
      console.error("review save failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  // Step 2 — paid generate. Reuses the saved entry's idempotencyKey; a 402 means
  // the balance is short (entry already saved), surfaced inline on this screen.
  async function handleGenerate() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setGenerateError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/coach/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(true)),
      });
      if (res.status === 402) {
        const j = (await res.json().catch(() => ({}))) as {
          needed?: number;
          balance?: number;
          reviewEntryId?: string;
        };
        if (typeof j.reviewEntryId === "string") {
          setReviewEntryId(j.reviewEntryId);
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
      if (typeof result.reviewEntryId === "string") {
        setReviewEntryId(result.reviewEntryId);
      }
      if (result.aiOutput) {
        setAwaitingGenerate(false);
        setAiOutput(result.aiOutput as AiOutput);
      } else {
        setAwaitingGenerate(false);
        setSavedMessage(
          result.message ??
            "Your reflection is saved. Coaching feedback wasn't available this time.",
        );
      }
      refreshBalance();
    } catch (err) {
      console.error("review generate failed", (err as Error)?.message);
      setGenerateError("Could not get feedback. Try again in a moment.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  function retryCoaching() {
    setSavedMessage(null);
    setAiOutput(null);
    handleGenerate();
  }

  // --- Result screens ---
  if (aiOutput) {
    if (aiOutput.mode === "normal") {
      return (
        <NormalResultCard
          output={aiOutput}
          entryId={reviewEntryId}
          onBack={() => router.push("/coach")}
        />
      );
    }
    if (isRefusal(aiOutput)) {
      return (
        <RefusalCard output={aiOutput} onBack={() => router.push("/coach")} />
      );
    }
    return (
      <EmptyOutputCard
        onRetryCoaching={retryCoaching}
        onBack={() => router.push("/coach")}
      />
    );
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <ReviewBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Generating your reflection…
          </p>
        </div>
      </div>
    );
  }

  if (awaitingGenerate) {
    return (
      <GetFeedbackScreen
        background={<ReviewBackground />}
        eyebrow={
          <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-ink">
            Review
          </span>
        }
        title="Saved."
        blurb="Your reflection is saved — it's yours to keep. Get AI coaching feedback whenever you're ready."
        tier={tier}
        balance={balance}
        insufficient={insufficient}
        error={generateError}
        actionLabel="Get AI feedback"
        onGenerate={handleGenerate}
        onBack={() => router.push("/coach")}
      />
    );
  }

  if (savedMessage) {
    return (
      <EmptyOutputCard
        onRetryCoaching={retryCoaching}
        onBack={() => router.push("/coach")}
        message={savedMessage}
      />
    );
  }

  // --- Form: page-level renderer ---
  function renderStep(step: StepDef) {
    if (step.kind === "person") {
      return (
        <PersonPicker
          value={(data.personName as string | undefined) ?? ""}
          onChange={(next) => setFieldValue("personName", next)}
          onPersonSelect={(id) => setPersonId(id)}
          selectedPersonId={personId}
        />
      );
    }
    if (step.kind === "textarea") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <VoiceInput
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          rows={4}
          placeholder="Type or tap the mic to speak..."
        />
      );
    }
    if (step.kind === "textarea_two_column") {
      const value = data[step.key] as TextareaTwoColumnValue | undefined;
      return (
        <TextareaTwoColumn
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          leftLabel="What did you observe?"
          rightLabel="What did you think it meant?"
          leftPlaceholder="Facts only — body, tone, exact words."
          rightPlaceholder="Your interpretation."
        />
      );
    }
    if (step.kind === "select_review_next_move") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {REVIEW_NEXT_MOVE_VALUES.map((move) => (
            <button
              key={move}
              type="button"
              onClick={() => setFieldValue(step.key, move)}
              className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                value === move
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {NEXT_MOVE_LABELS[move]}
            </button>
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />

      {/* Tier selector — Quick (3 cards) vs Deep (5 cards). The coins are
          charged when the user taps "Get AI feedback" on the saved screen, not
          here — saving the reflection is free. */}
      <TierSelector tier={tier} onChange={setTier} className="mb-4" />

      <CoachPage
        eyebrow="Review"
        eyebrowClassName="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-ink"
        pageIndex={pageIndex}
        totalPages={totalPages}
        page={currentPage}
        state={data}
        renderStep={renderStep}
        pageTitle={null}
      />
      {submitError && (
        <p className="mt-3 text-[13px] font-medium text-danger">{submitError}</p>
      )}
      <div className="mt-6 flex gap-3">
        {pageIndex > 0 && (
          <button
            onClick={handleBack}
            className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canAdvance()}
          className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {pageIndex === totalPages - 1 ? "Save reflection (free)" : "Next"}
        </button>
      </div>
    </div>
  );
}
