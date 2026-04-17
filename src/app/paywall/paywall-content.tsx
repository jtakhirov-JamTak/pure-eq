// Pure EQ domain — replace in fork.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plan = "annual" | "monthly";

export function PaywallContent() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan>("annual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
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
          Keep building your EQ
        </h1>
        <p className="mt-3 max-w-sm text-center text-base text-zinc-500">
          Pure EQ helps you navigate hard conversations with more
          self-awareness, less reactivity, and better outcomes.
        </p>

        {/* Plan cards */}
        <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
          {/* Annual — recommended */}
          <button
            type="button"
            onClick={() => setSelectedPlan("annual")}
            className={`w-full rounded-2xl border-2 p-5 text-left transition-colors ${
              selectedPlan === "annual"
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-zinc-900">Annual</p>
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Best value
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-zinc-500">
                  $5.00/month, billed yearly
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold text-zinc-900">$59.99</p>
                <p className="text-xs text-zinc-500">/year</p>
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-green-700">
              Save 44% vs monthly
            </p>
          </button>

          {/* Monthly */}
          <button
            type="button"
            onClick={() => setSelectedPlan("monthly")}
            className={`w-full rounded-2xl border-2 p-5 text-left transition-colors ${
              selectedPlan === "monthly"
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-200 bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-lg font-bold text-zinc-900">Monthly</p>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Billed monthly
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-zinc-900">$8.99</p>
                <p className="text-xs text-zinc-500">/month</p>
              </div>
            </div>
          </button>
        </div>

        {/* What you get */}
        <div className="mt-6 w-full max-w-sm space-y-2 text-sm text-zinc-600">
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
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600">&#10003;</span>
            <span>Cancel anytime in 1 click</span>
          </div>
        </div>

        {/* CTA */}
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
        <button
          onClick={handleSubscribe}
          disabled={submitting}
          className="mt-6 flex h-12 w-full max-w-sm items-center justify-center rounded-full bg-zinc-900 text-base font-semibold text-white transition-colors hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-50"
        >
          {submitting ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : selectedPlan === "annual" ? (
            "Subscribe — $59.99/year"
          ) : (
            "Subscribe — $8.99/month"
          )}
        </button>

        {/* Decline */}
        <button
          onClick={() => router.push("/")}
          className="mt-4 flex h-11 w-full max-w-sm items-center justify-center text-sm text-zinc-500 underline"
        >
          Not yet
        </button>
      </div>
    </div>
  );
}
