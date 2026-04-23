"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { CountdownTimer, unlockAudio } from "@/components/countdown-timer";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { safeUUID } from "@/lib/utils";

const BODY_LOCATIONS = [
  "Throat",
  "Chest",
  "Stomach",
  "Jaw",
  "Shoulders",
  "Face",
  "Other",
];

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

const OverwhelmedBackground = () => <SkyBackground variant="stormy" />;

export default function OverwhelmedClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [mode, setMode] = useState<Mode>("idle");
  const [beforeRating, setBeforeRating] = useState<number | null>(null);
  const [bodyLocation, setBodyLocation] = useState<string | null>(null);
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
      if (res.status === 403) {
        router.push("/paywall");
        return;
      }
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
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <OverwhelmedBackground />
        <h2
          className="font-display text-[30px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.7px" }}
        >
          Exercise <span className="italic">complete</span>
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Your regulation entry has been saved.
        </p>
        {delta !== null && delta > 0 && (
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            Your overwhelm went from {beforeRating} to {afterRating} — a{" "}
            {delta}-point drop.
          </p>
        )}
        <button
          onClick={() => router.push("/tools")}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <OverwhelmedBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Save failed
        </h2>
        <p className="mt-3 text-[14px] font-medium text-danger">
          {submitError || "Something went wrong."}
        </p>
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

  if (mode === "submitting") {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <OverwhelmedBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Saving your entry…
          </p>
        </div>
      </div>
    );
  }

  if (step === "intro") {
    return (
      <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <OverwhelmedBackground />
        <span className="inline-block rounded-pill bg-brand-deep px-3 py-1 text-[11px] font-bold uppercase tracking-[1.2px] text-white">
          Overwhelmed
        </span>
        <h2
          className="mt-3 font-display text-[32px] leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.9px" }}
        >
          Settle the <span className="italic">storm</span>.
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          A short regulation exercise to help you calm your body and reduce the
          grip of intense emotion.
        </p>
        <div className="mt-6 space-y-2">
          {["Feel", "Label", "Validate", "Regulate", "Move"].map((name, i) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-card-xs bg-surface px-4 py-2.5 shadow-soft"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-tint text-[12px] font-bold text-brand-deep">
                {i + 1}
              </span>
              <span className="text-[14px] font-semibold text-ink">{name}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            unlockAudio();
            setStep("before-rating");
          }}
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

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <OverwhelmedBackground />

      <div className="flex items-center gap-1.5">
        {STEP_ORDER.slice(1).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < stepIndex - 1
                ? "bg-brand"
                : i === stepIndex - 1
                  ? "bg-brand-deep"
                  : "bg-white/60"
            }`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="inline-block rounded-pill bg-brand-deep px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-white">
          Overwhelmed
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {stepIndex} / {totalSteps}
        </p>
      </div>

      {step === "before-rating" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            How overwhelmed do you feel <span className="italic">right now</span>?
          </h2>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            1 = slightly, 5 = very
          </p>
          <div className="mt-5 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setBeforeRating(n);
                  setStep("feel");
                }}
                className={`flex h-14 flex-1 items-center justify-center rounded-card-sm font-display text-[22px] transition active:scale-[0.97] ${
                  beforeRating === n
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "feel" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Feel
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Close your eyes. Notice where this feeling shows up in your body.
          </p>
          <div className="mt-5">
            <CountdownTimer
              durationSeconds={31}
              onComplete={() => {}}
              label="Body scan"
            />
          </div>
          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
              Where do you feel it? (optional)
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {BODY_LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() =>
                    setBodyLocation(bodyLocation === loc ? null : loc)
                  }
                  className={`rounded-pill px-3.5 py-2 text-[13px] font-semibold transition ${
                    bodyLocation === loc
                      ? "bg-brand text-white shadow-cta"
                      : "bg-surface text-ink shadow-soft"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setStep("label")}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
          >
            Next
          </button>
        </div>
      )}

      {step === "label" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Label
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Complete this sentence: &quot;I feel ___ because ___.&quot;
          </p>
          <div className="mt-5">
            <VoiceInput
              key={step}
              value={feelingLabel}
              onChange={setFeelingLabel}
              rows={3}
              placeholder="I feel... because..."
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep("feel")}
              className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
            >
              Back
            </button>
            <button
              onClick={() => setStep("validate")}
              disabled={!feelingLabel.trim()}
              className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "validate" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Validate
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Slowly say to yourself 3 times:
          </p>
          <div className="mt-5 rounded-card bg-surface p-6 shadow-card">
            <p
              className="text-center font-display text-[20px] italic leading-[1.3] text-brand-deep"
              style={{ letterSpacing: "-0.3px" }}
            >
              &quot;It makes sense to feel this way right now.&quot;
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep("label")}
              className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
            >
              Back
            </button>
            <button
              onClick={() => setStep("regulate")}
              className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {step === "regulate" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Regulate
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Take slow breaths: in through your nose for 4, hold for 4, out
            through your mouth for 6.
          </p>
          <div className="mt-5">
            <CountdownTimer
              durationSeconds={61}
              onComplete={() => setStep("move")}
              label="Box breathing"
              breathingMode
            />
          </div>
        </div>
      )}

      {step === "move" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Move
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Take one small action to shift your state — walk, stretch, drink
            water, tidy up, or step outside.
          </p>
          <div className="mt-5">
            <CountdownTimer
              durationSeconds={121}
              onComplete={() => setStep("after-rating")}
              label="Movement break"
            />
          </div>
        </div>
      )}

      {step === "after-rating" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            How overwhelmed do you feel <span className="italic">now</span>?
          </h2>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            1 = slightly, 5 = very
          </p>
          <div className="mt-5 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setAfterRating(n);
                  setStep("close");
                }}
                className={`flex h-14 flex-1 items-center justify-center rounded-card-sm font-display text-[22px] transition active:scale-[0.97] ${
                  afterRating === n
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "close" && (
        <div className="mt-5">
          <h2
            className="font-display text-[26px] leading-[1.12] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            How do you feel now?
          </h2>
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
        </div>
      )}
    </div>
  );
}
