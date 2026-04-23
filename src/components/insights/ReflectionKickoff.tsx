"use client";

import { useEffect, useRef, useState } from "react";
import type { ReflectionOutput } from "@/lib/ai/schemas";
import { ReflectionCard } from "./ReflectionCard";

interface Props {
  // When true, the page already had a fresh reflection and this component
  // is just a fallback. Used by the page to differentiate "no data yet"
  // from "data exists but stale."
  hasStaleCached: boolean;
}

type State =
  | { phase: "loading" }
  | { phase: "ready"; reflection: ReflectionOutput; generatedAt: string }
  | { phase: "error"; message: string; kind?: string };

/**
 * Client-side kickoff: auto-POSTs to /api/insights/generate on mount, shows
 * a loading state, renders the ReflectionCard when the POST resolves.
 *
 * The 7-day idempotency short-circuit on the server side means loading
 * this component repeatedly inside a week is cost-free — each POST
 * returns the cached row without calling Claude.
 *
 * Strict-mode double-mount is guarded via useRef (CLAUDE.md lesson):
 * useState is async and can't prevent the race.
 */
export function ReflectionKickoff({ hasStaleCached }: Props) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/insights/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;

        if (!res.ok) {
          setState({
            phase: "error",
            message:
              typeof data?.error === "string"
                ? data.error
                : "Could not generate your reflection right now.",
            kind: typeof data?.kind === "string" ? data.kind : undefined,
          });
          return;
        }

        if (!data?.reflection?.ai_json || !data?.reflection?.generated_at) {
          setState({
            phase: "error",
            message: "Generation returned an unexpected shape.",
          });
          return;
        }

        setState({
          phase: "ready",
          reflection: data.reflection.ai_json as ReflectionOutput,
          generatedAt: data.reflection.generated_at as string,
        });
      } catch {
        if (!alive) return;
        setState({
          phase: "error",
          message:
            "Could not reach the reflection service. Check your connection and reload.",
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "ready") {
    return (
      <ReflectionCard
        reflection={state.reflection}
        generatedAt={state.generatedAt}
      />
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          Your weekly reflection
        </p>
        <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink-soft">
          Something went wrong generating this week&apos;s reflection —
          we&apos;ve been notified. Try reloading in a minute.
        </p>
        {hasStaleCached ? (
          <p className="mt-2 text-[12px] font-medium text-ink-muted">
            Your previous reflection is no longer current.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
      <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
        Your weekly reflection
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <p className="text-[13px] font-medium text-ink-soft">
          Reading your last 4 weeks…
        </p>
      </div>
      <p className="mt-2 text-[12px] font-medium text-ink-muted">
        This can take up to a minute.
      </p>
    </div>
  );
}
