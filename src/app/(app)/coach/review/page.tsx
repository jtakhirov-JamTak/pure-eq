"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { StormBackground } from "@/components/brand/StormBackground";
import {
  TextareaTwoColumn,
  type TextareaTwoColumnValue,
} from "@/components/coach/steps/textarea-two-column";
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
import { REVIEW_NEXT_MOVE_VALUES } from "@/types";
import type { AiTier, ReviewNextMove } from "@/types";
import {
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
// Redesign §5: the 3 pages stay as the progress MODEL (3 section dots); the
// user advances one question at a time across the flattened questions.
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
    <ReadingScreen>
      <Kicker className="text-accent-ink">Review · Complete</Kicker>
      <h1
        className="mt-3 text-[24px] font-medium leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        Your reflection.
      </h1>
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
            <Card key={key} className="animate-card-in">
              <Kicker>{label}</Kicker>
              <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                {text}
              </p>
            </Card>
          );
        })}
      </div>
      <PrimaryButton onClick={onBack} className="mt-8">
        Done
      </PrimaryButton>
    </ReadingScreen>
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
    <ReadingScreen>
      <h1
        className="text-[24px] font-medium leading-[1.18] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        Reflection saved
      </h1>
      <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
        {message ??
          "Your reflection is saved, but no coaching feedback is available to show for this one."}
      </p>
      <PrimaryButton onClick={onRetryCoaching} className="mt-8">
        Try again for coaching feedback
      </PrimaryButton>
      <SecondaryButton onClick={onBack} className="mt-3 w-full">
        Back to Coach
      </SecondaryButton>
    </ReadingScreen>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
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

  // One-question-per-screen sequence (redesign §5). Recomputed from `data`
  // each render; clamp the index when the list could shrink.
  const steps = flattenVisibleSteps(REVIEW_PAGES, data);
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
      handleSave();
    }
  }

  function handleBack() {
    if (safeIndex > 0) setStepIndex(safeIndex - 1);
    else router.push("/coach");
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
        <StormBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-hairline-strong border-t-accent" />
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
        background={<StormBackground />}
        eyebrow={<Kicker className="text-accent-ink">Review</Kicker>}
        title="Saved."
        blurb="Your reflection is saved — it's yours to keep. Get AI coaching feedback whenever you're ready."
        tier={tier}
        onTierChange={(t) => {
          setTier(t);
          setInsufficient(null);
          setGenerateError(null);
        }}
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

  // --- Form: one question per screen (no-scroll FlowScreen) ---
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
          fill
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
          fill
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
            <SelectableRow
              key={move}
              selected={value === move}
              onClick={() => setFieldValue(step.key, move)}
            >
              {NEXT_MOVE_LABELS[move]}
            </SelectableRow>
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <FlowScreen
      header={
        <FlowHeader
          onBack={handleBack}
          eyebrow="Review"
          counter={`${safeIndex + 1} / ${steps.length}`}
          dots={
            <ProgressDots
              total={REVIEW_PAGES.length}
              current={current.sectionIndex}
            />
          }
        />
      }
      footer={
        <FlowFooter
          onBack={safeIndex > 0 ? handleBack : undefined}
          primaryLabel={isLastStep ? "Save reflection" : "Next"}
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
