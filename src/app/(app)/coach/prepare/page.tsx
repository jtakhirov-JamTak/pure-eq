"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { isRefusal } from "@/lib/coach/output-shape";
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

type StepDef = {
  key: string;
  title: string;
  prompt: string | null;
  type: "person" | "select" | "textarea";
};

const STEPS_PATH_A: StepDef[] = [
  { key: "personName", title: "Who is this with?", prompt: "Start typing to see people you've mentioned before.", type: "person" },
  { key: "relationship", title: "What is your relationship?", prompt: null, type: "select" },
  { key: "situation", title: "What is this conversation about?", prompt: "Describe the situation in facts only. What needs to be discussed?", type: "textarea" },
  { key: "primaryEmotion", title: "What is the main emotion you're most likely to feel going in?", prompt: "Name 1 emotion and why.", type: "textarea" },
  { key: "defaultPattern", title: "When you feel that way, what do you usually do that gets in the way?", prompt: "What is your likely default pattern here?", type: "textarea" },
  { key: "otherPersonHypothesis", title: "What do you think may be going on for them — and what makes you think that?", prompt: "Your best guess about what may be happening for them, and what evidence you actually have.", type: "textarea" },
  { key: "theirNeed", title: "What do they actually need or want from this conversation?", prompt: "The underlying need or want you think they might be expressing.", type: "textarea" },
  { key: "realityCheckQuestion", title: "What question can you ask to test your read instead of assuming?", prompt: null, type: "textarea" },
  { key: "howToMakeThemFeel", title: "How do you want them to feel by the end?", prompt: "What emotional state would a good outcome leave them in?", type: "textarea" },
  { key: "triggerPlan", title: "If you get triggered, what will you do instead?", prompt: "Complete this: If I notice myself feeling ___, then I will ___.", type: "textarea" },
];

const STEPS_PATH_B: StepDef[] = [
  { key: "personName", title: "Who is this about?", prompt: "Start typing to see people you've mentioned before.", type: "person" },
  { key: "relationship", title: "What is your relationship?", prompt: null, type: "select" },
  { key: "whatFeelsOff", title: "What feels off?", prompt: "What's bugging you or pulling at your attention — even if you can't name it yet.", type: "textarea" },
  { key: "whatChanged", title: "What changed recently?", prompt: "What's different between now and when things felt fine? Timing, tone, something they said or did.", type: "textarea" },
  { key: "storyTellingYourself", title: "What story are you telling yourself about it?", prompt: "What meaning are you assigning to what changed.", type: "textarea" },
  { key: "afraidItMeans", title: "What are you afraid this means?", prompt: "Name the worst-case interpretation, even if you suspect it's wrong.", type: "textarea" },
  { key: "realityCheckQuestion", title: "What question could you ask to check your read instead of stewing?", prompt: null, type: "textarea" },
  { key: "triggerPlan", title: "If you decide to talk to them and get triggered, what will you do instead?", prompt: "Complete this: If I notice myself feeling ___, then I will ___.", type: "textarea" },
];

type Path = "path_a" | "path_b";

type AiNormal = {
  mode: "normal";
  real_issue: string;
  reality_check_question: string;
  thing_not_to_do: string;
  they_might_need: string;
  best_next_move: string;
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
  { label: "The real issue", key: "real_issue" },
  { label: "Reality-check question", key: "reality_check_question" },
  { label: "Thing not to do", key: "thing_not_to_do" },
  { label: "What they might need", key: "they_might_need" },
  { label: "Best next move", key: "best_next_move" },
];

const PrepareBackground = () => <SkyBackground variant="calm" />;

function NormalResultCard({
  output,
  onBack,
}: {
  output: AiNormal;
  onBack: () => void;
}) {
  const visible = RESULT_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
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
          <div key={key} className="rounded-card-sm bg-surface p-4 shadow-soft">
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

function RefusalCard({
  output,
  onBack,
}: {
  output: AiRefusal;
  onBack: () => void;
}) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <h2
        className="font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        A note before you go further.
      </h2>
      <div className="mt-5 rounded-card-sm bg-surface p-4 shadow-soft">
        <p className="text-[14px] font-medium leading-[1.55] text-ink">
          {output.message_to_user}
        </p>
      </div>
      <button
        onClick={onBack}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Back to Coach
      </button>
    </div>
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
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <h2
        className="font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Entry saved
      </h2>
      <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
        {message ??
          "Your entry is saved, but no coaching feedback is available to show for this one."}
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

export default function PreparePage() {
  const router = useRouter();
  const [path, setPath] = useState<Path | null>(null);
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

  const STEPS = path === "path_a" ? STEPS_PATH_A : STEPS_PATH_B;
  const currentStep = path ? STEPS[step] : null;
  const value = currentStep ? data[currentStep.key] || "" : "";

  function setFieldValue(key: string, next: string) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function handleNext() {
    if (!currentStep) return;
    if (!value.trim()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!path) return;
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/coach/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
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
        setAiOutput(result.aiOutput as AiOutput);
      } else {
        setSavedMessage(
          result.message ??
            "Your entry is saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("prepare submit failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
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

  // --- Result screens ---
  if (aiOutput) {
    if (aiOutput.mode === "normal") {
      return (
        <NormalResultCard
          output={aiOutput}
          onBack={() => router.push("/coach")}
        />
      );
    }
    if (isRefusal(aiOutput)) {
      return (
        <RefusalCard
          output={aiOutput}
          onBack={() => router.push("/coach")}
        />
      );
    }
    return (
      <EmptyOutputCard
        onRetryCoaching={retryCoaching}
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

  // --- Step 0: entry-choice screen ---
  if (!path) {
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
          Where are <span className="italic">you</span>?
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Pick the one that fits. You can change your mind later.
        </p>

        <button
          onClick={() => {
            setPath("path_a");
            setStep(0);
          }}
          className="mt-6 block w-full rounded-card bg-surface p-5 text-left shadow-card transition active:scale-[0.99]"
        >
          <div
            className="font-display text-[22px] leading-[1.15] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            I need to have a <span className="italic">conversation</span>.
          </div>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.45] text-ink-soft">
            Something's coming up and you want to land it well.
          </p>
        </button>

        <button
          onClick={() => {
            setPath("path_b");
            setStep(0);
          }}
          className="mt-3 block w-full rounded-card bg-surface p-5 text-left shadow-card transition active:scale-[0.99]"
        >
          <div
            className="font-display text-[22px] leading-[1.15] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Something <span className="italic">feels off</span>.
          </div>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.45] text-ink-soft">
            You can't fully name it, but something's pulling at you.
          </p>
        </button>
      </div>
    );
  }

  if (!currentStep) return null;

  // --- Step 1..N: form ---
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
