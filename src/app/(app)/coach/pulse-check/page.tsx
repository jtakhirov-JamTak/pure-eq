"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { CoachPage } from "@/components/coach/coach-page";
import {
  TextareaTwoColumn,
  type TextareaTwoColumnValue,
} from "@/components/coach/steps/textarea-two-column";
import {
  pageCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import {
  PULSE_NEXT_MOVE_V2_VALUES,
  CHECK_WINDOW_VALUES,
} from "@/types";
import type { AiTier, PulseNextMove, CheckWindow } from "@/types";
import { createClient } from "@/lib/supabase/client";

// Lean Pulse next-move chip labels (column next_move). Drives both the form
// branching (observe → check-window picker, ask_light → light-question field)
// and the result-screen routing CTA.
const NEXT_MOVE_LABELS: Record<PulseNextMove, string> = {
  do_nothing: "Do nothing — let it settle",
  observe: "Observe for a few days",
  ask_light: "Ask a light question",
  prepare: "Prepare for a conversation",
  repair: "Repair something",
  set_boundary: "Set a boundary",
  step_back: "Step back",
};

const CHECK_WINDOW_LABELS: Record<CheckWindow, string> = {
  "24h": "24 hours",
  "3d": "3 days",
  "7d": "7 days",
  next_interaction: "Until we next talk",
};

// Tier metadata. Coins are NOT debited yet (Slice B); these are display-only
// cost constants so the selector reads the same as the future priced flow.
const TIER_META: {
  value: AiTier;
  label: string;
  cards: string;
  coins: string;
}[] = [
  { value: "quick", label: "Quick", cards: "3 cards", coins: "4 coins" },
  { value: "deep", label: "Deep", cards: "5 cards", coins: "6 coins" },
];

// Coins redesign Slice C1 2026-05-29: lean 6-field (+2 conditional) Pulse across
// 3 pages.
//   1 notice: personName, whatFeelsOff, whatChangedVsBefore
//   2 read:   storyAndAlternative (two-column), signalTest (two-column)
//   3 route:  nextMove, checkWindow (if observe), lightCheckQuestion (if ask_light)
const PULSE_CHECK_PAGES: PageDef[] = [
  {
    pageKey: "notice",
    qs: [
      {
        key: "personName",
        title: "Who is this about?",
        prompt: "Start typing to see people you've mentioned before.",
        kind: "person",
      },
      {
        key: "whatFeelsOff",
        title: "What feels off?",
        prompt:
          "What's bugging you or pulling at your attention — even if you can't name it yet.",
        kind: "textarea",
      },
      {
        key: "whatChangedVsBefore",
        title: "What changed — and what felt fine before?",
        prompt: "Both halves matter. Name the contrast.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "read",
    qs: [
      {
        key: "storyAndAlternative",
        title:
          "What story are you telling yourself — and what's an alternative that would also fit?",
        prompt:
          "Two fields. Left: the story you've been concluding. Right: an equally plausible alternative, not the optimistic one.",
        kind: "textarea_two_column",
      },
      {
        key: "signalTest",
        title: "Over the next few days, what would tell you this is real?",
        prompt:
          "Two sides of one test. Left: what would confirm it's signal. Right: what would tell you it was just noise.",
        kind: "textarea_two_column",
      },
    ],
  },
  {
    pageKey: "route",
    qs: [
      {
        key: "nextMove",
        title: "What's your next move?",
        prompt: "Pick the closest. It shapes the feedback.",
        kind: "select_pulse_next_move",
      },
      {
        key: "checkWindow",
        title: "How long will you watch before checking again?",
        prompt: null,
        kind: "select_check_window",
        conditional: (state) => state.nextMove === "observe",
      },
      {
        key: "lightCheckQuestion",
        title: "Pre-draft a light check-in question",
        prompt:
          "One sentence. Something that opens a door without forcing them through it.",
        kind: "textarea",
        conditional: (state) => state.nextMove === "ask_light",
      },
    ],
  },
];

type AiNormal = {
  mode: "normal";
  signal_vs_noise: string;
  non_you_explanation: string;
  next_move_card: string;
  stop_checking_rule?: string;
  pattern_projection_risk?: string;
  pattern_tag: string;
};

type AiRefusal = {
  mode: "refusal";
  refusal_reason: string;
  message_to_user: string;
  suggested_resource: string;
};

type AiOutput = AiNormal | AiRefusal;

const RESULT_FIELDS: { label: string; key: keyof AiNormal }[] = [
  { label: "Signal vs. noise", key: "signal_vs_noise" },
  { label: "What might not be about you", key: "non_you_explanation" },
  { label: "Your next move", key: "next_move_card" },
  { label: "A rule to stop re-checking", key: "stop_checking_rule" },
  { label: "The pattern this is data about", key: "pattern_projection_risk" },
];

const PREFILL_KEY = "pure-eq:bys-prefill";

const PulseBackground = () => <SkyBackground variant="warm" />;

export default function PulseCheckPage() {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  const [tier, setTier] = useState<AiTier>("quick");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [pulseCheckEntryId, setPulseCheckEntryId] = useState<string | null>(
    null,
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // On a 403 (free Pulse already used) show an inline upgrade panel instead of
  // redirecting — a hard router.push would unmount the form and discard the
  // user's whole multi-step entry at the upgrade moment (free_one retry-UX rule).
  const [gated, setGated] = useState(false);
  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = PULSE_CHECK_PAGES.length;
  const currentPage = PULSE_CHECK_PAGES[pageIndex];

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  // When `nextMove` changes, clear any conditional field that its new value no
  // longer reveals, so a stale value can't leak into POST. (Conditional Q value
  // cleanup — CLAUDE.md lesson.)
  function setNextMove(value: PulseNextMove) {
    setData((d) => {
      const next: Record<string, unknown> = { ...d, nextMove: value };
      if (value !== "observe") delete next.checkWindow;
      if (value !== "ask_light") delete next.lightCheckQuestion;
      return next;
    });
  }

  function canAdvance(): boolean {
    return pageCanAdvance(currentPage, data);
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (pageIndex < totalPages - 1) {
      setPageIndex(pageIndex + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (pageIndex > 0) setPageIndex(pageIndex - 1);
  }

  async function handleSubmit() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const storyAndAlternative =
        (data.storyAndAlternative as TextareaTwoColumnValue | undefined) ?? {
          left: "",
          right: "",
        };
      const signalTest =
        (data.signalTest as TextareaTwoColumnValue | undefined) ?? {
          left: "",
          right: "",
        };
      const nextMove = data.nextMove as PulseNextMove | undefined;
      const body = {
        tier,
        personName: data.personName,
        whatFeelsOff: data.whatFeelsOff,
        whatChangedVsBefore: data.whatChangedVsBefore,
        storyAndAlternative: {
          story: storyAndAlternative.left,
          alternative: storyAndAlternative.right,
        },
        signalTestConfirm: signalTest.left,
        signalTestDisconfirm: signalTest.right,
        nextMove,
        checkWindow: (data.checkWindow as CheckWindow | undefined) ?? null,
        lightCheckQuestion:
          (data.lightCheckQuestion as string | undefined) ?? null,
        personId: personId || null,
        idempotencyKey: idempotencyKeyRef.current,
      };
      const res = await fetch("/api/coach/pulse-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        setGated(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.pulseCheckEntryId === "string") {
        setPulseCheckEntryId(result.pulseCheckEntryId);
      }
      if (result.aiOutput) {
        setAiOutput(result.aiOutput as AiOutput);
      } else {
        setSavedMessage(
          result.message ??
            "Saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("pulse-check submit failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  function retryCoaching() {
    setSavedMessage(null);
    setAiOutput(null);
    handleSubmit();
  }

  // ============================================================
  // Routing matrix CTA — runs on the result screen, switches on the lean
  // `nextMove` chip to give the user a single forward move.
  // ============================================================
  function chipCta(
    chip: string,
  ): { label: string; onClick: () => void } | null {
    if (chip === "prepare") {
      const personParam = personId ? `?personId=${personId}` : "";
      return {
        label: "Start a Prepare",
        onClick: () => router.push(`/coach/prepare${personParam}`),
      };
    }
    if (chip === "ask_light") {
      return {
        label: "Check this before I send it",
        onClick: () => handoffToBys(),
      };
    }
    // do_nothing / observe / repair / set_boundary / step_back → no forward
    // route yet (standalone Repair ships in Slice D; the rest are "hold").
    return null;
  }

  function handoffToBys() {
    const draftText = (data.lightCheckQuestion as string | undefined) ?? "";
    if (!draftText.trim() || !currentUserId) {
      router.push("/coach/before-send");
      return;
    }
    try {
      const payload = {
        draftText,
        messageType: "check_in" as const,
        sourcePulseCheckEntryId: pulseCheckEntryId,
        userId: currentUserId,
        stashedAt: Date.now(),
      };
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage write failure is non-fatal — BYS will start empty.
    }
    router.push("/coach/before-send");
  }

  // ============================================================
  // Result screens
  // ============================================================
  if (aiOutput && aiOutput.mode === "refusal" && isRefusal(aiOutput)) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <PulseBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          A note before you go further.
        </h2>
        <div className="mt-5 rounded-card-sm bg-surface p-4 shadow-soft">
          <p className="text-[14px] font-medium leading-[1.55] text-ink">
            {aiOutput.message_to_user}
          </p>
        </div>
        <button
          onClick={() => router.push("/coach")}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Back to Coach
        </button>
      </div>
    );
  }

  if (aiOutput && aiOutput.mode === "normal") {
    const visible = RESULT_FIELDS.filter(({ key }) => {
      const v = aiOutput[key];
      return typeof v === "string" && v.trim().length > 0;
    });
    const cta = chipCta((data.nextMove as string) ?? "");
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <PulseBackground />
        <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-ink">
          Pulse Check
        </span>
        <h2
          className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Your <span className="italic">read</span>.
        </h2>
        <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Keep each card, edit it in your words, or mark it not true.
        </p>
        <div className="mt-5 space-y-3">
          {visible.map(({ label, key }) => {
            const text = aiOutput[key] as string;
            return pulseCheckEntryId ? (
              <EditableCard
                key={key}
                label={label}
                value={text}
                cardKey={key}
                entryTable="pulse_check_entries"
                entryId={pulseCheckEntryId}
              />
            ) : (
              <div
                key={key}
                className="rounded-card-sm bg-surface p-4 shadow-soft animate-card-in"
              >
                <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                  {label}
                </p>
                <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                  {text}
                </p>
              </div>
            );
          })}
        </div>
        {cta && (
          <button
            onClick={cta.onClick}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
          >
            {cta.label}
          </button>
        )}
        <button
          onClick={() => router.push("/coach")}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
        >
          Done
        </button>
      </div>
    );
  }

  if (savedMessage) {
    const cta = chipCta((data.nextMove as string) ?? "");
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <PulseBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Saved
        </h2>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          {savedMessage}
        </p>
        <button
          onClick={retryCoaching}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Try again for coaching feedback
        </button>
        {cta && (
          <button
            onClick={cta.onClick}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            {cta.label}
          </button>
        )}
        <button
          onClick={() => router.push("/coach")}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
        >
          Back to Coach
        </button>
      </div>
    );
  }

  if (gated) {
    return (
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <PulseBackground />
        <h2 className="font-display text-[24px] leading-[1.15] text-ink">
          You&rsquo;ve used your free Pulse Check
        </h2>
        <p className="mt-3 max-w-sm text-[14px] font-medium leading-[1.5] text-ink-soft">
          Subscribe to keep getting coaching feedback. Your entry is still
          here — tap below to go back to it anytime.
        </p>
        <button
          onClick={() => router.push("/paywall")}
          className="mt-6 flex h-12 w-full max-w-xs items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98]"
        >
          See plans
        </button>
        <button
          onClick={() => setGated(false)}
          className="mt-3 inline-flex min-h-11 items-center justify-center px-4 text-[13px] font-medium text-ink-soft underline active:opacity-70"
        >
          Back to my entry
        </button>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <PulseBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Reading your pulse check…
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Form
  // ============================================================
  function renderStep(step: StepDef) {
    if (step.kind === "person") {
      return (
        <PersonPicker
          value={(data.personName as string | undefined) ?? ""}
          onChange={(next) => setFieldValue("personName", next)}
          onPersonSelect={(id) => setPersonId(id)}
          selectedPersonId={personId}
        />
      );
    }
    if (step.kind === "textarea") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <VoiceInput
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          rows={step.rows ?? 4}
          placeholder="Type or tap the mic to speak..."
        />
      );
    }
    if (step.kind === "textarea_two_column") {
      const value = data[step.key] as TextareaTwoColumnValue | undefined;
      if (step.key === "signalTest") {
        return (
          <TextareaTwoColumn
            value={value}
            onChange={(next) => setFieldValue(step.key, next)}
            leftLabel="If it's real signal"
            rightLabel="If it's just noise"
            leftPlaceholder="What you'd see that confirms it — a behavior, a message, a tone."
            rightPlaceholder="What you'd see that means you can let it go."
          />
        );
      }
      return (
        <TextareaTwoColumn
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          leftLabel="The story"
          rightLabel="An equally plausible alternative"
          leftPlaceholder="The meaning you've been concluding."
          rightPlaceholder="A take that would also fit — not the optimistic one."
        />
      );
    }
    if (step.kind === "select_pulse_next_move") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {PULSE_NEXT_MOVE_V2_VALUES.map((move) => (
            <button
              key={move}
              type="button"
              onClick={() => setNextMove(move)}
              className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                value === move
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {NEXT_MOVE_LABELS[move]}
            </button>
          ))}
        </div>
      );
    }
    if (step.kind === "select_check_window") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {CHECK_WINDOW_VALUES.map((win) => (
            <button
              key={win}
              type="button"
              onClick={() => setFieldValue(step.key, win)}
              className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                value === win
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {CHECK_WINDOW_LABELS[win]}
            </button>
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PulseBackground />

      {/* Tier selector — Quick (3 cards) vs Deep (5 cards). Display-only coin
          costs; nothing is debited until Slice B. */}
      <div className="mb-4">
        <div className="flex gap-2">
          {TIER_META.map((t) => {
            const active = tier === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                aria-pressed={active}
                className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-card-sm px-3 py-2 transition active:scale-[0.99] ${
                  active
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                <span className="text-[14px] font-bold">{t.label}</span>
                <span
                  className={`text-[11px] font-medium ${active ? "text-white/80" : "text-ink-muted"}`}
                >
                  {t.cards} · {t.coins}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <CoachPage
        eyebrow="Pulse Check"
        eyebrowClassName="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-ink"
        pageIndex={pageIndex}
        totalPages={totalPages}
        page={currentPage}
        state={data}
        renderStep={renderStep}
        pageTitle={null}
      />
      {submitError && (
        <p className="mt-3 text-[13px] font-medium text-danger">{submitError}</p>
      )}
      <div className="mt-6 flex gap-3">
        {pageIndex > 0 && (
          <button
            onClick={handleBack}
            className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canAdvance()}
          className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {pageIndex === totalPages - 1 ? "Get Read" : "Next"}
        </button>
      </div>
    </div>
  );
}
