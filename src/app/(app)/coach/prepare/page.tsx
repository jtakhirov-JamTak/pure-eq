"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import { EditableCard } from "@/components/coach/editable-card";
import { isRefusal } from "@/lib/coach/output-shape";
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
import { CONVERSATION_MOVES } from "@/types";
import type { AiTier, ConversationMove, RelationshipDomain } from "@/types";
import {
  GetFeedbackScreen,
  useCoinBalance,
  coinCostForTier,
} from "@/components/coach/coin-ui";

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

// Coins redesign Slice A 2026-05-29: lean 8-field Prepare across 3 pages.
//   1 setup:   personName, relationship, conversationMove
//   2 context: situation (facts), fairestVersion
//   3 plan:    hiddenAskAndFloor, opener, triggerPlan
// Redesign §5: the 3 pages stay as the progress MODEL (3 section dots); the
// user advances one question at a time across the 8 flattened questions.
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
  const canAdvance = questionCanAdvance(current.q, data);

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function handleNext() {
    if (!questionCanAdvance(current.q, data)) return;
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
    return {
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
            <SelectableRow
              key={rel.value}
              selected={value === rel.value}
              onClick={() => setFieldValue(step.key, rel.value)}
            >
              {rel.label}
            </SelectableRow>
          ))}
        </div>
      );
    }
    if (step.kind === "select_conversation_move") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {CONVERSATION_MOVES.map((move) => (
            <SelectableRow
              key={move}
              selected={value === move}
              onClick={() => setFieldValue(step.key, move)}
            >
              {CONVERSATION_MOVE_LABELS[move]}
            </SelectableRow>
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
          fill
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
