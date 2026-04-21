// Pure EQ domain — replace in fork.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import ThreadPicker from "@/components/thread-picker";
import { isLegacyV1 } from "@/lib/coach/output-shape";

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

// Field-presence-based render: payload shape varies by PROMPT_VERSION.
// pattern_tag is on the server payload for extraction but never rendered,
// so it's not modeled here.
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

// Renders legacy v1 Repair output — the current shape until Coach v2
// ships. Extracted from the parent's aiOutput-truthy branch so the
// parent can dispatch to a v2 renderer once that shape lands. Visual
// output unchanged.
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
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Entry saved</h2>
        <p className="mt-4 text-base text-zinc-700">
          Your entry is saved, but no repair strategy is available to show
          for this one.
        </p>
        <button
          onClick={onRetryCoaching}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Try again for repair strategy
        </button>
        <button
          onClick={onBack}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
        >
          Back to Coach
        </button>
      </div>
    );
  }
  return (
    <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <h2 className="text-xl font-bold text-zinc-900">Your Repair Strategy</h2>
      <div className="mt-6 space-y-5">
        {visible.map(({ label, key }) => (
          <div key={key}>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {label}
            </p>
            <p className="mt-1 text-base text-zinc-800">{output[key]}</p>
          </div>
        ))}
      </div>

      {/* Repair Outcome Tracking */}
      {repairEntryId && !outcomeSaved && (
        <div className="mt-8 border-t border-zinc-200 pt-6">
          <p className="text-sm font-medium text-zinc-700">
            How did the repair go?
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Optional — helps track what works over time.
          </p>
          <div className="mt-4 space-y-4">
            {REPAIR_OUTCOME_QUESTIONS.map((q) => (
              <div key={q.key}>
                <p className="text-sm text-zinc-700">{q.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onOutcomeChange(q.key, opt.value)}
                      className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                        outcomeData[q.key] === opt.value
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
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
              className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-800 text-base font-medium text-white"
            >
              Save Outcome
            </button>
          )}
          {outcomeError && (
            <p className="mt-2 text-sm text-red-600">
              Could not save outcome. Try again.
            </p>
          )}
        </div>
      )}

      {outcomeSaved && (
        <p className="mt-6 text-sm text-zinc-500">Outcome saved.</p>
      )}

      <button
        onClick={onBack}
        className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
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
  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = crypto.randomUUID();
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
            "Your entry is saved. Coaching feedback wasn't available this time."
        );
      }
    } catch (err) {
      console.error("repair submit failed", (err as Error)?.message);
      setSubmitError(
        "Could not save. Check your connection and try again."
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

  const [outcomeError, setOutcomeError] = useState(false);

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
    (q) => outcomeData[q.key]
  );

  // AI output screen — dispatch by output shape.
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
    // Coach v2 (mode: "normal" / "refusal") rendering lands in a later
    // commit. Today no stored output carries `mode`, so this branch is
    // unreachable.
    return null;
  }

  // Saved but no AI feedback screen
  if (savedMessage) {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Entry saved</h2>
        <p className="mt-4 text-base text-zinc-700">{savedMessage}</p>
        <button
          onClick={retryCoaching}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Try again for coaching feedback
        </button>
        <button
          onClick={() => router.push("/coach")}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
        >
          Back to Coach
        </button>
      </div>
    );
  }

  // Loading screen
  if (submitting) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-sm text-zinc-500">
            Generating your repair strategy...
          </p>
        </div>
      </div>
    );
  }

  // Step form
  return (
    <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i <= step ? "bg-zinc-900" : "bg-zinc-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Step {step + 1} of {STEPS.length}
      </p>

      {/* Question */}
      <h2 className="mt-6 text-lg font-semibold text-zinc-900">
        {currentStep.title}
      </h2>
      {currentStep.prompt && (
        <p className="mt-1 text-sm text-zinc-500">{currentStep.prompt}</p>
      )}

      {/* Input */}
      <div className="mt-4">
        {currentStep.type === "person" ? (
          <>
            <PersonPicker
              key={currentStep.key}
              value={value}
              onChange={(next) => setFieldValue(currentStep.key, next)}
              onPersonSelect={(id) => { setPersonId(id); setThreadId(null); }}
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
                className={`flex h-11 w-full items-center rounded-lg border px-4 text-base transition-colors ${
                  value === opt.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
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
        <p className="mt-3 text-sm text-red-600">{submitError}</p>
      )}

      {/* Navigation — hide for select steps (auto-advance) */}
      {currentStep.type !== "select" && (
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white disabled:opacity-40"
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
