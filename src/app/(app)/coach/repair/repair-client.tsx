"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import ThreadPicker from "@/components/thread-picker";
import { isLegacyV1 } from "@/lib/coach/output-shape";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { safeUUID } from "@/lib/utils";

const DESIRED_OUTCOMES = [
  { value: "acknowledge_impact", label: "Acknowledge impact" },
  { value: "apologize", label: "Apologize" },
  { value: "reset_expectations", label: "Reset expectations" },
  { value: "set_boundary", label: "Set a boundary" },
] as const;

const CHANNELS = [
  { value: "text", label: "Text" },
  { value: "call", label: "Call" },
  { value: "in_person", label: "In person" },
  { value: "no_action", label: "No action" },
] as const;

const TIMINGS = [
  { value: "now", label: "Now" },
  { value: "later_today", label: "Later today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "after_they_respond", label: "After they respond" },
] as const;

type StepDef = {
  key: string;
  title: string;
  prompt?: string;
  type: "person" | "textarea" | "select";
  optional?: boolean;
  options?: readonly { value: string; label: string }[];
};

const STEPS: StepDef[] = [
  {
    key: "personName",
    title: "Who do you need to repair things with?",
    prompt: "Start typing to see people you've mentioned before",
    type: "person",
    optional: true,
  },
  {
    key: "whatNeedsRepair",
    title: "What needs repair most right now?",
    type: "textarea",
  },
  {
    key: "yourResponsibility",
    title: "What part is yours to own?",
    prompt: "What are you responsible for here?",
    type: "textarea",
  },
  {
    key: "theirNeed",
    title: "What do you think they most need first from you?",
    type: "textarea",
  },
  {
    key: "desiredOutcome",
    title: "What outcome do you want from this repair attempt?",
    type: "select",
    options: DESIRED_OUTCOMES,
  },
  {
    key: "channel",
    title: "What channel makes the most sense?",
    type: "select",
    options: CHANNELS,
  },
  {
    key: "timing",
    title: "What timing makes the most sense?",
    type: "select",
    options: TIMINGS,
  },
];

type AiOutput = {
  repair_strategy?: string;
  thing_not_to_say?: string;
  recommended_timing?: string;
};

const REPAIR_OUTCOME_QUESTIONS = [
  {
    key: "attemptedRepair",
    title: "Did you attempt repair?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "planned", label: "Planned" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "howReceived",
    title: "How was it received?",
    options: [
      { value: "positive", label: "Positive" },
      { value: "mixed", label: "Mixed" },
      { value: "negative", label: "Negative" },
      { value: "no_response", label: "No response" },
      { value: "too_early", label: "Too early" },
    ],
  },
  {
    key: "understandingImproved",
    title: "Did understanding improve?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "partly", label: "Partly" },
      { value: "no", label: "No" },
      { value: "unclear", label: "Unclear" },
    ],
  },
] as const;

const RepairBackground = () => <SkyBackground variant="calm" />;

