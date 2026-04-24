"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileResult } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { CloudAvatar } from "@/components/brand/CloudAvatar";
import { SunBadge } from "@/components/brand/SunBadge";
import { readFirstName } from "@/lib/user-metadata";
import {
  QUESTIONS,
  scoreProfile,
  type QuizOption,
} from "@/lib/onboarding";

const PENDING_KEY = "pure_eq_pending_onboarding";
const FRESH_SIGNUP_WINDOW_MS = 30 * 60 * 1000;

type PendingOnboarding = {
  userHint: string | null;
  stashedAt: number;
  answers: (QuizOption | null)[];
};

function readPending(): PendingOnboarding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.answers) ||
      parsed.answers.length !== 9 ||
      typeof parsed.stashedAt !== "number"
    ) {
      return null;
    }
    return parsed as PendingOnboarding;
  } catch {
    return null;
  }
}

function writePending(p: PendingOnboarding) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

function clearPending() {
  sessionStorage.removeItem(PENDING_KEY);
}

function toApiAnswers(answers: (QuizOption | null)[]) {
  return answers
    .map((selectedOption, questionIndex) =>
      selectedOption ? { questionIndex, selectedOption } : null,
    )
    .filter(
      (a): a is { questionIndex: number; selectedOption: QuizOption } =>
        a !== null,
    );
}

function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/coach/prepare";
  if (!value.startsWith("/") || value.startsWith("//"))
    return "/coach/prepare";
  return value;
}

// Local alias — renamed to avoid shadowing the imported shared component.
const OnboardingSky = () => <SkyBackground variant="calm" />;

export default function OnboardingClient() {
  const router = useRouter();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<(QuizOption | null)[]>(
    new Array(9).fill(null),
  );
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flushing, setFlushing] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");

  const submitInFlight = useRef(false);
  const flushStarted = useRef(false);

  useEffect(() => {
    if (flushStarted.current) return;
    flushStarted.current = true;

    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && !cancelled) {
          setFirstName(readFirstName(user.user_metadata));
        }

        const pending = readPending();
        if (
          pending &&
          pending.answers.filter(Boolean).length === 9 &&
          user
        ) {
          const currentHint = user.email ?? user.id;
          const userCreatedMs = user.created_at
            ? new Date(user.created_at).getTime()
            : 0;
          const hintMatches =
            pending.userHint !== null && pending.userHint === currentHint;
          const freshSignup =
            pending.userHint === null &&
            userCreatedMs > 0 &&
            Math.abs(userCreatedMs - pending.stashedAt) <=
              FRESH_SIGNUP_WINDOW_MS;
          if (!hintMatches && !freshSignup) {
            clearPending();
          } else {
            try {
              const res = await fetch("/api/onboarding/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  answers: toApiAnswers(pending.answers),
                }),
              });
              if (!res.ok) {
                throw new Error(
                  `onboarding flush failed: ${res.status}`,
                );
              }
              const body = await res.json();
              clearPending();
              if (!cancelled) {
                router.replace(safeRedirect(body.redirectTo));
              }
              return;
            } catch (err) {
              console.error(
                "onboarding: pending flush failed",
                err instanceof Error ? err.message : "unknown",
              );
              if (!cancelled) {
                setSubmitError(
                  "We couldn't save your profile. Please reload to retry.",
                );
              }
            }
          }
        }
      } finally {
        if (!cancelled) setFlushing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleAnswer(option: QuizOption) {
    const newAnswers: (QuizOption | null)[] = [...answers];
    newAnswers[currentQuestion] = option;
    setAnswers(newAnswers);

    if (currentQuestion < 8) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setResult(scoreProfile(newAnswers));
    }
  }

  async function handleCta() {
    if (!result) return;
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        writePending({ userHint: null, stashedAt: Date.now(), answers });
        router.push("/signup");
        return;
      }

      const res = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: toApiAnswers(answers) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Submission failed");
      }
      const body = await res.json();
      router.replace(safeRedirect(body.redirectTo));
    } catch (err) {
      console.error(
        "onboarding: direct submit failed",
        err instanceof Error ? err.message : "unknown",
      );
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }

  if (flushing) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center px-6">
        <OnboardingSky />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[15px] font-medium text-ink-soft">
            Saving your profile…
          </p>
        </div>
      </div>
    );
  }

  if (result) {
    const displayName = firstName || "friend";
    return (
      <div
        className="relative flex min-h-dvh flex-col items-center px-6"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 2rem)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        }}
      >
        <SkyBackground variant="result" />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-6 top-16"
        >
          <SunBadge />
        </div>

        <div className="mt-24 flex justify-center">
          <CloudAvatar size={96} mood="happy" />
        </div>

        <h1
          className="mt-6 text-center font-display text-[32px] leading-[1.1] text-white"
          style={{
            letterSpacing: "-0.6px",
            textShadow: "0 2px 8px rgba(20,60,130,0.25)",
          }}
        >
          You&apos;re all set,
          <br />
          <span className="italic break-words">{displayName}</span>.
        </h1>

        <p className="mt-4 max-w-[300px] text-center text-[14px] font-medium leading-[1.5] text-white/90">
          Your SpeakEasy is tuned for hard conversations and pattern-spotting.
          Blue skies ahead.
        </p>

        {submitError && (
          <p className="mt-6 text-center text-[13px] font-medium text-white">
            {submitError}
          </p>
        )}

        <div className="flex-1" />

        <button
          onClick={handleCta}
          disabled={submitting}
          className="h-14 w-full max-w-sm rounded-pill bg-white text-[15px] font-bold text-ink shadow-card transition active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Step into the forecast →"}
        </button>

        <button
          onClick={() => {
            setResult(null);
            setCurrentQuestion(0);
            setAnswers(new Array(9).fill(null));
            setSubmitError(null);
          }}
          className="mt-3 inline-flex min-h-11 items-center justify-center px-4 text-[13px] font-medium text-white/85 underline active:opacity-70"
        >
          This doesn&apos;t feel right
        </button>
      </div>
    );
  }

  const question = QUESTIONS[currentQuestion];

  return (
    <div className="relative flex min-h-dvh flex-col px-6 pb-[env(safe-area-inset-bottom)] pt-[max(4rem,env(safe-area-inset-top))]">
      <OnboardingSky />
      <div className="mx-auto w-full max-w-sm pb-12">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < currentQuestion
                  ? "bg-brand"
                  : i === currentQuestion
                    ? "bg-brand-deep"
                    : "bg-white/60"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {currentQuestion + 1} of 9
        </p>

        <h2
          className="mt-6 font-display text-[24px] leading-[1.2] text-ink"
          style={{ letterSpacing: "-0.4px" }}
        >
          {question.text}
        </h2>

        <div className="mt-6 space-y-2.5">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleAnswer(option.label)}
              className="flex w-full items-start gap-3 rounded-card-sm bg-surface p-4 text-left shadow-soft transition active:scale-[0.99]"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-tint text-[12px] font-bold text-brand-deep">
                {option.label}
              </span>
              <span className="text-[14px] font-medium leading-[1.45] text-ink">
                {option.text}
              </span>
            </button>
          ))}
        </div>

        {currentQuestion > 0 && (
          <button
            onClick={() => setCurrentQuestion(currentQuestion - 1)}
            className="mt-6 inline-flex min-h-11 items-center justify-center px-4 text-[13px] font-medium text-ink-soft underline active:opacity-70"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
