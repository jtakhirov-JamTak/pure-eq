// Pure EQ domain — replace in fork.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PaywallContent() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartTrial() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      router.push("/coach");
      router.refresh();
    } catch (err) {
      console.error("subscribe failed", (err as Error)?.message);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <h1 className="text-2xl font-bold text-zinc-900">
          You&apos;ve completed your first session
        </h1>
        <p className="mt-3 text-center text-base text-zinc-500">
          Pure EQ helps you navigate hard conversations with more
          self-awareness, less reactivity, and better outcomes.
        </p>

        {/* Price card */}
        <div className="mt-8 w-full max-w-sm rounded-2xl border border-zinc-200 p-6">
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-400">
              Start with
            </p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">
              $0.99
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              7-day starter access
            </p>
          </div>

          <div className="mt-4 border-t border-zinc-100 pt-4 text-center">
            <p className="text-sm text-zinc-500">
              then <span className="font-semibold text-zinc-900">$9.99/month</span>
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              cancel anytime in 1 click
            </p>
          </div>

          <div className="mt-6 space-y-2 text-sm text-zinc-600">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">&#10003;</span>
              <span>Unlimited AI coaching sessions</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">&#10003;</span>
              <span>Regulation tools for tough moments</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">&#10003;</span>
              <span>Pattern insights over time</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
        <button
          onClick={handleStartTrial}
          disabled={submitting}
          className="mt-6 flex h-12 w-full max-w-sm items-center justify-center rounded-full bg-zinc-900 text-base font-semibold text-white transition-colors hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-50"
        >
          {submitting ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            "Start 7-Day Trial"
          )}
        </button>

        {/* Decline */}
        <button
          onClick={() => router.push("/")}
          className="mt-4 flex h-11 w-full max-w-sm items-center justify-center text-sm text-zinc-400 underline"
        >
          Not yet
        </button>
      </div>
    </div>
  );
}
