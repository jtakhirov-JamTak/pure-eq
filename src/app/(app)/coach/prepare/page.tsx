// Pure EQ domain — replace in fork.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import type { RelationshipDomain } from "@/types";

const RELATIONSHIPS: { value: RelationshipDomain; label: string }[] = [
  { value: "partner", label: "Partner" },
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "manager", label: "Manager" },
  { value: "direct_report", label: "Direct Report" },
  { value: "coworker", label: "Coworker" },
  { value: "client", label: "Client" },
  { value: "other", label: "Other" },
];

const STEPS = [
  {
    key: "personName",
    title: "Who is this with?",
    prompt: "Start typing to see people you've mentioned before",
    type: "person" as const,
  },
  {
    key: "relationship",
    title: "What is your relationship?",
    prompt: null,
    type: "select" as const,
  },
  {
    key: "situation",
    title: "What is this conversation about?",
    prompt: "Describe the situation in facts only. What needs to be discussed?",
    type: "textarea" as const,
  },
  {
    key: "desiredOutcome",
    title: "What outcome do you want from this conversation?",
    prompt: "What do you want by the end? What would 'good enough' look like?",
    type: "textarea" as const,
  },
  {
    key: "primaryEmotion",
    title: "What is the main emotion you are most likely to feel going in?",
    prompt: "Name 1 emotion and why.",
    type: "textarea" as const,
  },
  {
    key: "defaultPattern",
    title: "When you feel that way, what do you usually do that gets in the way?",
    prompt: "What is your likely default pattern here?",
    type: "textarea" as const,
  },
  {
    key: "otherPersonHypothesis",
    title: "What do you think may be going on for them — and what makes you think that?",
    prompt: "What is your best guess about what may be happening for them, and what evidence do you actually have?",
    type: "textarea" as const,
  },
  {
    key: "realityCheckQuestion",
    title: "What question can you ask to test your read instead of assuming?",
    prompt: null,
    type: "textarea" as const,
  },
  {
    key: "triggerPlan",
    title: "If you get triggered, what will you do instead?",
    prompt: "Complete this: If I notice myself feeling ___, then I will ___.",
    type: "textarea" as const,
  },
];

// Field-presence-based render: payload shape varies by PROMPT_VERSION.
type AiOutput = {
  reality_check_question?: string;
  thing_not_to_do?: string;
  best_next_move?: string;
};

export default function PreparePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const submitRef = useRef(false);
  // Same idempotency key for every retry of this submission, so the server
  // reuses rows instead of duplicating them. Reset on navigate-away.
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  const currentStep = STEPS[step];
  const value = data[currentStep.key] || "";

  function setFieldValue(key: string, next: string) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function handleNext() {
    if (!value.trim()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/coach/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
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
      console.error("prepare submit failed", (err as Error)?.message);
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

  // AI output screen
  if (aiOutput) {
    const PREPARE_FIELDS: { label: string; key: keyof AiOutput }[] = [
      { label: "Reality-check question", key: "reality_check_question" },
      { label: "Thing not to do", key: "thing_not_to_do" },
      { label: "Best next move", key: "best_next_move" },
    ];
    const visible = PREPARE_FIELDS.filter(({ key }) => {
      const v = aiOutput[key];
      return typeof v === "string" && v.trim().length > 0;
    });
    if (visible.length === 0) {
      return (
        <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <h2 className="text-xl font-bold text-zinc-900">Entry saved</h2>
          <p className="mt-4 text-base text-zinc-700">
            Your entry is saved, but no coaching feedback is available to show
            for this one.
          </p>
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
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Your Prepare Feedback</h2>
        <div className="mt-6 space-y-5">
          {visible.map(({ label, key }) => (
            <div key={key}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {label}
              </p>
              <p className="mt-1 text-base text-zinc-800">{aiOutput[key]}</p>
            </div>
          ))}
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
            Generating your coaching feedback...
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
      <p className="mt-2 text-xs text-zinc-400">
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
            key={currentStep.key}
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            onPersonSelect={(id, relationship) => {
              setPersonId(id);
              // Auto-fill relationship when selecting an existing person
              if (id && relationship) {
                setFieldValue("relationship", relationship);
              }
            }}
            selectedPersonId={personId}
          />
        ) : currentStep.type === "select" ? (
          <div className="space-y-3">
            {RELATIONSHIPS.map((rel) => (
              <button
                key={rel.value}
                onClick={() => {
                  setFieldValue(currentStep.key, rel.value);
                  setStep(step + 1);
                }}
                className={`flex h-11 w-full items-center rounded-lg border px-4 text-base transition-colors ${
                  value === rel.value
                    ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                    : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {rel.label}
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

      {/* Navigation */}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
          >
            Back
          </button>
        )}
        {currentStep.type !== "select" && (
          <button
            onClick={handleNext}
            disabled={!value.trim()}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white disabled:opacity-40"
          >
            {step === STEPS.length - 1 ? "Get Feedback" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
