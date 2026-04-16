// Pure EQ domain — replace in fork.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";

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
  repair_strategy: string;
  thing_not_to_say: string;
  recommended_timing: string;
  next_move_if_poorly_received: string;
  pattern_tag: string;
};

export default function RepairPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
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
    handleSubmit();
  }

  // AI output screen
  if (aiOutput) {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Your Repair Strategy</h2>
        <div className="mt-6 space-y-5">
          {[
            { label: "Best repair strategy", key: "repair_strategy" },
            { label: "Thing not to say", key: "thing_not_to_say" },
            { label: "Recommended timing", key: "recommended_timing" },
            {
              label: "If they respond poorly",
              key: "next_move_if_poorly_received",
            },
          ].map(({ label, key }) => (
            <div key={key}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {label}
              </p>
              <p className="mt-1 text-base text-zinc-800">
                {aiOutput[key as keyof AiOutput] || "\u2014"}
              </p>
            </div>
          ))}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Pattern noticed
            </p>
            <span className="mt-2 inline-flex items-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
              {aiOutput.pattern_tag.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        <button
          onClick={() => router.push("/coach")}
          className="mt-10 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Done
        </button>
      </div>
    );
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
          <PersonPicker
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            onPersonSelect={(id) => setPersonId(id)}
            selectedPersonId={personId}
          />
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
