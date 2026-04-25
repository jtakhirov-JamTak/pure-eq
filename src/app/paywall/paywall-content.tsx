"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SkyBackground } from "@/components/brand/SkyBackground";

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
    <div className="relative flex min-h-dvh flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]">
      <SkyBackground variant="calm" />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center">
        <h1
          className="font-display text-[30px] leading-[1.12] text-ink text-center"
          style={{ letterSpacing: "-0.7px" }}
        >
          Keep building your <span className="italic">EQ</span>
        </h1>
        <p className="mt-3 text-center text-[14px] font-medium leading-[1.5] text-ink-soft">
          SpeakEasy helps you navigate hard conversations with more
          self-awareness, less reactivity, and better outcomes.
        </p>

        <div className="mt-7 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => setSelectedPlan("annual")}
            className={`w-full rounded-card-sm p-5 text-left transition ${
              selectedPlan === "annual"
                ? "bg-surface shadow-card ring-2 ring-brand"
                : "bg-surface shadow-soft ring-1 ring-hair"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[16px] font-bold text-ink">Annual</p>
                  <span className="rounded-pill bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.6px] text-white">
                    Best value
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] font-medium text-ink-soft">
                  $5.83/month, billed yearly
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-[26px] leading-none text-ink">
                  $69.99
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-ink-muted">
                  /year
                </p>
              </div>
            </div>
            <p className="mt-2 text-[12px] font-semibold text-[#166A3A]">
              Save 35% vs monthly
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPlan("monthly")}
            className={`w-full rounded-card-sm p-5 text-left transition ${
              selectedPlan === "monthly"
                ? "bg-surface shadow-card ring-2 ring-brand"
                : "bg-surface shadow-soft ring-1 ring-hair"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[16px] font-bold text-ink">Monthly</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink-soft">
                  Billed monthly
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[26px] leading-none text-ink">
                  $8.99
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-ink-muted">
                  /month
                </p>
              </div>
            </div>
          </button>
        </div>

        <p className="mt-4 text-center text-[12px] font-medium text-ink-soft">
          Free so far: 1 Prepare + 1 Review in your first 3 days. Subscribe for
          ongoing access.
        </p>

        <ul className="mt-5 w-full space-y-2 text-[14px] font-medium text-ink-soft">
          {[
            "Unlimited AI coaching sessions",
            "Weekly reflection with quoted evidence",
            "Cancel anytime in 1 click",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-[2px] grid h-4 w-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white"
              >
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="mt-4 text-[13px] font-medium text-danger">{error}</p>
        )}
        <button
          onClick={handleSubscribe}
          disabled={submitting}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : selectedPlan === "annual" ? (
            "Subscribe — $69.99/year"
          ) : (
            "Subscribe — $8.99/month"
          )}
        </button>

        <button
          onClick={() => router.push("/")}
          className="mt-3 inline-flex min-h-11 items-center justify-center px-4 text-[13px] font-medium text-ink-soft underline active:opacity-70"
        >
          Not yet
        </button>
      </div>
    </div>
  );
}
