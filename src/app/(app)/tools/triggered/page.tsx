// Pure EQ domain — replace in fork.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";

const AFTER_FEELINGS = [
  "Calmer",
  "Lighter",
  "Hopeful",
  "Relieved",
  "Energized",
  "Same",
];

const STEPS = [
  {
    key: "trigger",
    title: "What happened?",
    prompt: "Focus on the facts only — what actually occurred?",
    type: "textarea" as const,
  },
  {
    key: "interpretation",
    title: "What story did you tell yourself?",
    prompt: "What meaning did you make of what happened? Be honest.",
    type: "textarea" as const,
  },
  {
    key: "emotion",
    title: "What did you feel?",
    prompt: "Name the emotion.",
    type: "emotion" as const,
  },
  {
    key: "urge",
    title: "What did you want to do?",
    prompt: "What was your immediate urge?",
    type: "urge" as const,
  },
  {
    key: "behavior",
    title: "What did you actually do?",
    prompt: null,
    type: "textarea" as const,
  },
  {
    key: "outcome",
    title: "What happened as a result?",
    prompt: null,
    type: "textarea" as const,
  },
  {
    key: "reflection",
    title: "What did you learn?",
    prompt: "Are you calm now? What would you do differently?",
    type: "textarea" as const,
  },
];

export default function TriggeredPage() {
  const router = useRouter();
  const [step, setStep] = useState(-1); // -1 = intro
  const [data, setData] = useState<Record<string, string>>({});
  const [emotionIntensity, setEmotionIntensity] = useState(5);
  const [urgeIntensity, setUrgeIntensity] = useState(5);
  const [afterFeeling, setAfterFeeling] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  const totalSteps = STEPS.length + 1; // +1 for close step

  function setFieldValue(key: string, next: string) {
    setData((d) => ({ ...d, [key]: next }));
  }

  async function handleSubmit(feeling: string) {
    if (submitRef.current) return;
    submitRef.current = true;
    setAfterFeeling(feeling);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/tools/triggered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: data.trigger,
          interpretation: data.interpretation,
          emotion: data.emotion,
          emotionIntensity,
          urge: data.urge,
          urgeIntensity,
          behavior: data.behavior,
          outcome: data.outcome,
          reflection: data.reflection,
          afterFeeling: feeling,
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
      setSuccess(true);
    } catch (err) {
      console.error("triggered submit failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  // ── Error screen ──
  if (submitError && !submitting) {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Save failed</h2>
        <p className="mt-4 text-base text-red-600">{submitError}</p>
        <button
          onClick={() => afterFeeling && handleSubmit(afterFeeling)}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/tools")}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
        >
          Back to Tools
        </button>
      </div>
    );
  }

  // ── Success screen ──
  if (success) {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Trigger log saved</h2>
        <p className="mt-4 text-base text-zinc-700">
          Your trigger entry has been saved. Over time, these entries help
          surface patterns in how you respond to difficult moments.
        </p>
        <button
          onClick={() => router.push("/tools")}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Done
        </button>
      </div>
    );
  }

  // ── Loading screen ──
  if (submitting) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-sm text-zinc-500">Saving your entry...</p>
        </div>
      </div>
    );
  }

  // ── Intro ──
  if (step === -1) {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">
          I&apos;m Triggered
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Use this tool to log a trigger in real time so you can understand
          your pattern, calm down, and see the situation more clearly.
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          This entry will also be used to generate coaching insights over time.
        </p>
        <button
          onClick={() => setStep(0)}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Start
        </button>
        <button
          onClick={() => router.push("/tools")}
          className="mt-3 flex h-11 w-full items-center justify-center text-sm text-zinc-400 underline"
        >
          Back to Tools
        </button>
      </div>
    );
  }

  // ── Close step (after feeling) ──
  if (step === STEPS.length) {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= step ? "bg-zinc-900" : "bg-zinc-200"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Step {step + 1} of {totalSteps}
        </p>

        <h2 className="mt-6 text-lg font-semibold text-zinc-900">
          How do you feel now?
        </h2>
        {submitError && (
          <p className="mt-2 text-sm text-red-600">{submitError}</p>
        )}
        <div className="mt-4 space-y-3">
          {AFTER_FEELINGS.map((feeling) => (
            <button
              key={feeling}
              onClick={() => handleSubmit(feeling)}
              className={`flex h-11 w-full items-center rounded-lg border px-4 text-base transition-colors ${
                afterFeeling === feeling
                  ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                  : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
              }`}
            >
              {feeling}
            </button>
          ))}
        </div>
        <button
          onClick={() => setStep(STEPS.length - 1)}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
        >
          Back
        </button>
      </div>
    );
  }

  // ── Step form ──
  const currentStep = STEPS[step];
  const value = data[currentStep.key] || "";

  function handleNext() {
    if (currentStep.type === "emotion" && !data.emotion?.trim()) return;
    if (currentStep.type === "urge" && !data.urge?.trim()) return;
    if (currentStep.type === "textarea" && !value.trim()) return;
    if (step < STEPS.length) {
      setStep(step + 1);
    }
  }

  return (
    <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i <= step ? "bg-zinc-900" : "bg-zinc-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Step {step + 1} of {totalSteps}
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
        {currentStep.type === "textarea" && (
          <VoiceInput
            key={currentStep.key}
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            rows={4}
            placeholder="Type or tap the mic to speak..."
          />
        )}

        {currentStep.type === "emotion" && (
          <div className="space-y-4">
            <VoiceInput
              key={currentStep.key}
              value={data.emotion || ""}
              onChange={(next) => setFieldValue("emotion", next)}
              rows={2}
              placeholder="Name the emotion..."
            />
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Intensity: {emotionIntensity}/10
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={emotionIntensity}
                onChange={(e) => setEmotionIntensity(Number(e.target.value))}
                className="mt-2 h-11 w-full accent-zinc-900"
              />
              <div className="flex justify-between text-xs text-zinc-400">
                <span>1 — mild</span>
                <span>10 — overwhelming</span>
              </div>
            </div>
          </div>
        )}

        {currentStep.type === "urge" && (
          <div className="space-y-4">
            <VoiceInput
              key={currentStep.key}
              value={data.urge || ""}
              onChange={(next) => setFieldValue("urge", next)}
              rows={2}
              placeholder="What was your urge?"
            />
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Intensity: {urgeIntensity}/10
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={urgeIntensity}
                onChange={(e) => setUrgeIntensity(Number(e.target.value))}
                className="mt-2 h-11 w-full accent-zinc-900"
              />
              <div className="flex justify-between text-xs text-zinc-400">
                <span>1 — mild</span>
                <span>10 — overwhelming</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setStep(step - 1)}
          className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={
            (currentStep.type === "textarea" && !value.trim()) ||
            (currentStep.type === "emotion" && !data.emotion?.trim()) ||
            (currentStep.type === "urge" && !data.urge?.trim())
          }
          className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
