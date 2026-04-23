"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { safeUUID } from "@/lib/utils";

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

const TriggeredBackground = () => <SkyBackground variant="calm" />;

export default function TriggeredClient() {
  const router = useRouter();
  const [step, setStep] = useState(-1);
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
    idempotencyKeyRef.current = safeUUID();
  }

  const totalSteps = STEPS.length + 1;

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

  if (submitError && !submitting) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <TriggeredBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Save failed
        </h2>
        <p className="mt-3 text-[14px] font-medium text-danger">{submitError}</p>
        <button
          onClick={() => afterFeeling && handleSubmit(afterFeeling)}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/tools")}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
        >
          Back to Tools
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <TriggeredBackground />
        <h2
          className="font-display text-[30px] leading-[1.12] text-ink"
          style={{ letterSpacing: "-0.7px" }}
        >
          Trigger log <span className="italic">saved</span>.
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your trigger entry has been saved. Over time, these entries help
          surface patterns in how you respond to difficult moments.
        </p>
        <button
          onClick={() => router.push("/tools")}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <TriggeredBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-trigger" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Saving your entry…
          </p>
        </div>
      </div>
    );
  }

  if (step === -1) {
    return (
      <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <TriggeredBackground />
        <span
          className="inline-block rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[1.2px] text-white"
          style={{ backgroundColor: "var(--color-trigger)" }}
        >
          Triggered
        </span>
        <h2
          className="mt-3 font-display text-[32px] leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.9px" }}
        >
          Catch the <span className="italic">spark</span>.
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Log a trigger in real time so you can understand your pattern, calm
          down, and see the situation more clearly.
        </p>
        <p className="mt-2 text-[13px] font-medium text-ink-soft">
          This entry will also be used to generate coaching insights over time.
        </p>
        <button
          onClick={() => setStep(0)}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Start
        </button>
        <button
          onClick={() => router.push("/tools")}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center px-4 text-[13px] font-medium text-ink-soft underline active:opacity-70"
        >
          Back to Tools
        </button>
      </div>
    );
  }

  if (step === STEPS.length) {
    return (
      <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <TriggeredBackground />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
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
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {step + 1} / {totalSteps}
        </p>

        <h2
          className="mt-5 font-display text-[26px] leading-[1.12] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          How do you feel now?
        </h2>
        {submitError && (
          <p className="mt-2 text-[13px] font-medium text-danger">
            {submitError}
          </p>
        )}
        <div className="mt-5 space-y-2">
          {AFTER_FEELINGS.map((feeling) => (
            <button
              key={feeling}
              onClick={() => handleSubmit(feeling)}
              className={`flex h-12 w-full items-center rounded-card-sm px-4 text-[14px] font-semibold transition active:scale-[0.99] ${
                afterFeeling === feeling
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {feeling}
            </button>
          ))}
        </div>
        <button
          onClick={() => setStep(STEPS.length - 1)}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
        >
          Back
        </button>
      </div>
    );
  }

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
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <TriggeredBackground />

      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
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
        <span
          className="inline-block rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-white"
          style={{ backgroundColor: "var(--color-trigger)" }}
        >
          Triggered
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {step + 1} / {totalSteps}
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
            <div className="rounded-card-sm bg-surface p-4 shadow-soft">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-ink">
                  Intensity
                </span>
                <span
                  className="font-display text-[20px] leading-none"
                  style={{ color: "var(--color-trigger)" }}
                >
                  {emotionIntensity}
                  <span className="text-ink-soft text-[13px]">/10</span>
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={emotionIntensity}
                onChange={(e) => setEmotionIntensity(Number(e.target.value))}
                className="mt-3 h-11 w-full"
                style={{ accentColor: "var(--color-trigger)" }}
              />
              <div className="flex justify-between text-[11px] font-semibold text-ink-soft">
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
            <div className="rounded-card-sm bg-surface p-4 shadow-soft">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-ink">
                  Intensity
                </span>
                <span
                  className="font-display text-[20px] leading-none"
                  style={{ color: "var(--color-trigger)" }}
                >
                  {urgeIntensity}
                  <span className="text-ink-soft text-[13px]">/10</span>
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={urgeIntensity}
                onChange={(e) => setUrgeIntensity(Number(e.target.value))}
                className="mt-3 h-11 w-full"
                style={{ accentColor: "var(--color-trigger)" }}
              />
              <div className="flex justify-between text-[11px] font-semibold text-ink-soft">
                <span>1 — mild</span>
                <span>10 — overwhelming</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setStep(step - 1)}
          className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
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
          className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          Next
        </button>
      </div>
    </div>
  );
}
