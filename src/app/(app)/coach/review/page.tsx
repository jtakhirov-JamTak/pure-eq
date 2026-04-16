// Pure EQ domain — replace in fork.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";

const STEPS = [
  {
    key: "personName",
    title: "Who was this conversation with?",
    prompt: "Start typing to see people you've mentioned before",
    type: "person" as const,
    optional: true,
  },
  {
    key: "whatHappened",
    title: "What actually happened in the conversation?",
    prompt: "Stick to facts. What was said and done — not interpretations yet.",
    type: "textarea" as const,
    optional: false,
  },
  {
    key: "hardestMomentFeeling",
    title: "What was the hardest moment, and what did you feel in it?",
    prompt: "Name the moment and the feeling that showed up for you.",
    type: "textarea" as const,
    optional: false,
  },
  {
    key: "observedInThem",
    title: "What did you observe in them — body, tone, words?",
    prompt: "What did you actually see or hear? Observations, not conclusions.",
    type: "textarea" as const,
    optional: false,
  },
  {
    key: "theirExperience",
    title: "Looking back, what do you think their experience was?",
    prompt: "Your best guess at what the conversation was like for them.",
    type: "textarea" as const,
    optional: false,
  },
  {
    key: "whatHelped",
    title: "What did you do that helped?",
    prompt: "Even small things — a pause, a question, an acknowledgment.",
    type: "textarea" as const,
    optional: false,
  },
  {
    key: "whatHurt",
    title: "What did you do that hurt or made it harder?",
    prompt: "Be honest. You're the only one reading this.",
    type: "textarea" as const,
    optional: false,
  },
  {
    key: "validatedAssumptions",
    title: "Did you test any assumption by asking? (optional)",
    prompt: "Skip if none. What assumption did you check, and what did you learn?",
    type: "textarea" as const,
    optional: true,
  },
  {
    key: "unresolvedAndNext",
    title: "What's still unresolved, and what's your next small move?",
    prompt: "One or two sentences is enough.",
    type: "textarea" as const,
    optional: false,
  },
];

type AiOutput = {
  how_user_likely_came_across: string;
  where_projecting: string;
  alternative_explanation: string;
  pattern_tag: string;
};

export default function ReviewPage() {
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

  async function handleSubmit() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/coach/review", {
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
      console.error("review submit failed", (err as Error)?.message);
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
        <h2 className="text-xl font-bold text-zinc-900">Your Review Reflection</h2>
        <div className="mt-6 space-y-5">
          {[
            {
              label: "How you likely came across",
              key: "how_user_likely_came_across",
            },
            { label: "Where you may be projecting", key: "where_projecting" },
            {
              label: "An alternative explanation",
              key: "alternative_explanation",
            },
          ].map(({ label, key }) => (
            <div key={key}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                {label}
              </p>
              <p className="mt-1 text-base text-zinc-800">
                {aiOutput[key as keyof AiOutput] || "—"}
              </p>
            </div>
          ))}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
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
            Generating your review reflection...
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
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            onPersonSelect={(id) => setPersonId(id)}
            selectedPersonId={personId}
          />
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
        <button
          onClick={handleNext}
          disabled={!canAdvance}
          className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white disabled:opacity-40"
        >
          {step === STEPS.length - 1
            ? "Get Reflection"
            : currentStep.optional && !value.trim()
            ? "Skip"
            : "Next"}
        </button>
      </div>
    </div>
  );
}