function LegacyV1RepairCard({
  output,
  repairEntryId,
  outcomeData,
  onOutcomeChange,
  outcomeSaved,
  outcomeError,
  allOutcomeAnswered,
  onSaveOutcome,
  onRetryCoaching,
  onBack,
}: {
  output: AiOutput;
  repairEntryId: string | null;
  outcomeData: Record<string, string>;
  onOutcomeChange: (key: string, value: string) => void;
  outcomeSaved: boolean;
  outcomeError: boolean;
  allOutcomeAnswered: boolean;
  onSaveOutcome: () => void;
  onRetryCoaching: () => void;
  onBack: () => void;
}) {
  const REPAIR_FIELDS: { label: string; key: keyof AiOutput }[] = [
    { label: "Repair strategy", key: "repair_strategy" },
    { label: "Thing not to say", key: "thing_not_to_say" },
    { label: "Timing", key: "recommended_timing" },
  ];
  const visible = REPAIR_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (visible.length === 0) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <RepairBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Entry saved
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your entry is saved, but no repair strategy is available to show for
          this one.
        </p>
        <button
          onClick={onRetryCoaching}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Try again for repair strategy
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
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <RepairBackground />
      <span className="inline-block rounded-pill bg-surface-tint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink">
        Repair
      </span>
      <h2
        className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Your <span className="italic">repair</span> strategy.
      </h2>
      <div className="mt-5 space-y-3">
        {visible.map(({ label, key }) => (
          <div
            key={key}
            className="rounded-card-sm bg-surface p-4 shadow-soft"
          >
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
              {label}
            </p>
            <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
              {output[key]}
            </p>
          </div>
        ))}
      </div>

      {repairEntryId && !outcomeSaved && (
        <div className="mt-6 rounded-card-sm bg-surface p-4 shadow-soft">
          <p className="text-[13px] font-bold text-ink">How did the repair go?</p>
          <p className="mt-1 text-[12px] font-medium text-ink-soft">
            Optional — helps track what works over time.
          </p>
          <div className="mt-4 space-y-3">
            {REPAIR_OUTCOME_QUESTIONS.map((q) => (
              <div key={q.key}>
                <p className="text-[13px] font-semibold text-ink-soft">
                  {q.title}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onOutcomeChange(q.key, opt.value)}
                      className={`rounded-pill px-3.5 py-2 text-[13px] font-semibold transition ${
                        outcomeData[q.key] === opt.value
                          ? "bg-brand text-white shadow-cta"
                          : "bg-surface-tint text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {allOutcomeAnswered && (
            <button
              onClick={onSaveOutcome}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-pill bg-brand-deep text-[14px] font-bold text-white shadow-cta active:scale-[0.98]"
            >
              Save outcome
            </button>
          )}
          {outcomeError && (
            <p className="mt-2 text-[13px] font-medium text-danger">
              Could not save outcome. Try again.
            </p>
          )}
        </div>
      )}

      {outcomeSaved && (
        <p className="mt-6 text-[13px] font-medium text-ink-soft">
          Outcome saved.
        </p>
      )}

      <button
        onClick={onBack}
        className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  );
}

export default function RepairClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [repairEntryId, setRepairEntryId] = useState<string | null>(null);
  const [outcomeData, setOutcomeData] = useState<Record<string, string>>({});
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  const [outcomeError, setOutcomeError] = useState(false);
  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
  }

  const currentStep = STEPS[step];
  const value = data[currentStep.key] || "";
  const canAdvance = currentStep.optional || value.trim().length > 0;

  function setFieldValue(key: string, next: string) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function handleNext() {
    if (!canAdvance) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit(overrideData?: Record<string, string>) {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const payload = overrideData ?? data;
    try {
      const res = await fetch("/api/coach/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          personId: personId || null,
          threadId: threadId || null,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      if (res.status === 403) {
        router.push("/paywall");
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (result.repairEntryId) {
        setRepairEntryId(result.repairEntryId);
      }
      if (result.aiOutput) {
        setAiOutput(result.aiOutput);
      } else {
        setSavedMessage(
          result.message ??
            "Your entry is saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("repair submit failed", (err as Error)?.message);
      setSubmitError(
        "Could not save. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  function retryCoaching() {
    setSavedMessage(null);
    setAiOutput(null);
    handleSubmit();
  }

  async function submitOutcome() {
    if (!repairEntryId) return;
    setOutcomeError(false);
    try {
      const res = await fetch("/api/coach/repair/outcome", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repairEntryId,
          ...outcomeData,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setOutcomeSaved(true);
    } catch {
      setOutcomeError(true);
    }
  }

  const allOutcomeAnswered = REPAIR_OUTCOME_QUESTIONS.every(
    (q) => outcomeData[q.key],
  );

  if (aiOutput) {
    if (isLegacyV1(aiOutput)) {
      return (
        <LegacyV1RepairCard
          output={aiOutput}
          repairEntryId={repairEntryId}
          outcomeData={outcomeData}
          onOutcomeChange={(key, val) =>
            setOutcomeData((d) => ({ ...d, [key]: val }))
          }
          outcomeSaved={outcomeSaved}
          outcomeError={outcomeError}
          allOutcomeAnswered={allOutcomeAnswered}
          onSaveOutcome={submitOutcome}
          onRetryCoaching={retryCoaching}
          onBack={() => router.push("/coach")}
        />
      );
    }
    // Unknown output shape — fall through to empty-fields card so the user
    // lands on a page with Back + Retry, not a blank screen.
    return (
      <LegacyV1RepairCard
        output={{}}
        repairEntryId={repairEntryId}
        outcomeData={outcomeData}
        onOutcomeChange={(key, val) =>
          setOutcomeData((d) => ({ ...d, [key]: val }))
        }
        outcomeSaved={outcomeSaved}
        outcomeError={outcomeError}
        allOutcomeAnswered={allOutcomeAnswered}
        onSaveOutcome={submitOutcome}
        onRetryCoaching={retryCoaching}
        onBack={() => router.push("/coach")}
      />
    );
  }

  if (savedMessage) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <RepairBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Entry saved
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          {savedMessage}
        </p>
        <button
          onClick={retryCoaching}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Try again for coaching feedback
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

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <RepairBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Generating your repair strategy…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <RepairBackground />

      <div className="flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < step
                ? "bg-brand"
                : i === step
                  ? "bg-brand-deep"
                  : "bg-white/60"
            }`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="inline-block rounded-pill bg-surface-tint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink">
          Repair
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {step + 1} / {STEPS.length}
        </p>
      </div>

      <h2
        className="mt-5 font-display text-[26px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        {currentStep.title}
      </h2>
      {currentStep.prompt && (
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          {currentStep.prompt}
        </p>
      )}

      <div className="mt-5">
        {currentStep.type === "person" ? (
          <>
            <PersonPicker
              key={currentStep.key}
              value={value}
              onChange={(next) => setFieldValue(currentStep.key, next)}
              onPersonSelect={(id) => {
                setPersonId(id);
                setThreadId(null);
              }}
              selectedPersonId={personId}
            />
            <ThreadPicker
              personId={personId}
              value={threadId}
              onChange={setThreadId}
            />
          </>
        ) : currentStep.type === "select" ? (
          <div className="space-y-2">
            {currentStep.options?.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setFieldValue(currentStep.key, opt.value);
                  if (step < STEPS.length - 1) {
                    setStep(step + 1);
                  } else {
                    handleSubmit({ ...data, [currentStep.key]: opt.value });
                  }
                }}
                className={`flex h-12 w-full items-center rounded-card-sm px-4 text-[14px] font-semibold transition active:scale-[0.99] ${
                  value === opt.value
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <VoiceInput
            key={currentStep.key}
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            rows={4}
            placeholder="Type or tap the mic to speak..."
          />
        )}
      </div>
      {submitError && (
        <p className="mt-3 text-[13px] font-medium text-danger">{submitError}</p>
      )}

      {currentStep.type !== "select" && (
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            {step === STEPS.length - 1
              ? "Get Strategy"
              : currentStep.optional && !value.trim()
                ? "Skip"
                : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
