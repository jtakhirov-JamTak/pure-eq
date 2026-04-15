// Pure EQ domain — replace in fork.
"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/onboarding";

const PENDING_KEY = "pure_eq_pending_onboarding";

type PendingOnboarding = {
  answers: (QuizOption | null)[];
};

function readPending(): PendingOnboarding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
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
    .filter((a): a is { questionIndex: number; selectedOption: QuizOption } => a !== null);
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

  // /onboarding doubles as the v0 routing hub. On mount, in priority order:
  //   1. Pending quiz in sessionStorage + authed → flush to DB → forward.
  //   2. Authed user who already has a saved profile → forward to module.
  //   3. Otherwise (unauthed, or authed with no profile) → show quiz.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = readPending();
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Case 1: flush a pending submission.
      if (
        pending &&
        pending.answers.filter(Boolean).length === 9 &&
        user
      ) {
        try {
          const res = await fetch("/api/onboarding/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: toApiAnswers(pending.answers) }),
          });
          if (!res.ok) throw new Error(String(res.status));
          const body = await res.json();
          clearPending();
          if (!cancelled) router.replace(body.redirectTo ?? "/coach/prepare");
          return;
        } catch {
          clearPending();
          if (!cancelled) setFlushing(false);
          return;
        }
      }

      // Case 2: authed and already onboarded — forward to their module.
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
          const next = routing?.enabled_module ?? "prepare";
          if (!cancelled) router.replace(`/coach/${next}`);
          return;
        }
      }

      // Case 3: fall through to the quiz.
      if (!cancelled) setFlushing(false);
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
    setSubmitError(null);
    setSubmitting(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Not signed in yet: stash the answers and route to signup. After
      // signup the mount effect above will auto-submit.
      writePending({ answers });
      router.push("/signup");
      return;
    }

    try {
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
      router.replace(body.redirectTo ?? "/coach/prepare");
    } catch (err) {
      setSubmitting(false);
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    }
  }

  // ---------- Flushing (just signed up, finishing save) ----------
  if (flushing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-sm text-zinc-500">Saving your profile…</p>
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
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-400">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                At your best
              </p>
              <p className="mt-1 text-sm text-zinc-700">{desc.strength}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Under stress
              </p>
              <p className="mt-1 text-sm text-zinc-700">{desc.stress}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                What will help most
              </p>
              <p className="mt-1 text-sm text-zinc-700">{desc.willHelpMost}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Best place to start
              </p>
              <p className="mt-1 text-sm text-zinc-700">{moduleLabel}</p>
            </div>
          </div>

          {submitError && (
            <p className="mt-6 text-sm text-red-600">{submitError}</p>
          )}

          <button
            onClick={handleCta}
            disabled={submitting}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
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
            className="mt-3 text-sm text-zinc-400 underline"
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
    <div className="flex min-h-dvh flex-col bg-white px-6 pb-12 pt-16">
      <div className="mx-auto w-full max-w-sm">
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
        <p className="mt-3 text-xs text-zinc-400">
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
              className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 p-4 text-left text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-100"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs font-medium text-zinc-400">
                {option.label}
              </span>
              <span>{option.text}</span>
            </button>
          ))}
        </div>

        {currentQuestion > 0 && (
          <button
            onClick={() => setCurrentQuestion(currentQuestion - 1)}
            className="mt-6 text-sm text-zinc-400 underline"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
