"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { CountdownTimer, unlockAudio } from "@/components/countdown-timer";
import { StormBackground } from "@/components/brand/StormBackground";
import {
  BodySilhouette,
  type BodyRegion,
} from "@/components/brand/BodySilhouette";
import {
  FlowScreen,
  FlowHeader,
  FlowFooter,
} from "@/components/ui/flow-screen";
import { SelectableRow } from "@/components/ui/selectable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Kicker } from "@/components/ui/kicker";
import { Card } from "@/components/ui/card";
import { cn, safeUUID } from "@/lib/utils";

const AFTER_FEELINGS = [
  "Calmer",
  "Lighter",
  "Hopeful",
  "Relieved",
  "Energized",
  "Same",
];

// Split: Step is position in the flow; Mode is submission state. Earlier
// the two were one union, which caused `stepIndex = STEP_ORDER.indexOf(step)`
// to return -1 during submit (progress bar would disappear) and let future
// features overload the type further.
type Step =
  | "intro"
  | "before-rating"
  | "feel"
  | "label"
  | "validate"
  | "regulate"
  | "move"
  | "after-rating"
  | "close";

type Mode = "idle" | "submitting" | "success" | "error";

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

// 1–5 rating row. Tapping a number records it and advances (set-then-advance,
// the safe pattern — no submit in the same tick).
function RatingRow({
  value,
  onPick,
}: {
  value: number | null;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          className={cn(
            "flex h-14 flex-1 items-center justify-center rounded-[14px] text-[22px] font-medium transition active:scale-[0.97]",
            value === n
              ? "bg-accent text-accent-text shadow-cta"
              : "border border-hairline bg-surface text-ink",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function OverwhelmedClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [mode, setMode] = useState<Mode>("idle");
  const [beforeRating, setBeforeRating] = useState<number | null>(null);
  const [bodyLocation, setBodyLocation] = useState<BodyRegion | null>(null);
  const [feelingLabel, setFeelingLabel] = useState("");
  const [afterRating, setAfterRating] = useState<number | null>(null);
  const [afterFeeling, setAfterFeeling] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
  }

  const STEP_ORDER: Step[] = [
    "intro",
    "before-rating",
    "feel",
    "label",
    "validate",
    "regulate",
    "move",
    "after-rating",
    "close",
  ];

  const stepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1;

  async function handleSubmit(feeling: string) {
    if (submitRef.current) return;
    submitRef.current = true;
    setAfterFeeling(feeling);
    setMode("submitting");
    setSubmitError(null);
    try {
      const res = await fetch("/api/tools/overwhelmed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beforeRating,
          bodyLocation,
          feelingLabel,
          afterRating,
          afterFeeling: feeling,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      setMode("success");
    } catch (err) {
      console.error("overwhelmed submit failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
      setMode("error");
    } finally {
      submitRef.current = false;
    }
  }

  if (mode === "success") {
    const delta =
      beforeRating && afterRating ? beforeRating - afterRating : null;
    return (
      <ReadingScreen>
        <Kicker className="text-accent-ink">Overwhelmed · Complete</Kicker>
        <h1
          className="mt-3 text-[26px] font-medium leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Exercise complete
        </h1>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your regulation entry has been saved.
        </p>
        {delta !== null && delta > 0 && (
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            Your overwhelm went from {beforeRating} to {afterRating} — a {delta}
            -point drop.
          </p>
        )}
        <PrimaryButton onClick={() => router.push("/tools")} className="mt-8">
          Done
        </PrimaryButton>
      </ReadingScreen>
    );
  }

  if (mode === "error") {
    return (
      <ReadingScreen>
        <h1
          className="text-[24px] font-medium leading-[1.18] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          Save failed
        </h1>
        <p className="mt-3 text-[14px] font-medium text-danger">
          {submitError || "Something went wrong."}
        </p>
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

  if (mode === "submitting") {
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

  if (step === "intro") {
    return (
      <ReadingScreen>
        <Kicker className="text-accent-ink">Overwhelmed</Kicker>
        <h1
          className="mt-3 text-[28px] font-medium leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.7px" }}
        >
          Settle the <span className="italic">storm</span>.
        </h1>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          A short regulation exercise to help you calm your body and reduce the
          grip of intense emotion.
        </p>
        <div className="mt-6 space-y-2">
          {["Feel", "Label", "Validate", "Regulate", "Move"].map((name, i) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-card-sm border border-hairline bg-surface px-4 py-2.5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-ink">
                {i + 1}
              </span>
              <span className="text-[14px] font-semibold text-ink">{name}</span>
            </div>
          ))}
        </div>
        <PrimaryButton
          onClick={() => {
            unlockAudio();
            setStep("before-rating");
          }}
          className="mt-8"
        >
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

  // --- Wizard steps (FlowScreen full-screen takeover) ---
  const header = (onBack: () => void) => (
    <FlowHeader
      onBack={onBack}
      eyebrow="Overwhelmed"
      counter={`${stepIndex} / ${totalSteps}`}
      dots={null}
    />
  );
  const backOnly = (onBack: () => void) => (
    <SecondaryButton onClick={onBack} className="w-full">
      Back
    </SecondaryButton>
  );

  if (step === "before-rating") {
    return (
      <FlowScreen
        header={header(() => setStep("intro"))}
        footer={backOnly(() => setStep("intro"))}
        title="How overwhelmed do you feel right now?"
        helper="1 = slightly, 5 = very"
      >
        <RatingRow
          value={beforeRating}
          onPick={(n) => {
            setBeforeRating(n);
            setStep("feel");
          }}
        />
      </FlowScreen>
    );
  }

  if (step === "feel") {
    return (
      <FlowScreen
        header={header(() => setStep("before-rating"))}
        footer={
          <FlowFooter
            onBack={() => setStep("before-rating")}
            primaryLabel="Next"
            onPrimary={() => setStep("label")}
          />
        }
        title="Where do you feel it in your body?"
        helper="31 seconds. Just notice — no fixing."
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          <BodySilhouette selected={bodyLocation} onChange={setBodyLocation} />
          <CountdownTimer durationSeconds={31} onComplete={() => {}} label="Body scan" />
        </div>
      </FlowScreen>
    );
  }

  if (step === "label") {
    return (
      <FlowScreen
        header={header(() => setStep("feel"))}
        footer={
          <FlowFooter
            onBack={() => setStep("feel")}
            primaryLabel="Next"
            onPrimary={() => feelingLabel.trim() && setStep("validate")}
            primaryDisabled={!feelingLabel.trim()}
          />
        }
        title="Label"
        helper={'Complete this sentence: "I feel ___ because ___."'}
      >
        <div key="label" className="flex min-h-0 flex-1 flex-col">
          <VoiceInput
            value={feelingLabel}
            onChange={setFeelingLabel}
            fill
            placeholder="I feel... because..."
          />
        </div>
      </FlowScreen>
    );
  }

  if (step === "validate") {
    return (
      <FlowScreen
        header={header(() => setStep("label"))}
        footer={
          <FlowFooter
            onBack={() => setStep("label")}
            primaryLabel="Done"
            onPrimary={() => setStep("regulate")}
          />
        }
        title="Validate"
        helper="Slowly say to yourself 3 times:"
      >
        <Card className="mt-2">
          <p
            className="text-center text-[20px] font-medium italic leading-[1.3] text-accent-ink"
            style={{ letterSpacing: "-0.3px" }}
          >
            &quot;It makes sense to feel this way right now.&quot;
          </p>
        </Card>
      </FlowScreen>
    );
  }

  if (step === "regulate") {
    return (
      <FlowScreen
        header={header(() => setStep("validate"))}
        footer={backOnly(() => setStep("validate"))}
        title="In for 4, hold 4, out for 6."
        helper="You don't need to do this perfectly. Just slowly."
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="w-full">
            <CountdownTimer
              durationSeconds={61}
              onComplete={() => setStep("move")}
              breathingMode
            />
          </div>
        </div>
      </FlowScreen>
    );
  }

  if (step === "move") {
    return (
      <FlowScreen
        header={header(() => setStep("regulate"))}
        footer={backOnly(() => setStep("regulate"))}
        title="Move"
        helper="Take one small action to shift your state — walk, stretch, drink water, tidy up, or step outside."
      >
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <CountdownTimer
            durationSeconds={121}
            onComplete={() => setStep("after-rating")}
            label="Movement break"
          />
        </div>
      </FlowScreen>
    );
  }

  if (step === "after-rating") {
    return (
      <FlowScreen
        header={header(() => setStep("move"))}
        footer={backOnly(() => setStep("move"))}
        title="How overwhelmed do you feel now?"
        helper="1 = slightly, 5 = very"
      >
        <RatingRow
          value={afterRating}
          onPick={(n) => {
            setAfterRating(n);
            setStep("close");
          }}
        />
      </FlowScreen>
    );
  }

  // close
  return (
    <FlowScreen
      header={header(() => setStep("after-rating"))}
      footer={backOnly(() => setStep("after-rating"))}
      title="How do you feel now?"
    >
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
    </FlowScreen>
  );
}
