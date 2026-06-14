"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SecondaryButton } from "@/components/ui/button";
import { coinCostForTier, useCoinBalance } from "@/components/coach/coin-ui";
import { safeUUID } from "@/lib/utils";
import type { AiTier } from "@/types";
import type { PrepareAiOutput } from "@/components/coach/prepare-result-cards";

// Pay-again regeneration of a saved Prepare entry's AI cards. Posts a fresh
// per-press nonce so the charge is idempotent against a double-tap but a new
// press charges again (see /api/coach/regenerate). On success either hands the
// new output back to the caller (result screen, which swaps it in place) or
// refreshes the server component (view page).
export function RegenerateButton({
  entryId,
  tier,
  onRegenerated,
}: {
  entryId: string;
  tier: AiTier;
  onRegenerated?: (output: PrepareAiOutput) => void;
}) {
  const router = useRouter();
  const { balance, refresh } = useCoinBalance();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cost = coinCostForTier(tier);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "prepare",
          entryId,
          regenerateNonce: safeUUID(),
        }),
      });
      if (res.status === 402) {
        const j = (await res.json().catch(() => ({}))) as {
          needed?: number;
          balance?: number;
        };
        setError(
          `Not enough coins — this costs ${j.needed ?? cost}, you have ${j.balance ?? 0}. Add coins, then try again.`,
        );
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const j = (await res.json()) as { aiOutput?: PrepareAiOutput | null; message?: string };
      if (!j.aiOutput) {
        setError(j.message ?? "Couldn't regenerate this time. Try again in a moment.");
        return;
      }
      refresh();
      setOpen(false);
      if (onRegenerated) onRegenerated(j.aiOutput);
      else router.refresh();
    } catch (err) {
      console.error("regenerate failed", (err as Error)?.message);
      setError("Couldn't regenerate. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SecondaryButton
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="w-full"
      >
        Regenerate feedback · {cost} coins
      </SecondaryButton>
      <ConfirmDialog
        open={open}
        title="Regenerate feedback?"
        description={`This spends ${cost} coins and replaces the current cards with a fresh take (your balance is ${balance ?? 0}). Any edits you made to these cards will be cleared.`}
        confirmLabel={`Regenerate · ${cost} coins`}
        busyLabel="Regenerating…"
        busy={busy}
        error={error}
        onConfirm={run}
        onCancel={() => {
          if (!busy) {
            setOpen(false);
            setError(null);
          }
        }}
      />
    </>
  );
}
