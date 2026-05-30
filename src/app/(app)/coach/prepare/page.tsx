"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { CoachPage } from "@/components/coach/coach-page";
import { TextareaIfThen } from "@/components/coach/steps/textarea-if-then";
import {
  pageCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import { CONVERSATION_MOVES } from "@/types";
import type { AiTier, ConversationMove, RelationshipDomain } from "@/types";

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

// Conversation-move chip labels (column conversation_move). The move frames
// the AI prompt — what KIND of conversation this is.
const CONVERSATION_MOVE_LABELS: Record<ConversationMove, string> = {
  clarify: "Clear up a misunderstanding",
  ask: "Ask for something",
  boundary: "Set a boundary",
  share: "Share how I feel",
  decide: "Decide something together",
  pause: "Take a pause / cool down",
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

// Coins redesign Slice A 2026-05-29: lean 8-field Prepare across 3 pages.
//   1 setup:   personName, relationship, conversationMove
//   2 context: situation (facts), fairestVersion
//   3 plan:    hiddenAskAndFloor, opener, triggerPlan
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
        key: "conversationMove",
        title: "What kind of conversation is this?",
        prompt: "The move you're trying to make. It shapes the feedback.",
        kind: "select_conversation_move",
      },
    ],
  },
  {
    pageKey: "context",
    qs: [
      {
        key: "situation",
        title: "What is this conversation about?",
        prompt:
          "Describe the situation in facts only. What needs to be discussed?",
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
    pageKey: "plan",
    qs: [
      {
        key: "hiddenAskAndFloor",
        title: "What are you secretly hoping for — and what would be good enough?",
        prompt:
          "The thing you haven't said out loud, plus the outcome floor you could still live with.",
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
        prompt:
          "Complete: 'If I notice myself getting [reaction], then I will ___ instead of ___.'",
        kind: "textarea_if_then",
      },
    ],
  },
];

type AiNormal = {
  mode: "normal";
  pressure_check: string;
  cleaner_opener: string;
  predicted_reaction: string;
  neutral_check_question?: string;
  deeper_read?: string;
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
  { label: "Pressure check", key: "pressure_check" },
  { label: "A cleaner opener", key: "cleaner_opener" },
  { label: "Predicted reaction", key: "predicted_reaction" },
  { label: "Neutral check question", key: "neutral_check_question" },
  { label: "A deeper read", key: "deeper_read" },
];

const PrepareBackground = () => <SkyBackground variant="calm" />;

function NormalResultCard({
  output,
  entryId,
  onBack,
}: {
  output: AiNormal;
  entryId: string | null;
  onBack: () => void;
}) {
  const visible = RESULT_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
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
      <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
        Keep each card, edit it in your words, or mark it not true.
      </p>
      <div className="mt-5 space-y-3">
        {visible.map(({ label, key }) => {
          const text = output[key] as string;
          return entryId ? (
            <EditableCard
              key={key}
              label={label}
              value={text}
              cardKey={key}
              entryTable="prepare_entries"
              entryId={entryId}
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
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
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
    <div className="relative min-h-full px-5 pt-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
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
  const [tier, setTier] = useState<AiTier>("quick");
  // State is keyed by field name (all lean fields are flat strings/enums).
  const [data, setData] = useState<Record<string, unknown>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [prepareEntryId, setPrepareEntryId] = useState<string | null>(null);
  // On a 403 (free Prepare already used) we show an inline upgrade panel
  // instead of redirecting — a hard router.push would unmount the form and
  // discard the user's whole multi-step entry at the exact upgrade moment.
  const [gated, setGated] = useState(false);
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
      const body = {
        tier,
        personName: data.personName,
        relationship: data.relationship,
        conversationMove: data.conversationMove,
        situation: data.situation,
        fairestVersion: data.fairestVersion,
        hiddenAskAndFloor: data.hiddenAskAndFloor,
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
        // Free Prepare consumed. Keep the form mounted so the user's entry
        // isn't lost — surface an inline upgrade panel instead of redirecting.
        setGated(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.prepareEntryId === "string") {
        setPrepareEntryId(result.prepareEntryId);
      }
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
          entryId={prepareEntryId}
          onBack={() => router.push("/coach")}
        />
      );
    }
    if (isRefusal(aiOutput)) {
      return (
        <RefusalCard output={aiOutput} onBack={() => router.push("/coach")} />
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

  if (gated) {
    return (
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <PrepareBackground />
        <h2 className="font-display text-[24px] leading-[1.15] text-ink">
          You&rsquo;ve used your free Prepare
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
    if (step.kind === "select_conversation_move") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {CONVERSATION_MOVES.map((move) => (
            <button
              key={move}
              type="button"
              onClick={() => setFieldValue(step.key, move)}
              className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-[14px] font-semibold transition active:scale-[0.99] ${
                value === move
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {CONVERSATION_MOVE_LABELS[move]}
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
    return null;
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <PrepareBackground />

      {/* Tier selector — Quick (3 cards) vs Deep (5 cards). Display-only
          coin costs; nothing is debited until Slice B. */}
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
