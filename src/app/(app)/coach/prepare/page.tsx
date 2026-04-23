"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { isLegacyV1 } from "@/lib/coach/output-shape";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { StepDots } from "@/components/brand/StepDots";
import { safeUUID } from "@/lib/utils";
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
    title:
      "When you feel that way, what do you usually do that gets in the way?",
    prompt: "What is your likely default pattern here?",
    type: "textarea" as const,
  },
  {
    key: "otherPersonHypothesis",
    title:
      "What do you think may be going on for them — and what makes you think that?",
    prompt:
      "What is your best guess about what may be happening for them, and what evidence do you actually have?",
    type: "textarea" as const,
  },
  {
    key: "realityCheckQuestion",
    title:
      "What question can you ask to test your read instead of assuming?",
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

type AiOutput = {
  reality_check_question?: string;
  thing_not_to_do?: string;
  best_next_move?: string;
};

const PrepareBackground = () => <SkyBackground variant="calm" />;

function LegacyV1PrepareCard({
  output,
  onRetryCoaching,
  onBack,
}: {
  output: AiOutput;
  onRetryCoaching: () => void;
  onBack: () => void;
}) {
  const PREPARE_FIELDS: { label: string; key: keyof AiOutput }[] = [
    { label: "Reality-check question", key: "reality_check_question" },
    { label: "Thing not to do", key: "thing_not_to_do" },
    { label: "Best next move", key: "best_next_move" },
  ];
  const visible = PREPARE_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (visible.length === 0) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <PrepareBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Entry saved
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your entry is saved, but no coaching feedback is available to show
          for this one.
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
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <span className="inline-block rounded-pill bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-white">
        Prepare
      </span>
      <h2
        className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Your <span className="italic">feedback</span>.
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
      <button
        onClick={onBack}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  );
}

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
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
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
            "Your entry is saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("prepare submit failed", (err as Error)?.message);
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

  if (aiOutput) {
    if (isLegacyV1(aiOutput)) {
      return (
        <LegacyV1PrepareCard
          output={aiOutput}
          onRetryCoaching={retryCoaching}
          onBack={() => router.push("/coach")}
        />
      );
    }
    // Unknown output shape (e.g. a future Coach v2 payload without a renderer
    // yet). Don't leave the user on a blank screen — fall through to the same
    // empty-fields card the v1 renderer uses.
    return (
      <LegacyV1PrepareCard
        output={{}}
        onRetryCoaching={retryCoaching}
        onBack={() => router.push("/coach")}
      />
    );
  }

  if (savedMessage) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <PrepareBackground />
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
        <PrepareBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Generating your coaching feedback…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />

      <div className="flex items-center justify-between">
        <span className="inline-block rounded-pill bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-white">
          Prepare
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {step + 1} / {STEPS.length}
        </p>
      </div>
      <div className="mt-3">
        <StepDots current={step} total={STEPS.length} />
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
          <PersonPicker
            key={currentStep.key}
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            onPersonSelect={(id, relationship) => {
              setPersonId(id);
              if (id && relationship) {
                setFieldValue("relationship", relationship);
              }
            }}
            selectedPersonId={personId}
          />
        ) : currentStep.type === "select" ? (
          <div className="space-y-2">
            {RELATIONSHIPS.map((rel) => (
              <button
                key={rel.value}
                onClick={() => {
                  setFieldValue(currentStep.key, rel.value);
                  setStep(step + 1);
                }}
                className={`flex h-12 w-full items-center rounded-card-sm px-4 text-[14px] font-semibold transition active:scale-[0.99] ${
                  value === rel.value
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
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
        <p className="mt-3 text-[13px] font-medium text-danger">{submitError}</p>
      )}

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            Back
          </button>
        )}
        {currentStep.type !== "select" && (
          <button
            onClick={handleNext}
            disabled={!value.trim()}
            className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            {step === STEPS.length - 1 ? "Get Feedback" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
