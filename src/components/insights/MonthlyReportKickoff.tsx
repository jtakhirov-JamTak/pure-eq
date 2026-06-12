"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  monthlyReportOutputSchema,
  type MonthlyReportOutput,
} from "@/lib/ai/schemas";
import {
  isReportSnapshot,
  MIN_ENTRIES_FOR_REPORT,
  type ReportSnapshot,
} from "@/lib/insights/report-snapshot";
import { COIN_COSTS } from "@/types";
import { useCoinBalance } from "@/components/coach/coin-ui";
import { MonthlyReportCard } from "./MonthlyReportCard";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { pillAccentClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mirrors ReflectionKickoff (the weekly's explicit pay-to-generate CTA) —
// same state machine, same error taxonomy, same a11y live region. The charge
// happens server-side only on tap; re-visits inside the 28-day window render
// the cached row on the page (this component isn't even mounted).

const KIND_LABELS: Record<string, string> = {
  insert_failed: "couldn't save",
  db_read_failed: "couldn't read your entries",
  api_error: "AI service issue",
  schema_mismatch: "unexpected AI response",
  json_parse: "unexpected AI response",
  no_text: "unexpected AI response",
  banned_phrase: "response blocked by content filter",
  coin_charge_failed: "couldn't process coins",
};

const COST = COIN_COSTS.monthly_report;

interface Props {
  // True when a report exists but is stale (outside the 28-day window or a
  // bumped generator_version) — tailors the CTA copy.
  hasStaleCached: boolean;
}

type State =
  | { phase: "idle" }
  | { phase: "generating" }
  | {
      phase: "ready";
      report: MonthlyReportOutput;
      snapshot: ReportSnapshot;
      generatedAt: string;
    }
  | { phase: "error"; message: string; kind?: string }
  | { phase: "insufficient"; needed: number; balance: number };

export function MonthlyReportKickoff({ hasStaleCached }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const { balance, refresh } = useCoinBalance();
  const inFlight = useRef(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function generate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "generating" });

    try {
      const res = await fetch("/api/insights/monthly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 402 && data?.error === "insufficient_coins") {
        setState({
          phase: "insufficient",
          needed: typeof data.needed === "number" ? data.needed : COST,
          balance: typeof data.balance === "number" ? data.balance : 0,
        });
        return;
      }

      if (res.status === 409 && data?.error === "insufficient_entries") {
        const needed =
          typeof data.needed === "number" ? data.needed : MIN_ENTRIES_FOR_REPORT;
        setState({
          phase: "error",
          message: `You need at least ${needed} entries in the last month before a report. Keep using Coach and the tools.`,
        });
        return;
      }

      if (!res.ok) {
        setState({
          phase: "error",
          message:
            typeof data?.error === "string"
              ? data.error
              : "Could not generate your report right now.",
          kind: typeof data?.kind === "string" ? data.kind : undefined,
        });
        return;
      }

      if (!data?.report?.ai_json || !data?.report?.generated_at) {
        setState({
          phase: "error",
          message: "Generation returned an unexpected shape.",
        });
        return;
      }

      // Defensive re-parse of BOTH jsonb payloads — a cache-hit branch
      // returns a stored row that could have drifted.
      const parsed = monthlyReportOutputSchema.safeParse(data.report.ai_json);
      if (!parsed.success || !isReportSnapshot(data.report.server_json)) {
        setState({
          phase: "error",
          message: "Generation returned an unexpected shape.",
          kind: "schema_mismatch",
        });
        return;
      }

      setState({
        phase: "ready",
        report: parsed.data,
        snapshot: data.report.server_json,
        generatedAt: data.report.generated_at as string,
      });
    } catch {
      setState({
        phase: "error",
        message:
          "Could not reach the report service. Check your connection and try again.",
      });
    } finally {
      inFlight.current = false;
      refresh();
    }
  }

  const statusText =
    state.phase === "generating"
      ? "Generating your monthly report. This can take up to a minute."
      : state.phase === "ready"
        ? state.report.mode === "refusal"
          ? "Checked — not enough material for a report this month. You weren't charged."
          : "Your monthly report is ready."
        : state.phase === "error"
          ? "Could not generate your report. You weren't charged."
          : state.phase === "insufficient"
            ? "Not enough coins to generate this month's report."
            : "";

  const kindLabel =
    state.phase === "error" && state.kind ? KIND_LABELS[state.kind] : null;

  let body: ReactNode;
  if (state.phase === "ready") {
    body = (
      <MonthlyReportCard
        report={state.report}
        snapshot={state.snapshot}
        generatedAt={state.generatedAt}
      />
    );
  } else if (state.phase === "generating") {
    body = (
      <Card className="mt-4 p-5">
        <Kicker as="h2">Your monthly report</Kicker>
        <div className="mt-3 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          <p className="text-[13px] font-medium text-ink-soft">
            Reading your last 4 weeks…
          </p>
        </div>
        <p className="mt-2 text-[12px] font-medium text-ink-soft">
          This can take up to a minute.
        </p>
      </Card>
    );
  } else if (state.phase === "insufficient") {
    body = (
      <Card className="mt-4 p-5">
        <Kicker as="h2">Your monthly report</Kicker>
        <p className="mt-2 text-[14px] font-semibold leading-[1.5] text-ink">
          You need {state.needed} {state.needed === 1 ? "coin" : "coins"} for
          this — you have {state.balance}.
        </p>
        <p className="mt-1.5 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Top up and come back any time — your entries are waiting.
        </p>
        <Link
          href="/coins"
          className={cn(pillAccentClass, "mt-3 inline-flex h-11 px-5 text-[14px]")}
        >
          Get coins
        </Link>
      </Card>
    );
  } else if (state.phase === "error") {
    body = (
      <Card className="mt-4 p-5">
        <Kicker as="h2">Your monthly report</Kicker>
        {/* The DIFFERENTIATED message (server copy for 503/429/409, network
            copy offline) — not a fixed paragraph that claims "we've been
            notified" on errors nothing captured. */}
        <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink-soft">
          {state.message}
        </p>
        <p className="mt-1.5 text-[12px] font-medium text-ink-soft">
          You weren&apos;t charged.
        </p>
        {kindLabel ? (
          <p className="mt-2 text-[12px] font-medium text-ink-soft">
            Reason: {kindLabel}.
          </p>
        ) : null}
        <button
          onClick={generate}
          className={cn(pillAccentClass, "mt-4 h-12 w-full text-[14px]")}
        >
          Try again · {COST} coins
        </button>
      </Card>
    );
  } else {
    body = (
      <Card className="mt-4 p-5">
        <Kicker as="h2">Your monthly report</Kicker>
        <p className="mt-2 text-[14px] font-medium leading-[1.55] text-ink-soft">
          {hasStaleCached
            ? "Your previous report is no longer current. Generate a fresh month-level read."
            : "The month in one place: how you show up by relationship, what triggers and overwhelms you, your focus follow-through, top patterns, and an EQ rating for the month."}
        </p>
        {balance !== null && (
          <p className="mt-3 text-[13px] font-semibold text-ink-soft">
            You have{" "}
            <span className="text-ink">
              {balance} {balance === 1 ? "coin" : "coins"}
            </span>
            .
          </p>
        )}
        <button
          onClick={generate}
          className={cn(pillAccentClass, "mt-4 h-14 w-full text-[15px]")}
        >
          Generate this month&apos;s report · {COST} coins
        </button>
      </Card>
    );
  }

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {statusText}
      </div>
      {body}
    </>
  );
}
