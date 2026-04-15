"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    prompt: "Person name or label",
    type: "text" as const,
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

export default function PreparePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiOutput, setAiOutput] = useState<Record<string, string> | null>(null);

  const currentStep = STEPS[step];
  const value = data[currentStep.key] || "";

  function handleNext() {
    if (!value.trim()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/coach/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        setAiOutput(result.aiOutput);
      }
    } catch {
      // Fallback — entry saved even if AI fails
    } finally {
      setSubmitting(false);
    }
  }

  // AI output screen
  if (aiOutput) {
    return (
      <div className="px-5 pt-8">
        <h2 className="text-xl font-bold text-zinc-900">Your Prepare Feedback</h2>
        <div className="mt-6 space-y-5">
          {[
            { label: "What your read gets right", key: "user_read_accuracy" },
            { label: "What you may be missing", key: "what_user_may_be_missing" },
            { label: "Likely blind spot", key: "likely_blind_spot" },
            { label: "Reality-check question", key: "reality_check_question" },
            { label: "One thing not to do", key: "thing_not_to_do" },
            { label: "Best next move", key: "best_next_move" },
          ].map(({ label, key }) => (
            <div key={key}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                {label}
              </p>
              <p className="mt-1 text-sm text-zinc-800">
                {aiOutput[key] || "—"}
              </p>
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push("/coach")}
          className="mt-10 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white"
        >
          Done
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
    <div className="px-5 pt-8">
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
        {currentStep.type === "select" ? (
          <div className="space-y-2">
            {RELATIONSHIPS.map((rel) => (
              <button
                key={rel.value}
                onClick={() => {
                  setData({ ...data, [currentStep.key]: rel.value });
                  setStep(step + 1);
                }}
                className={`flex h-11 w-full items-center rounded-lg border px-4 text-sm transition-colors ${
                  value === rel.value
                    ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                    : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {rel.label}
              </button>
            ))}
          </div>
        ) : currentStep.type === "textarea" ? (
          <div className="relative">
            <textarea
              value={value}
              onChange={(e) =>
                setData({ ...data, [currentStep.key]: e.target.value })
              }
              rows={4}
              className="block w-full rounded-lg border border-zinc-300 p-3 pr-12 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="Type or tap the mic to speak..."
            />
            {/* Mic icon — voice input placeholder */}
            <button
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              title="Voice input (coming soon)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) =>
              setData({ ...data, [currentStep.key]: e.target.value })
            }
            className="block h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="Enter name..."
          />
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700"
          >
            Back
          </button>
        )}
        {currentStep.type !== "select" && (
          <button
            onClick={handleNext}
            disabled={!value.trim()}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white disabled:opacity-40"
          >
            {step === STEPS.length - 1 ? "Get Feedback" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
