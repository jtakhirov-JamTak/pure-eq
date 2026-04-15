// Pure EQ domain — replace in fork.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileResult } from "@/types";
import { createClient } from "@/lib/supabase/client";
import {
  QUESTIONS,
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
  MODULE_LABELS,
  scoreProfile,
  type QuizOption,
  type RecommendedModule,
} from "@/lib/onboarding";

const PENDING_KEY = "pure_eq_pending_onboarding";
const VALID_MODULES: RecommendedModule[] = ["prepare", "review", "repair"];

type PendingOnboarding = {
  // user hint — email or id captured at stash time. Prevents cross-account
  // contamination on shared devices: if the hint doesn't match the logged-in
  // user at flush time, we discard the pending blob instead of writing it to
  // the wrong account.
  userHint: string | null;
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
      parsed.answers.length !== 9
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
      selectedOption ? { questionIndex, selectedOption } : null
    )
    .filter(
      (a): a is { questionIndex: number; selectedOption: QuizOption } =>
        a !== null
    );
}

// Accept only relative server-controlled redirect paths. Rejects absolute
// URLs, protocol-relative URLs, and anything the server didn't mint.
function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/coach/prepare";
  if (!value.startsWith("/") || value.startsWith("//")) return "/coach/prepare";
  return value;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<(QuizOption | null)[]>(
    new Array(9).fill(null)
  );
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flushing, setFlushing] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Guards against React strict-mode double-mount and any fast double-click
  // racing the async auth check. setSubmitting(true) is React-async; a ref is
  // synchronous and survives re-renders within the same component instance.
  const submitInFlight = useRef(false);
  const flushStarted = useRef(false);

  // /onboarding doubles as the v0 routing hub. On mount, in priority order:
  //   1. Authed user already has a saved profile → forward to their module.
  //      (Checked FIRST so a double-mount or retry never duplicates inserts.)
  //   2. Pending quiz in sessionStorage + authed (and hint matches) → flush.
  //   3. Otherwise (unauthed, or authed with no profile) → show quiz.
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

        // Case 1: returning user with a saved profile → forward.
        if (user) {
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("routing_output")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (profile) {
            const routing = profile.routing_output as {
              enabled_module?: string;
            } | null;
            const raw = routing?.enabled_module;
            const next: RecommendedModule =
              raw && (VALID_MODULES as string[]).includes(raw)
                ? (raw as RecommendedModule)
                : "prepare";
            if (!cancelled) router.replace(`/coach/${next}`);
            return;
          }
        }

        // Case 2: flush a pending submission.
        const pending = readPending();
        if (
          pending &&
          pending.answers.filter(Boolean).length === 9 &&
          user
        ) {
          // Cross-account contamination guard: if the stash was written under
          // a different account hint, ignore it — do not write it to the
          // currently-logged-in user.
          const currentHint = user.email ?? user.id;
          if (pending.userHint && pending.userHint !== currentHint) {
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
                  `onboarding flush failed: ${res.status}`
                );
              }
              const body = await res.json();
              clearPending();
              if (!cancelled) {
                router.replace(safeRedirect(body.redirectTo));
              }
              return;
            } catch (err) {
              // Fail loudly: log, show inline error, keep the pending blob so
              // the user can retry by reloading. Do NOT silently discard.
              console.error(
                "onboarding: pending flush failed",
                err instanceof Error ? err.message : "unknown"
              );
              if (!cancelled) {
                setSubmitError(
                  "We couldn't save your profile. Please reload to retry."
                );
              }
            }
          }
        }
      } finally {
        // try/finally guarantees the spinner never gets stuck. Even if a
        // query throws, we fall through to the quiz screen instead of
        // hanging forever on "Saving your profile…".
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
        // Stash under a hint so a different signup session can't inherit.
        writePending({ userHint: null, answers });
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
        err instanceof Error ? err.message : "unknown"
      );
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }

  // ---------- Flushing (just signed up, finishing save) ----------
  if (flushing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-base text-zinc-500">Saving your profile…</p>
        </div>
      </div>
    );
  }

  // ---------- Result screen ----------
  if (result) {
    const desc = PROFILE_DESCRIPTIONS[result.primary];
    const moduleLabel = MODULE_LABELS[result.recommendedModule];
    const avatarClass = PROFILE_AVATAR_CLASSES[result.primary];
    const initial = result.primary.charAt(0).toUpperCase();

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 pb-[env(safe-area-inset-bottom)] py-12">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Your Communication Profile
          </p>

          <div
            className={`mx-auto mt-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-sm ${avatarClass}`}
            aria-hidden
          >
            {initial}
          </div>

          <h1 className="mt-4 text-3xl font-bold capitalize text-zinc-900">
            {result.primary}
          </h1>

          <div className="mt-8 space-y-5 text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                At your best
              </p>
              <p className="mt-1 text-base text-zinc-700">{desc.strength}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Under stress
              </p>
              <p className="mt-1 text-base text-zinc-700">{desc.stress}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                What will help most
              </p>
              <p className="mt-1 text-base text-zinc-700">{desc.willHelpMost}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Best place to start
              </p>
              <p className="mt-1 text-base text-zinc-700">{moduleLabel}</p>
            </div>
          </div>

          {submitError && (
            <p className="mt-6 text-sm text-red-600">{submitError}</p>
          )}

          <button
            onClick={handleCta}
            disabled={submitting}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Try a 60-second ${moduleLabel}`}
          </button>

          <button
            onClick={() => {
              setResult(null);
              setCurrentQuestion(0);
              setAnswers(new Array(9).fill(null));
              setSubmitError(null);
            }}
            className="mt-3 inline-flex h-11 items-center justify-center px-4 text-sm text-zinc-500 underline"
          >
            This doesn&apos;t feel right
          </button>
        </div>
      </div>
    );
  }

  // ---------- Quiz screen ----------
  const question = QUESTIONS[currentQuestion];

  return (
    <div className="flex min-h-dvh flex-col bg-white px-6 pb-[env(safe-area-inset-bottom)] pt-16">
      <div className="mx-auto w-full max-w-sm pb-12">
        <div className="flex items-center gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentQuestion ? "bg-zinc-900" : "bg-zinc-200"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {currentQuestion + 1} of 9
        </p>

        <h2 className="mt-8 text-lg font-semibold leading-snug text-zinc-900">
          {question.text}
        </h2>

        <div className="mt-6 space-y-3">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleAnswer(option.label)}
              className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 p-4 text-left text-base text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-100"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs font-medium text-zinc-500">
                {option.label}
              </span>
              <span>{option.text}</span>
            </button>
          ))}
        </div>

        {currentQuestion > 0 && (
          <button
            onClick={() => setCurrentQuestion(currentQuestion - 1)}
            className="mt-6 inline-flex h-11 items-center justify-center px-4 text-sm text-zinc-500 underline"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
