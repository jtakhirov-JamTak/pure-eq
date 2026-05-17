"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { isRefusal } from "@/lib/coach/output-shape";
import { ACTION_FIELDS } from "@/lib/ai/schemas";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { CoachPage } from "@/components/coach/coach-page";
import {
  TextareaWithBodyChip,
  type TextareaWithBodyChipValue,
} from "@/components/coach/steps/textarea-with-body-chip";
import {
  TextareaTwoColumn,
  type TextareaTwoColumnValue,
} from "@/components/coach/steps/textarea-two-column";
import { SelectSignalNextMove } from "@/components/coach/steps/select-signal-next-move";
import {
  pageCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { BODY_LOCATION_PULSE_VALUES } from "@/lib/validation";
import { safeUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { RelationshipDomain } from "@/types";

const RELATIONSHIPS: { value: RelationshipDomain; label: string }[] = [
  { value: "partner", label: "Partner" },
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "manager", label: "Manager" },
  { value: "direct_report", label: "Direct Report" },
  { value: "coworker", label: "Coworker" },
  { value: "client", label: "Client" },
  { value: "other", label: "Other" },
];

// Coach SOT 2026-05-07 follow-up: 3-page layout matches the SOT cognitive arc.
// Page 1 = setup + what changed (so the user names the contrast before
// introspecting). Page 2 = self-state + reappraisal (story vs equally
// plausible alternative — NOT "more generous"; that trains motivated
// reasoning). Page 3 = falsifiable test + route.
// `lightCheckQuestion` is on the same page as `nextMoveChip` via intra-page
// conditional — only renders when the chip is ask_clarifying or use_bys.
const PULSE_CHECK_PAGES: PageDef[] = [
  {
    pageKey: "setup_what_changed",
    qs: [
      {
        key: "personName",
        title: "Who is this about?",
        prompt: "Start typing to see people you've mentioned before.",
        kind: "person",
      },
      {
        key: "relationship",
        title: "What is your relationship?",
        prompt: null,
        kind: "select",
      },
      {
        key: "whatFeelsOff",
        title: "What feels off?",
        prompt:
          "What's bugging you or pulling at your attention — even if you can't name it yet.",
        kind: "textarea",
      },
      {
        key: "whatChangedAndBefore",
        title: "What changed — and what felt fine before?",
        prompt: "Both halves matter. Name the contrast.",
        kind: "textarea",
      },
      {
        // 2026-05-17 fix3 (#16): use a compact textarea (rows=2) for this
        // "moment estimate" Q so Page 1 doesn't scroll ~1000px on 375px
        // viewports. The Q expects a short answer ("Sunday afternoon",
        // "after dinner") — full 4-row textarea inflates the page wall.
        key: "whenItShifted",
        title: "When did it shift?",
        prompt:
          "A moment, a day, a stretch — your best estimate of when something changed.",
        kind: "textarea",
        rows: 2,
      },
    ],
  },
  {
    pageKey: "story_vs_alternative",
    qs: [
      {
        key: "feelingAndBody",
        title: "What are you feeling, and where do you feel it?",
        prompt: "Name the feeling, then point at where it sits in your body.",
        kind: "textarea_with_body_chip",
      },
      {
        key: "theirsNotAboutYou",
        title: "What might be going on for them right now that has nothing to do with you?",
        prompt: "Work, sleep, family, health, something they're carrying. Best guess.",
        kind: "textarea",
      },
      {
        key: "storyAndAlternative",
        title: "What story are you telling yourself — and what's an alternative that would also fit?",
        prompt:
          "Two fields. Left: the story you've been concluding. Right: an equally plausible alternative, not the optimistic one.",
        kind: "textarea_two_column",
      },
    ],
  },
  {
    pageKey: "test_and_route",
    qs: [
      {
        key: "signalNoiseObservation",
        title: "What would you need to observe over the next 3–7 days to know this is signal, not noise?",
        prompt:
          "Concrete. A behavior, a message, a tone change. What would tell you 'yes, this is real'?",
        kind: "textarea",
      },
      {
        key: "nextMoveChip",
        title: "What's your next move?",
        prompt: null,
        kind: "select_signal_next_move",
      },
      {
        key: "lightCheckQuestion",
        title: "Pre-draft a light check-in question",
        prompt:
          "One sentence. Something that opens a door without forcing them through it.",
        kind: "textarea",
        conditional: (state) => {
          const chip = state.nextMoveChip as string | undefined;
          return chip === "ask_clarifying" || chip === "use_bys";
        },
      },
    ],
  },
];

type AiNormal = {
  mode: "normal";
  real_issue: string;
  reality_check_question: string;
  thing_not_to_do: string;
  they_might_need: string;
  best_next_move: string | null;
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
  { label: "The real issue", key: "real_issue" },
  { label: "Reality-check question", key: "reality_check_question" },
  { label: "Thing not to do", key: "thing_not_to_do" },
  { label: "What they might need", key: "they_might_need" },
  { label: "Best next move", key: "best_next_move" },
];

const PREFILL_KEY = "pure-eq:bys-prefill";

const PulseBackground = () => <SkyBackground variant="warm" />;

export default function PulseCheckPage() {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
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

  // When `nextMoveChip` flips off the conditional that reveals
  // `lightCheckQuestion`, clear the field so a stale value can't leak
  // into POST. (Conditional Q value cleanup — CLAUDE.md lesson.)
  function setNextMoveChip(value: string) {
    setData((d) => {
      const next: Record<string, unknown> = { ...d, nextMoveChip: value };
      const stillNeedsLight =
        value === "ask_clarifying" || value === "use_bys";
      if (!stillNeedsLight) {
        delete next.lightCheckQuestion;
      }
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
      const feelingAndBody =
        (data.feelingAndBody as TextareaWithBodyChipValue | undefined) ??
        { text: "", bodyLocation: "" };
      const storyAndAlternative =
        (data.storyAndAlternative as TextareaTwoColumnValue | undefined) ??
        { left: "", right: "" };
      const body = {
        personName: data.personName,
        relationship: data.relationship,
        whatFeelsOff: data.whatFeelsOff,
        whatChangedAndBefore: data.whatChangedAndBefore,
        whenItShifted: data.whenItShifted,
        feelingAndBody: {
          text: feelingAndBody.text,
          bodyLocation: feelingAndBody.bodyLocation,
        },
        theirsNotAboutYou: data.theirsNotAboutYou,
        storyAndAlternative: {
          story: storyAndAlternative.left,
          alternative: storyAndAlternative.right,
        },
        signalNoiseObservation: data.signalNoiseObservation,
        nextMoveChip: data.nextMoveChip,
        lightCheckQuestion: (data.lightCheckQuestion as string | undefined) ?? null,
        personId: personId || null,
        idempotencyKey: idempotencyKeyRef.current,
      };
      const res = await fetch("/api/coach/pulse-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        router.push("/paywall");
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (result.pulseCheckEntryId) {
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
  // Routing matrix CTA — runs on the result screen, switches on
  // `nextMoveChip` to give the user a single forward move.
  // ============================================================
  function chipCta(chip: string): { label: string; onClick: () => void } | null {
    if (chip === "wait_observe" || chip === "do_nothing") return null;
    if (chip === "regulate_first") {
      return {
        label: "Open Overwhelmed",
        onClick: () => router.push("/tools/overwhelmed"),
      };
    }
    if (chip === "prepare_conversation") {
      const personParam = personId ? `?personId=${personId}` : "";
      return {
        label: "Start a Prepare",
        onClick: () => router.push(`/coach/prepare${personParam}`),
      };
    }
    if (chip === "review") {
      const personParam = personId ? `?personId=${personId}` : "";
      return {
        label: "Open Review",
        onClick: () => router.push(`/coach/review${personParam}`),
      };
    }
    if (chip === "ask_clarifying" || chip === "use_bys") {
      return {
        label: "Check this before I send it",
        onClick: () => handoffToBys(),
      };
    }
    return null;
  }

  function handoffToBys() {
    const draftText = (data.lightCheckQuestion as string | undefined) ?? "";
    if (!draftText.trim()) {
      router.push("/coach/before-send");
      return;
    }
    if (!currentUserId) {
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
  // Result screen
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
    const cta = chipCta((data.nextMoveChip as string) ?? "");
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
        <div className="mt-5 space-y-3">
          {visible.map(({ label, key }) => {
            const isAction = ACTION_FIELDS.has(key);
            return (
              <div
                key={key}
                className={`rounded-card-sm bg-surface p-4 shadow-soft ${isAction ? "animate-action-in" : "animate-card-in"}`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                  {label}
                </p>
                <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                  {aiOutput[key]}
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

  if (savedMessage || (aiOutput && !aiOutput.mode)) {
    const cta = chipCta((data.nextMoveChip as string) ?? "");
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
          {savedMessage ??
            "Your pulse check is saved. Coaching feedback wasn't available this time."}
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
          onPersonSelect={(id, relationship) => {
            setPersonId(id);
            if (id && relationship) {
              setFieldValue("relationship", relationship);
            }
          }}
          selectedPersonId={personId}
        />
      );
    }
    if (step.kind === "select") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {RELATIONSHIPS.map((rel) => (
            <button
              key={rel.value}
              type="button"
              onClick={() => setFieldValue(step.key, rel.value)}
              className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-[14px] font-semibold transition active:scale-[0.99] ${
                value === rel.value
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {rel.label}
            </button>
          ))}
        </div>
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
    if (step.kind === "textarea_with_body_chip") {
      const value = data[step.key] as TextareaWithBodyChipValue | undefined;
      return (
        <TextareaWithBodyChip
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          chipValues={BODY_LOCATION_PULSE_VALUES}
        />
      );
    }
    if (step.kind === "textarea_two_column") {
      const value = data[step.key] as TextareaTwoColumnValue | undefined;
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
    if (step.kind === "select_signal_next_move") {
      const value = (data[step.key] as string | undefined) ?? "";
      return <SelectSignalNextMove value={value} onChange={setNextMoveChip} />;
    }
    return null;
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PulseBackground />
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
