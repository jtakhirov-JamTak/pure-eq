"use client";

// Coins purchase UI (Slice B2). Renders the 4 founder-final packs + the user's
// balance. "Buy" creates a Stripe Checkout Session server-side and redirects the
// browser to Stripe's hosted page — coins are granted by the webhook on payment,
// never here.

import { useState } from "react";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { pillAccentClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PackView = {
  key: string;
  name: string;
  coins: number;
  priceLabel: string;
};

export function CoinsClient({
  balance,
  packs,
  purchaseState,
}: {
  balance: number;
  packs: PackView[];
  purchaseState: "success" | "cancelled" | null;
}) {
  // Holds the pack key whose checkout is in flight (disables just that button).
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packKey: string) {
    if (submitting) return;
    setSubmitting(packKey);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packKey }),
      });
      if (!res.ok) {
        // Surface the server's own message for a deliberate halt (503,
        // DISABLE_CHECKOUT) so it doesn't read as a transient glitch. Other
        // errors fall through to the generic retry copy in catch.
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}));
          setError(
            typeof body?.error === "string"
              ? body.error
              : "Coin purchases are temporarily unavailable. Please try again later.",
          );
          setSubmitting(null);
          return;
        }
        throw new Error(`status ${res.status}`);
      }
      const json = await res.json();
      if (!json.url) throw new Error("no url");
      // Hand off to Stripe. Do NOT clear `submitting` — the page is navigating
      // away; clearing would briefly re-enable the button mid-redirect.
      window.location.href = json.url as string;
    } catch (err) {
      console.error("checkout failed", (err as Error)?.message);
      setError("Couldn't start checkout. Please try again.");
      setSubmitting(null);
    }
  }

  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(8rem,env(safe-area-inset-bottom))]">
      <StormBackground />

      <h1
        className="font-display text-[28px] font-medium leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Coins
      </h1>
      <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
        Coins pay for AI feedback. Saving your work, your conversations, and the
        tools are always free. Coins never expire — every pack is a one-time
        purchase, no subscription.
      </p>

      <p className="mt-4 text-[15px] font-semibold text-ink-soft">
        You have{" "}
        <span className="text-ink">
          {balance} {balance === 1 ? "coin" : "coins"}
        </span>
        .
      </p>

      {purchaseState === "success" && (
        <Card className="mt-4">
          <p className="text-[14px] font-semibold leading-[1.5] text-ink">
            Payment received — thank you.
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.5] text-ink-soft">
            Your coins land within a few seconds. Refresh this page if the
            balance above hasn&rsquo;t updated yet.
          </p>
        </Card>
      )}
      {purchaseState === "cancelled" && (
        <Card className="mt-4">
          <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
            Checkout cancelled — you haven&rsquo;t been charged.
          </p>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {packs.map((pack) => {
          const inFlight = submitting === pack.key;
          const disabled = submitting !== null;
          return (
            <Card
              key={pack.key}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-ink">{pack.name}</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink-soft">
                  {pack.coins.toLocaleString()} coins
                </p>
              </div>
              <button
                onClick={() => buy(pack.key)}
                disabled={disabled}
                aria-label={`Buy ${pack.name} for ${pack.priceLabel}`}
                className={cn(pillAccentClass, "h-12 min-w-[104px] px-5 text-[14px]")}
              >
                {inFlight ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent-text/30 border-t-accent-text" />
                ) : (
                  pack.priceLabel
                )}
              </button>
            </Card>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 text-[13px] font-medium text-danger">{error}</p>
      )}

      <p className="mt-6 text-[12px] font-medium leading-[1.5] text-ink-muted">
        Payments are processed securely by Stripe. Quick AI feedback costs 4
        coins, Deep costs 6.
      </p>
    </div>
  );
}
