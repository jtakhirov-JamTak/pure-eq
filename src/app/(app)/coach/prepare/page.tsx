"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
import { stashReviewPrefill } from "@/lib/coach/review-prefill";
import { StormBackground } from "@/components/brand/StormBackground";
import { TextareaIfThen } from "@/components/coach/steps/textarea-if-then";
import {
  FlowScreen,
  FlowHeader,
  FlowFooter,
} from "@/components/ui/flow-screen";
import { ProgressDots } from "@/components/ui/progress-dots";
import { SelectableRow } from "@/components/ui/selectable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Kicker } from "@/components/ui/kicker";
import { Card } from "@/components/ui/card";
import {
  flattenVisibleSteps,
  questionCanAdvance,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import type { AiTier, ConversationType, RelationshipDomain } from "@/types";
import {
  GetFeedbackScreen,
  useCoinBalance,
  coinCostForTier,
} from "@/components/coach/coin-ui";

const RELATIONSHIPS: { value: RelationshipDomain; label: string }[] = [
  { value: "romantic", label: "Romantic" },
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
];

// "What kind of outcome are you seeking?" (redesign 2026-06-13). Each option
// names what changes by the end. The user picks a primary (1st) and an
// optional secondary (2nd). Stored in conversation_type_primary/_secondary.
const CONVERSATION_TYPE_OPTIONS: {
  value: ConversationType;
  label: string;
  description: string;
}[] = [
  { value: "understand", label: "Understand", description: "Beliefs change — now I know what's going on." },
  { value: "decide", label: "Decide", description: "Actions change — now we know what to do." },
  { value: "connect", label: "Connect", description: "Feelings change — now we feel closer." },
  { value: "align", label: "Align", description: "Expectations change — now we know if we're on the same page." },
  { value: "repair", label: "Repair", description: "Trust changes — now the damage is fixed or lessened." },
  { value: "listen", label: "Listen", description: "Emotional load changes — they feel seen and heard." },
  { value: "collaborate", label: "Collaborate", description: "The approach changes — now we're solving this together." },
  { value: "deliver", label: "Deliver", description: "Awareness changes — now they know the thing I needed to say." },
];

type ConversationTypeSel = { primary?: ConversationType; secondary?: ConversationType };

// Prepare redesign 2026-06-13 — 10 one-question screens grouped into 4
// sections (the section dots). flattenVisibleSteps yields the 10 screens in
// order; screen 1 (person_with_relationship) is the only one with two inputs.
//   1 Setup: who + relationship, what it's about, outcome sought
//   2 You:   feeling + why, your pattern
//   3 Them:  fairest version of their side, what they might feel/want
//   4 Plan:  hidden ask + floor, opener, trigger plan
const PREPARE_PAGES: PageDef[] = [
  {
    pageKey: "setup",
    qs: [
      {
        key: "personWithRelationship",
        title: "Who is this with?",
        prompt: "Start typing to see people you've mentioned before, then pick your relationship.",
        kind: "person_with_relationship",
      },
      {
        key: "situation",
        title: "What is this conversation about?",
        prompt:
          "Describe the situation in facts only. What needs to be discussed?",
        kind: "textarea",
      },
      {
        key: "conversationType",
        title: "What kind of interaction is this?",
        prompt:
          "Pick the main outcome (1st), and an optional second (2nd). What changes by the end?",
        kind: "select_conversation_type",
        requiredSubFields: ["primary"],
      },
    ],
  },
  {
    pageKey: "you",
    qs: [
      {
        key: "feelingAndWhy",
        title: "What are you feeling and why?",
        prompt:
          "I feel ___ · because ___ · this matters because ___ (what it says about you, them, or us).",
        kind: "textarea",
        placeholder: "I feel…",
      },
      {
        key: "myPattern",
        title: "When you feel that, what do you do that gets in the way?",
        prompt: "Name the pattern.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "them",
    qs: [
      {
        key: "fairestVersion",
        title: "The fairest version of their side",
        prompt:
          "Name the part of their side they'd say you got right — not the worst-case read.",
        kind: "textarea",
      },
      {
        key: "theirFeelingWant",
        title: "What might they be feeling or wanting?",
        prompt:
          "Based on what you've observed — what might they feel or want, and what outcome are they probably trying to get?",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "plan",
    qs: [
      {
        key: "hiddenAskAndFloor",
        title: "What are you hoping for that they don't know — and what would be good enough?",
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

// Reading screen (results/refusal/saved) — scrollable, renders inside the app
// shell over the body's Storm gradient.
function ReadingScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-10">
      <StormBackground />
      {children}
    </div>
  );
}

function NormalResultCard({
  output,
  entryId,
  onBack,
  personName,
  onReviewLater,
}: {
  output: AiNormal;
  entryId: string | null;
  onBack: () => void;
  // Return-loop (Phase 2): after the conversation happens, route into Review
  // pre-attached to this person. Shown only when a person was named.
  personName?: string | null;
  onReviewLater?: () => void;
}) {
  const visible = RESULT_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  return (
    <ReadingScreen>
      <Kicker className="text-accent-ink">Prepare · Complete</Kicker>
      <h1
        className="mt-3 text-[24px] font-medium leading-[1.15] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        Your feedback.
      </h1>
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
            <Card key={key} className="animate-card-in">
              <Kicker>{label}</Kicker>
              <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                {text}
              </p>
            </Card>
          );
        })}
      </div>
      <PrimaryButton onClick={onBack} className="mt-8">
        Done
      </PrimaryButton>
      {personName && onReviewLater && (
        <SecondaryButton onClick={onReviewLater} className="mt-3 w-full">
          After it happens, review how it went
        </SecondaryButton>
      )}
    </ReadingScreen>
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
    <ReadingScreen>
      <h1
        className="text-[24px] font-medium leading-[1.18] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        A note before you go further.
      </h1>
      <Card className="mt-5">
        <p className="text-[14px] font-medium leading-[1.55] text-ink">
          {output.message_to_user}
        </p>
      </Card>
      <PrimaryButton onClick={onBack} className="mt-8">
        Back to Coach
      </PrimaryButton>
    </ReadingScreen>
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
    <ReadingScreen>
      <h1
        className="text-[24px] font-medium leading-[1.18] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        Entry saved
      </h1>
      <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
        {message ??
          "Your entry is saved, but no coaching feedback is available to show for this one."}
      </p>
      <PrimaryButton onClick={onRetryCoaching} className="mt-8">
        Try again for coaching feedback
      </PrimaryButton>
      <SecondaryButton onClick={onBack} className="mt-3 w-full">
        Back to Coach
      </SecondaryButton>
    </ReadingScreen>
  );
}

// Advance gate. Most steps defer to questionCanAdvance, but the combined
// who+relationship screen stores its two answers under separate top-level keys
// (personName + relationship), so it needs both checked together.
function stepSatisfied(q: StepDef, data: Record<string, unknown>): boolean {
  if (q.kind === "person_with_relationship") {
    const name = (data.personName as string | undefined)?.trim();
    return !!name && !!data.relationship;
  }
  return questionCanAdvance(q, data);
}

export default function PreparePage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [tier, setTier] = useState<AiTier>("quick");
  // State is keyed by field name (all lean fields are flat strings/enums).
  const [data, setData] = useState<Record<string, unknown>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [prepareEntryId, setPrepareEntryId] = useState<string | null>(null);
  // Save-first coins flow (Slice B Phase 2b). After the free save succeeds we
  // land on the "Get AI feedback" screen instead of generating immediately.
  const [awaitingGenerate, setAwaitingGenerate] = useState(false);
  const [insufficient, setInsufficient] = useState<{
    needed: number;
    balance: number;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const { balance, refresh: refreshBalance } = useCoinBalance();
  const submitRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = safeUUID();
  }

  // One-question-per-screen sequence (redesign §5). Recomputed from `data`
  // each render so conditional Qs (none in Prepare today) would enter/leave
  // automatically; clamp the index when the list could shrink.
  const steps = flattenVisibleSteps(PREPARE_PAGES, data);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const current = steps[safeIndex];
  const isLastStep = safeIndex === steps.length - 1;
  const canAdvance = stepSatisfied(current.q, data);

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function handleNext() {
    if (!stepSatisfied(current.q, data)) return;
    // Terminal-button branching keys off whether a later visible step exists,
    // not an index constant (CLAUDE.md dynamic-STEPS rule).
    if (safeIndex < steps.length - 1) {
      setStepIndex(safeIndex + 1);
    } else {
      handleSave();
    }
  }

  function handleBack() {
    if (safeIndex > 0) setStepIndex(safeIndex - 1);
    else router.push("/coach");
  }

  // Build the request body. The stable idempotencyKey ties the free save and
  // the paid generate to ONE entry — the generate call reuses the saved row and
  // only the coin debit is new.
  function buildBody(generateAi: boolean) {
    const convo = (data.conversationType as ConversationTypeSel | undefined) ?? {};
    return {
      tier,
      personName: data.personName,
      relationship: data.relationship,
      conversationTypePrimary: convo.primary,
      conversationTypeSecondary: convo.secondary ?? null,
      situation: data.situation,
      feelingAndWhy: data.feelingAndWhy,
      myPattern: data.myPattern,
      fairestVersion: data.fairestVersion,
      theirFeelingWant: data.theirFeelingWant,
      hiddenAskAndFloor: data.hiddenAskAndFloor,
      opener: data.opener,
      triggerPlan: data.triggerPlan,
      personId: personId || null,
      idempotencyKey: idempotencyKeyRef.current,
      generateAi,
    };
  }

  // Step 1 — free save. No coins, no AI. Lands on the Get-feedback screen.
  async function handleSave() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/coach/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(false)),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (typeof result.prepareEntryId === "string") {
        setPrepareEntryId(result.prepareEntryId);
      }
      setInsufficient(null);
      setAwaitingGenerate(true);
      refreshBalance();
    } catch (err) {
      console.error("prepare save failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  // Step 2 — paid generate. Reuses the saved entry's idempotencyKey; a 402 means
  // the balance is short (entry already saved), surfaced inline on this screen.
  async function handleGenerate() {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setGenerateError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/coach/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(true)),
      });
      if (res.status === 402) {
        const j = (await res.json().catch(() => ({}))) as {
          needed?: number;
          balance?: number;
          prepareEntryId?: string;
        };
        if (typeof j.prepareEntryId === "string") {
          setPrepareEntryId(j.prepareEntryId);
        }
        setInsufficient({
          needed: j.needed ?? coinCostForTier(tier),
          balance: j.balance ?? 0,
        });
        setAwaitingGenerate(true);
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
        setAwaitingGenerate(false);
        setAiOutput(result.aiOutput as AiOutput);
      } else {
        setAwaitingGenerate(false);
        setSavedMessage(
          result.message ??
            "Your entry is saved. Coaching feedback wasn't available this time.",
        );
      }
      refreshBalance();
    } catch (err) {
      console.error("prepare generate failed", (err as Error)?.message);
      setGenerateError("Could not get feedback. Try again in a moment.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  function retryCoaching() {
    setSavedMessage(null);
    setAiOutput(null);
    handleGenerate();
  }

  // --- Result screens ---
  if (aiOutput) {
    if (aiOutput.mode === "normal") {
      return (
        <NormalResultCard
          output={aiOutput}
          entryId={prepareEntryId}
          onBack={() => router.push("/coach")}
          personName={(data.personName as string | undefined) ?? null}
          onReviewLater={async () => {
            await stashReviewPrefill({
              personName: ((data.personName as string | undefined) ?? "").trim(),
              personId,
              source: "prepare_followup",
            });
            router.push("/coach/review");
          }}
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

  if (submitting) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-5">
        <StormBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-hairline-strong border-t-accent" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Generating your coaching feedback…
          </p>
        </div>
      </div>
    );
  }

  if (awaitingGenerate) {
    return (
      <GetFeedbackScreen
        background={<StormBackground />}
        eyebrow={<Kicker className="text-accent-ink">Prepare</Kicker>}
        title="Saved."
        blurb="Your entry is saved — it's yours to keep. Get AI coaching feedback whenever you're ready."
        tier={tier}
        onTierChange={(t) => {
          setTier(t);
          setInsufficient(null);
          setGenerateError(null);
        }}
        balance={balance}
        insufficient={insufficient}
        error={generateError}
        actionLabel="Get AI feedback"
        onGenerate={handleGenerate}
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

  // --- Form: one question per screen (no-scroll FlowScreen) ---
  function renderStep(step: StepDef) {
    if (step.kind === "person_with_relationship") {
      const rel = (data.relationship as string | undefined) ?? "";
      // NOT a scroll container: the PersonPicker's suggestions dropdown is
      // absolutely positioned (top-full) and manages its own scroll + bottom
      // spacer. An overflow-y-auto wrapper here would clip that dropdown when
      // the keyboard shrinks the band. Content (picker + 5 rows) fits the
      // no-scroll band once the keyboard is dismissed; relationship is tap-only.
      return (
        <div className="flex flex-col gap-4">
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
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-soft">
              Relationship
            </p>
            <div className="space-y-2">
              {RELATIONSHIPS.map((r) => (
                <SelectableRow
                  key={r.value}
                  selected={rel === r.value}
                  onClick={() => setFieldValue("relationship", r.value)}
                >
                  {r.label}
                </SelectableRow>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (step.kind === "select_conversation_type") {
      const sel =
        (data.conversationType as ConversationTypeSel | undefined) ?? {};
      // First tap -> primary; next distinct tap -> secondary. Tapping the
      // current primary clears it and promotes secondary; tapping secondary
      // clears it. With both set, a tap on a third option is ignored.
      const onTap = (value: ConversationType) => {
        setData((d) => {
          const cur =
            (d.conversationType as ConversationTypeSel | undefined) ?? {};
          let primary = cur.primary;
          let secondary = cur.secondary;
          if (primary === value) {
            primary = secondary;
            secondary = undefined;
          } else if (secondary === value) {
            secondary = undefined;
          } else if (!primary) {
            primary = value;
          } else if (!secondary) {
            secondary = value;
          }
          const next: ConversationTypeSel = {};
          if (primary) next.primary = primary;
          if (secondary) next.secondary = secondary;
          return { ...d, conversationType: next };
        });
      };
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {CONVERSATION_TYPE_OPTIONS.map((opt) => {
            const badge =
              sel.primary === opt.value
                ? "1st"
                : sel.secondary === opt.value
                  ? "2nd"
                  : null;
            return (
              <SelectableRow
                key={opt.value}
                selected={badge !== null}
                onClick={() => onTap(opt.value)}
                className="py-2"
              >
                <span className="flex items-center gap-2">
                  {badge && (
                    <span className="shrink-0 rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                      {badge}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-snug">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] font-normal leading-snug opacity-80">
                      {opt.description}
                    </span>
                  </span>
                </span>
              </SelectableRow>
            );
          })}
        </div>
      );
    }
    if (step.kind === "textarea") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <VoiceInput
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          fill
          placeholder={step.placeholder ?? "Type or tap the mic to speak..."}
        />
      );
    }
    if (step.kind === "textarea_if_then") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <TextareaIfThen
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          fill
        />
      );
    }
    return null;
  }

  return (
    <FlowScreen
      header={
        <FlowHeader
          onBack={handleBack}
          eyebrow="Prepare"
          counter={`${safeIndex + 1} / ${steps.length}`}
          dots={
            <ProgressDots
              total={PREPARE_PAGES.length}
              current={current.sectionIndex}
            />
          }
        />
      }
      footer={
        <FlowFooter
          onBack={safeIndex > 0 ? handleBack : undefined}
          primaryLabel={isLastStep ? "Save entry" : "Next"}
          onPrimary={handleNext}
          primaryDisabled={!canAdvance}
        />
      }
      title={current.q.title}
      helper={current.q.prompt ?? undefined}
    >
      <div
        key={`${current.pageKey}.${current.q.key}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {renderStep(current.q)}
        {isLastStep && submitError && (
          <p className="mt-2 shrink-0 text-[13px] font-medium text-danger">
            {submitError}
          </p>
        )}
      </div>
    </FlowScreen>
  );
}
