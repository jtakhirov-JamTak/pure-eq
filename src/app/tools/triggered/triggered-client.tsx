"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { StormBackground } from "@/components/brand/StormBackground";
import { GradientSlider } from "@/components/brand/GradientSlider";
import {
  FlowScreen,
  FlowHeader,
  FlowFooter,
} from "@/components/ui/flow-screen";
import { SelectableRow } from "@/components/ui/selectable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Kicker } from "@/components/ui/kicker";
import { PersonPicker } from "@/components/person-picker";
import { cn, safeUUID } from "@/lib/utils";

const EMOTIONS = [
  "Angry",
  "Hurt",
  "Anxious",
  "Ashamed",
  "Sad",
  "Disappointed",
] as const;

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
  // Optional — empty never blocks Next. Links the moment to a person so it
  // shows up on their /people history page.
  {
    key: "person",
    title: "Was this about someone?",
    prompt: "Optional — link this moment to a person to see it in their history.",
    type: "person" as const,
  },
];

// Reading screen (intro/success/error) — scrollable, renders inside the app
// shell over the body's Storm gradient.
function ReadingScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-10">
      <StormBackground />
      {children}
    </div>
  );
}

export default function TriggeredClient() {
  const router = useRouter();
  const [step, setStep] = useState(-1);
  const [data, setData] = useState<Record<string, string>>({});
  const [emotionIntensity, setEmotionIntensity] = useState(5);
  const [urgeIntensity, setUrgeIntensity] = useState(5);
  const [personId, setPersonId] = useState<string | null>(null);
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
          // Optional person link: a picked id wins; otherwise a typed name
          // (the server dedups/creates). Both null = unlinked.
          personId,
          personName: personId ? null : data.personName?.trim() || null,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
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
      <ReadingScreen>
        <h1
          className="text-[24px] font-medium leading-[1.18] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          Save failed
        </h1>
        <p className="mt-3 text-[14px] font-medium text-danger">{submitError}</p>
        <PrimaryButton
          onClick={() => afterFeeling && handleSubmit(afterFeeling)}
          className="mt-8"
        >
          Try again
        </PrimaryButton>
        <SecondaryButton
          onClick={() => router.push("/tools")}
          className="mt-3 w-full"
        >
          Back to Tools
        </SecondaryButton>
      </ReadingScreen>
    );
  }

  if (success) {
    return (
      <ReadingScreen>
        <Kicker className="text-accent-ink">Triggered · Saved</Kicker>
        <h1
          className="mt-3 text-[24px] font-medium leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          Trigger log saved.
        </h1>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your trigger entry has been saved. Over time, these entries help
          surface patterns in how you respond to difficult moments.
        </p>
        <PrimaryButton onClick={() => router.push("/tools")} className="mt-8">
          Done
        </PrimaryButton>
      </ReadingScreen>
    );
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <StormBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-hairline-strong border-t-accent" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Saving your entry…
          </p>
        </div>
      </div>
    );
  }

  if (step === -1) {
    return (
      <ReadingScreen>
        <Kicker className="text-accent-ink">Triggered</Kicker>
        <h1
          className="mt-3 text-[28px] font-medium leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.7px" }}
        >
          Catch the <span className="italic">spark</span>.
        </h1>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Log a trigger in real time so you can understand your pattern, calm
          down, and see the situation more clearly.
        </p>
        <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
          This entry will also be used to generate coaching insights over time.
        </p>
        <PrimaryButton onClick={() => setStep(0)} className="mt-8">
          Start
        </PrimaryButton>
        <SecondaryButton
          onClick={() => router.push("/tools")}
          className="mt-3 w-full"
        >
          Back to Tools
        </SecondaryButton>
      </ReadingScreen>
    );
  }

  // Close step — pick an after-feeling; tapping submits (no Next button).
  if (step === STEPS.length) {
    return (
      <FlowScreen
        header={
          <FlowHeader
            onBack={() => setStep(STEPS.length - 1)}
            eyebrow="Triggered"
            counter={`${step + 1} / ${totalSteps}`}
            dots={null}
          />
        }
        footer={
          <SecondaryButton
            onClick={() => setStep(STEPS.length - 1)}
            className="w-full"
          >
            Back
          </SecondaryButton>
        }
        title="How do you feel now?"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {submitError && (
            <p className="mb-3 shrink-0 text-[13px] font-medium text-danger">
              {submitError}
            </p>
          )}
          <div className="space-y-2">
            {AFTER_FEELINGS.map((feeling) => (
              <SelectableRow
                key={feeling}
                selected={afterFeeling === feeling}
                onClick={() => handleSubmit(feeling)}
              >
                {feeling}
              </SelectableRow>
            ))}
          </div>
        </div>
      </FlowScreen>
    );
  }

  const currentStep = STEPS[step];
  const value = data[currentStep.key] || "";

  function handleNext() {
    if (currentStep.type === "emotion" && !data.emotion?.trim()) return;
    if (currentStep.type === "urge" && !data.urge?.trim()) return;
    if (currentStep.type === "textarea" && !value.trim()) return;
    // "person" is optional — never blocks.
    if (step < STEPS.length) {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
    else setStep(-1);
  }

  const nextDisabled =
    (currentStep.type === "textarea" && !value.trim()) ||
    (currentStep.type === "emotion" && !data.emotion?.trim()) ||
    (currentStep.type === "urge" && !data.urge?.trim());

  return (
    <FlowScreen
      header={
        <FlowHeader
          onBack={handleBack}
          eyebrow="Triggered"
          counter={`${step + 1} / ${totalSteps}`}
          dots={null}
        />
      }
      footer={
        <FlowFooter
          onBack={handleBack}
          primaryLabel={
            currentStep.type === "person" &&
            !personId &&
            !data.personName?.trim()
              ? "Skip"
              : "Next"
          }
          onPrimary={handleNext}
          primaryDisabled={nextDisabled}
        />
      }
      title={currentStep.title}
      helper={currentStep.prompt ?? undefined}
    >
      <div
        key={currentStep.key}
        className="flex min-h-0 flex-1 flex-col"
      >
        {currentStep.type === "textarea" && (
          <VoiceInput
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            fill
            placeholder="Type or tap the mic to speak..."
          />
        )}

        {currentStep.type === "emotion" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map((emo) => {
                const on = data.emotion === emo;
                return (
                  <button
                    key={emo}
                    type="button"
                    onClick={() => setFieldValue("emotion", on ? "" : emo)}
                    className={cn(
                      "min-h-11 rounded-pill px-4 text-[13px] font-semibold transition active:scale-[0.97]",
                      on
                        ? "bg-accent text-accent-text"
                        : "border border-hairline bg-surface text-ink",
                    )}
                  >
                    {emo}
                  </button>
                );
              })}
            </div>
            <VoiceInput
              value={data.emotion || ""}
              onChange={(next) => setFieldValue("emotion", next)}
              rows={2}
              placeholder="Or describe it in your own words..."
            />
            <GradientSlider
              value={emotionIntensity}
              onChange={setEmotionIntensity}
              accentColor="var(--color-accent)"
            />
          </div>
        )}

        {currentStep.type === "urge" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <VoiceInput
              value={data.urge || ""}
              onChange={(next) => setFieldValue("urge", next)}
              rows={3}
              placeholder="What was your urge?"
            />
            <GradientSlider
              value={urgeIntensity}
              onChange={setUrgeIntensity}
              accentColor="var(--color-accent)"
            />
          </div>
        )}

        {currentStep.type === "person" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <PersonPicker
              value={data.personName ?? ""}
              onChange={(next) => setFieldValue("personName", next)}
              onPersonSelect={(id) => setPersonId(id)}
              selectedPersonId={personId}
              placeholder="Name (optional)"
            />
          </div>
        )}
      </div>
    </FlowScreen>
  );
}
