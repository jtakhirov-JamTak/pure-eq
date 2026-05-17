"use client";

import { useRef, useState } from "react";
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
import { TextareaIfThen } from "@/components/coach/steps/textarea-if-then";
import {
  pageCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { BODY_LOCATION_VALUES } from "@/lib/validation";
import { safeUUID } from "@/lib/utils";
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

// Coach SOT 2026-05-08 follow-up (feat/sot-followup-0037): 5 pages,
// 16 steps. The 0036 layout missed several Qs from the locked SOT
// cross-eval — primary_emotion, default_pattern, neutral_check_question.
// The body chip moves OFF opener TO primary_emotion (felt sense going in
// is paired with the named emotion, not the opener). situation moves
// from Page 2 to Page 1 alongside person + relationship.
//
// Page-to-state shape:
//   1 setup:       personName, relationship, situation
//   2 self_state:  primaryEmotionWithBody (text+body chip), emotionAsData, defaultPattern
//   3 their_read:  observedFromThem, theirStateHedged, fairestVersion
//   4 shape:       predictedReaction, hiddenExpectation, specificShift, outcomeFloor
//   5 action:      neutralCheckQuestion, opener (text only), triggerPlan
const PREPARE_PAGES: PageDef[] = [
  {
    pageKey: "setup",
    qs: [
      {
        key: "personName",
        title: "Who is this with?",
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
        key: "situation",
        title: "What is this conversation about?",
        prompt: "Describe the situation in facts only. What needs to be discussed?",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "self_state",
    qs: [
      {
        key: "primaryEmotionWithBody",
        title: "What are you feeling — and where do you notice it in your body?",
        prompt:
          "The emotion you're carrying into this conversation. Then point at where it sits.",
        kind: "textarea_with_body_chip",
      },
      {
        key: "emotionAsData",
        title: "What is your emotion telling you?",
        prompt:
          "The feeling you're carrying in is signal. Treat it as data, not noise — what is it pointing at?",
        kind: "textarea",
      },
      {
        key: "defaultPattern",
        title: "When you feel that way, what do you usually do that gets in the way?",
        prompt: "Your default. Not the version you wish was true.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "their_read",
    qs: [
      {
        key: "observedFromThem",
        title: "What have you observed from them recently?",
        prompt: "Specific behaviors — body, tone, words. Not interpretations yet.",
        kind: "textarea",
      },
      {
        key: "theirStateHedged",
        title: "Your hedged read of their state",
        prompt:
          "Your best guess at where they are right now, hedged: 'They might be…'",
        kind: "textarea",
      },
      {
        key: "fairestVersion",
        title: "The fairest version of them you can name",
        prompt:
          "Not the worst-case read. The most charitable take that still fits what you've observed.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "shape",
    qs: [
      {
        key: "predictedReaction",
        title: "How do you predict they'll react?",
        prompt: "To the way you're planning to bring this up.",
        kind: "textarea",
      },
      {
        key: "hiddenExpectation",
        title: "What hidden expectation are you carrying in?",
        prompt:
          "The thing you're hoping for or assuming will happen, that you haven't said out loud — even to yourself.",
        kind: "textarea",
      },
      {
        key: "specificShift",
        title: "What specific shift do you want?",
        prompt: "One concrete change in them, the situation, or the relationship.",
        kind: "textarea",
      },
      {
        key: "outcomeFloor",
        title: "What's your outcome floor?",
        prompt:
          "If the shift doesn't fully land, what would still be acceptable? The line below which it's a bad outcome.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "action",
    qs: [
      {
        key: "neutralCheckQuestion",
        title: "What's one neutral question you can ask to check your read instead of assuming?",
        prompt:
          "Not 'are we okay.' Something specific that would actually surface info.",
        kind: "textarea",
      },
      {
        key: "opener",
        title: "What are the first 1–2 sentences you'd actually open with?",
        prompt:
          "The actual words. Say it out loud now to test how it sounds. Then check: could it land as pressure, blame, or a test?",
        kind: "textarea",
      },
      {
        key: "triggerPlan",
        title: "If you get triggered, what will you do instead?",
        prompt: "Complete: 'If I notice myself feeling [your primary emotion], then I will ___ instead of ___.' The second blank is your default move from the previous page.",
        kind: "textarea_if_then",
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

const PrepareBackground = () => <SkyBackground variant="calm" />;

function NormalResultCard({
  output,
  onBack,
}: {
  output: AiNormal;
  onBack: () => void;
}) {
  const visible = RESULT_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <span className="inline-block rounded-pill bg-brand px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-white">
        Prepare
      </span>
      <h2
        className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Your <span className="italic">feedback</span>.
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
                {output[key]}
              </p>
            </div>
          );
        })}
      </div>
      <button
        onClick={onBack}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  );
}

function RefusalCard({
  output,
  onBack,
}: {
  output: AiRefusal;
  onBack: () => void;
}) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <h2
        className="font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        A note before you go further.
      </h2>
      <div className="mt-5 rounded-card-sm bg-surface p-4 shadow-soft">
        <p className="text-[14px] font-medium leading-[1.55] text-ink">
          {output.message_to_user}
        </p>
      </div>
      <button
        onClick={onBack}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Back to Coach
      </button>
    </div>
  );
}

function EmptyOutputCard({
  onRetryCoaching,
  onBack,
  message,
}: {
  onRetryCoaching: () => void;
  onBack: () => void;
  message?: string;
}) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <h2
        className="font-display text-[28px] leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.6px" }}
      >
        Entry saved
      </h2>
      <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
        {message ??
          "Your entry is saved, but no coaching feedback is available to show for this one."}
      </p>
      <button
        onClick={onRetryCoaching}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Try again for coaching feedback
      </button>
      <button
        onClick={onBack}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
      >
        Back to Coach
      </button>
    </div>
  );
}

export default function PreparePage() {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  // State is keyed by SOT field name where flat, by step.key where the
  // step bundles fields (openerWithBody → { text, bodyLocation }).
  const [data, setData] = useState<Record<string, unknown>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
  }

  const totalPages = PREPARE_PAGES.length;
  const currentPage = PREPARE_PAGES[pageIndex];

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
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
      // SOT 2026-05-08 Commit 4: body chip is paired with primaryEmotion
      // (not opener). Flatten the textarea_with_body_chip step value into
      // primaryEmotion (text) + bodyLocation (chip). opener is now a plain
      // textarea with no body chip.
      const primaryEmotion =
        (data.primaryEmotionWithBody as TextareaWithBodyChipValue | undefined)
          ?.text ?? "";
      const bodyLocation =
        (data.primaryEmotionWithBody as TextareaWithBodyChipValue | undefined)
          ?.bodyLocation ?? "";
      const body = {
        personName: data.personName,
        relationship: data.relationship,
        situation: data.situation,
        primaryEmotion,
        bodyLocation,
        emotionAsData: data.emotionAsData,
        defaultPattern: data.defaultPattern,
        observedFromThem: data.observedFromThem,
        theirStateHedged: data.theirStateHedged,
        fairestVersion: data.fairestVersion,
        predictedReaction: data.predictedReaction,
        hiddenExpectation: data.hiddenExpectation,
        specificShift: data.specificShift,
        outcomeFloor: data.outcomeFloor,
        neutralCheckQuestion: data.neutralCheckQuestion,
        opener: data.opener,
        triggerPlan: data.triggerPlan,
        personId: personId || null,
        idempotencyKey: idempotencyKeyRef.current,
      };
      const res = await fetch("/api/coach/prepare", {
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
      if (result.aiOutput) {
        setAiOutput(result.aiOutput as AiOutput);
      } else {
        setSavedMessage(
          result.message ??
            "Your entry is saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("prepare submit failed", (err as Error)?.message);
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

  // --- Result screens ---
  if (aiOutput) {
    if (aiOutput.mode === "normal") {
      return (
        <NormalResultCard
          output={aiOutput}
          onBack={() => router.push("/coach")}
        />
      );
    }
    if (isRefusal(aiOutput)) {
      return (
        <RefusalCard
          output={aiOutput}
          onBack={() => router.push("/coach")}
        />
      );
    }
    return (
      <EmptyOutputCard
        onRetryCoaching={retryCoaching}
        onBack={() => router.push("/coach")}
      />
    );
  }

  if (savedMessage) {
    return (
      <EmptyOutputCard
        onRetryCoaching={retryCoaching}
        onBack={() => router.push("/coach")}
        message={savedMessage}
      />
    );
  }

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <PrepareBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Generating your coaching feedback…
          </p>
        </div>
      </div>
    );
  }

  // --- Form: page-level renderer ---
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
      // The relationship select. Auto-skipped when the person picker
      // already populated relationship — see currentPage.qs[1].conditional
      // below in PageDef build... actually we use PersonPicker auto-fill;
      // when a person is chosen, relationship is set inline. The user can
      // still see/change it on the form. No conditional hide here.
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
          rows={4}
          placeholder="Type or tap the mic to speak..."
        />
      );
    }
    if (step.kind === "textarea_if_then") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <TextareaIfThen
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
        />
      );
    }
    if (step.kind === "textarea_with_body_chip") {
      const value = data[step.key] as TextareaWithBodyChipValue | undefined;
      return (
        <TextareaWithBodyChip
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          chipValues={BODY_LOCATION_VALUES}
        />
      );
    }
    return null;
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />
      <CoachPage
        eyebrow="Prepare"
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
          {pageIndex === totalPages - 1 ? "Get Feedback" : "Next"}
        </button>
      </div>
    </div>
  );
}
