// Pure EQ domain — replace in fork.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { CountdownTimer, unlockAudio } from "@/components/countdown-timer";

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

type Step =
  | "intro"
  | "before-rating"
  | "feel"
  | "label"
  | "validate"
  | "regulate"
  | "move"
  | "after-rating"
  | "close"
  | "submitting"
  | "success"
  | "error";

export default function OverwhelmedPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [beforeRating, setBeforeRating] = useState<number | null>(null);
  const [bodyLocation, setBodyLocation] = useState<string | null>(null);
  const [feelingLabel, setFeelingLabel] = useState("");
  const [afterRating, setAfterRating] = useState<number | null>(null);
  const [afterFeeling, setAfterFeeling] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = crypto.randomUUID();
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
  const totalSteps = STEP_ORDER.length - 1; // exclude intro from progress

  async function handleSubmit(feeling: string) {
    if (submitRef.current) return;
    submitRef.current = true;
    setAfterFeeling(feeling);
    setStep("submitting");
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
      setStep("success");
    } catch (err) {
      console.error("overwhelmed submit failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
      setStep("error");
    } finally {
      submitRef.current = false;
    }
  }

  // ── Success screen ──
  if (step === "success") {
    const delta =
      beforeRating && afterRating ? beforeRating - afterRating : null;
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Exercise complete</h2>
        <p className="mt-4 text-base text-zinc-700">
          Your regulation entry has been saved.
        </p>
        {delta !== null && delta > 0 && (
          <p className="mt-2 text-sm text-zinc-500">
            Your overwhelm went from {beforeRating} to {afterRating} — a{" "}
            {delta}-point drop.
          </p>
        )}
        <button
          onClick={() => router.push("/tools")}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Done
        </button>
      </div>
    );
  }

  // ── Error screen ──
  if (step === "error") {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">Save failed</h2>
        <p className="mt-4 text-base text-red-600">
          {submitError || "Something went wrong."}
        </p>
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

  // ── Loading screen ──
  if (step === "submitting") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-sm text-zinc-500">
            Saving your entry...
          </p>
        </div>
      </div>
    );
  }

  // ── Intro ──
  if (step === "intro") {
    return (
      <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-bold text-zinc-900">
          I&apos;m Overwhelmed
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          This is a short regulation exercise to help you calm your body
          and reduce the grip of intense emotion.
        </p>
        <div className="mt-6 space-y-2">
          {["Feel", "Label", "Validate", "Regulate", "Move"].map(
            (name, i) => (
              <div
                key={name}
                className="flex items-center gap-3 text-sm text-zinc-600"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500">
                  {i + 1}
                </span>
                {name}
              </div>
            )
          )}
        </div>
        <button
          onClick={() => {
            unlockAudio();
            setStep("before-rating");
          }}
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

  // ── Step content ──
  return (
    <div className="px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {STEP_ORDER.slice(1).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i < stepIndex ? "bg-zinc-900" : "bg-zinc-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Step {stepIndex} of {totalSteps}
      </p>

      {/* ── Before rating ── */}
      {step === "before-rating" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">
            How overwhelmed do you feel right now?
          </h2>
          <p className="mt-1 text-sm text-zinc-500">1 = slightly, 5 = very</p>
          <div className="mt-4 flex gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setBeforeRating(n);
                  setStep("feel");
                }}
                className={`flex h-12 flex-1 items-center justify-center rounded-lg border text-lg font-medium transition-colors ${
                  beforeRating === n
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feel (31s timer + body location) ── */}
      {step === "feel" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">Feel</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Close your eyes. Notice where this feeling shows up in your body.
          </p>
          <CountdownTimer
            durationSeconds={31}
            onComplete={() => {}}
            label="Body scan"
          />
          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-700">
              Where do you feel it? (optional)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BODY_LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() =>
                    setBodyLocation(bodyLocation === loc ? null : loc)
                  }
                  className={`rounded-full border px-4 py-2.5 text-base transition-colors ${
                    bodyLocation === loc
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setStep("label")}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
          >
            Next
          </button>
        </div>
      )}

      {/* ── Label ── */}
      {step === "label" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">Label</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Complete this sentence: &quot;I feel ___ because ___.&quot;
          </p>
          <div className="mt-4">
            <VoiceInput
              value={feelingLabel}
              onChange={setFeelingLabel}
              rows={3}
              placeholder="I feel... because..."
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep("feel")}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
            >
              Back
            </button>
            <button
              onClick={() => setStep("validate")}
              disabled={!feelingLabel.trim()}
              className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Validate ── */}
      {step === "validate" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">Validate</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Slowly say to yourself 3 times:
          </p>
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-center text-base font-medium text-blue-800">
              &quot;It makes sense to feel this way right now.&quot;
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep("label")}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 text-base font-medium text-zinc-700"
            >
              Back
            </button>
            <button
              onClick={() => setStep("regulate")}
              className="flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Regulate (61s breathing timer) ── */}
      {step === "regulate" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">Regulate</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Take slow breaths: in through your nose for 4, hold for 4, out
            through your mouth for 6.
          </p>
          <CountdownTimer
            durationSeconds={61}
            onComplete={() => setStep("move")}
            label="Box breathing"
            breathingMode
          />
        </div>
      )}

      {/* ── Move (121s timer) ── */}
      {step === "move" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">Move</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Take one small action to shift your state — walk, stretch, drink
            water, tidy up, or step outside.
          </p>
          <CountdownTimer
            durationSeconds={121}
            onComplete={() => setStep("after-rating")}
            label="Movement break"
          />
        </div>
      )}

      {/* ── After rating ── */}
      {step === "after-rating" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">
            How overwhelmed do you feel now?
          </h2>
          <p className="mt-1 text-sm text-zinc-500">1 = slightly, 5 = very</p>
          <div className="mt-4 flex gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setAfterRating(n);
                  setStep("close");
                }}
                className={`flex h-12 flex-1 items-center justify-center rounded-lg border text-lg font-medium transition-colors ${
                  afterRating === n
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Close (after feeling choice) ── */}
      {step === "close" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">
            How do you feel now?
          </h2>
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
        </div>
      )}
    </div>
  );
}
