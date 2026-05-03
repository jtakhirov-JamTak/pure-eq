"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { PersonPicker } from "@/components/person-picker";
import ThreadPicker from "@/components/thread-picker";
import { isRefusal } from "@/lib/coach/output-shape";
import { ACTION_FIELDS } from "@/lib/ai/schemas";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { StepDots } from "@/components/brand/StepDots";
import { safeUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// ============================================================
// Step taxonomy
// ============================================================
// Base form: 10 steps (1 person picker + 8 single-field steps + 1
// two-column observed/interpreted step). Some text, some enum-select.
// After the final base step (needsToHappenNext), if the user picked a
// "needs repair" option, we insert a readiness gate. If they pass the
// gate, repair sub-steps appear before submit. Total step count is
// 10 / 11 / 14 depending on path (cross-eval batch #1 added 1 step).

type Ask = "yes" | "no" | "unclear";

type NeedsNext =
  | "nothing"
  | "clarify"
  | "align"
  | "apologize"
  | "reassure"
  | "give_space"
  | "set_boundary"
  | "ask_for_repair";

type Readiness = "yes" | "somewhat" | "no";

const ASK_OPTIONS: { value: Ask; label: string }[] = [
  { value: "yes", label: "Yes, I asked" },
  { value: "no", label: "No, I assumed" },
  { value: "unclear", label: "Not sure" },
];

const NEEDS_NEXT_OPTIONS: { value: NeedsNext; label: string }[] = [
  { value: "nothing", label: "Nothing — I'm good with how it landed" },
  { value: "clarify", label: "Clarify something I said" },
  { value: "align", label: "Get back on the same page" },
  { value: "apologize", label: "Apologize" },
  { value: "reassure", label: "Reassure them" },
  { value: "give_space", label: "Give it space" },
  { value: "set_boundary", label: "Set a boundary" },
  { value: "ask_for_repair", label: "Ask them to repair something" },
];

const READINESS_OPTIONS: { value: Readiness; label: string }[] = [
  { value: "yes", label: "Yes — I can name their hurt without defending myself" },
  { value: "somewhat", label: "Somewhat — I'll need to be careful" },
  { value: "no", label: "No — I'm still defending my intent" },
];

// Repair triggers: only these needs-next options gate into the repair branch.
const REPAIR_TRIGGER_NEEDS: NeedsNext[] = [
  "clarify",
  "apologize",
  "reassure",
  "ask_for_repair",
];

type StepKind =
  | "person"
  | "textarea"
  | "textarea_two_column"
  | "select_ask"
  | "select_needs"
  | "select_readiness";
type StepDef = {
  key: string;
  title: string;
  prompt: string | null;
  kind: StepKind;
};

const BASE_STEPS: StepDef[] = [
  { key: "personName", title: "Who was this conversation with?", prompt: "Start typing to see people you've mentioned before.", kind: "person" },
  { key: "whatHappened", title: "What actually happened in the conversation?", prompt: "Stick to facts. What was said and done — not interpretations yet.", kind: "textarea" },
  // Cross-eval batch #1 (2026-05-03): two-column observed/interpreted step.
  // The form-factor itself is the training move — left = observation, right
  // = meaning-making. `key` is a synthetic step identifier; the field-level
  // keys posted to the API are `observedRaw` / `interpretedRaw`.
  { key: "observedInterpreted", title: "Split what you saw from what you thought", prompt: "Left: what did you observe (facts, body, tone, exact words). Right: what did you think it meant?", kind: "textarea_two_column" },
  { key: "hardestMomentFeeling", title: "What was the hardest moment, and what did you feel in it?", prompt: "Name the moment and the feeling that showed up for you.", kind: "textarea" },
  { key: "whatYouDid", title: "What did you do during the conversation?", prompt: "What did you say or do — including the small moves you noticed yourself making.", kind: "textarea" },
  { key: "observedInThem", title: "What did you observe in them — body, tone, words?", prompt: "What did you actually see or hear. Observations, not conclusions.", kind: "textarea" },
  { key: "theirExperience", title: "Looking back, what do you think their experience was?", prompt: "Your best guess at what the conversation was like for them.", kind: "textarea" },
  { key: "whatYouAvoided", title: "What did you avoid saying or doing?", prompt: "What did you sidestep — the question you didn't ask, the thing you didn't admit, the topic you steered away from.", kind: "textarea" },
  { key: "askBeforeUnderstanding", title: "Did you ask before assuming what was going on for them?", prompt: null, kind: "select_ask" },
  { key: "needsToHappenNext", title: "What needs to happen next?", prompt: "Pick the closest fit.", kind: "select_needs" },
];

const READINESS_STEP: StepDef = {
  key: "readiness",
  title: "Are you ready to repair?",
  prompt: "Repair only works if you can hold their hurt without defending yourself first.",
  kind: "select_readiness",
};

const REPAIR_STEPS: StepDef[] = [
  { key: "yourPart", title: "What's your part in this?", prompt: "The piece that's actually yours, not the part that's about them.", kind: "textarea" },
  { key: "secretWant", title: "What do you secretly want from them right now?", prompt: "Honest. Not the polite version.", kind: "textarea" },
  { key: "couldMakeThemFeel", title: "What would you want them to feel after the repair?", prompt: "Name the emotional state you're hoping for.", kind: "textarea" },
];

// ============================================================
// AI output shape
// ============================================================
type AiNormal = {
  mode: "normal";
  how_you_came_across: string;
  impact_vs_intent: string;
  alternative_explanation: string;
  question_you_missed: string;
  what_to_own?: string;
  impact_on_them?: string;
  thing_not_to_say?: string;
  recommended_timing?: string;
  pattern_tag: string;
};

type AiRefusal = {
  mode: "refusal";
  refusal_reason: string;
  message_to_user: string;
  suggested_resource: string;
};

type AiOutput = AiNormal | AiRefusal;

const BASE_RESULT_FIELDS: { label: string; key: keyof AiNormal }[] = [
  { label: "How you came across", key: "how_you_came_across" },
  { label: "Impact vs. intent", key: "impact_vs_intent" },
  { label: "Alternative explanation", key: "alternative_explanation" },
  { label: "Question you missed", key: "question_you_missed" },
];

const REPAIR_RESULT_FIELDS: { label: string; key: keyof AiNormal }[] = [
  { label: "What to own", key: "what_to_own" },
  { label: "Impact on them", key: "impact_on_them" },
  { label: "Thing not to say", key: "thing_not_to_say" },
  { label: "Recommended timing", key: "recommended_timing" },
];

const OUTCOME_QUESTIONS = [
  {
    key: "movedForward",
    title: "Did this move things forward?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "partly", label: "Partly" },
      { value: "no", label: "No" },
      { value: "unclear", label: "Unclear" },
    ],
  },
  {
    key: "theySeemUnderstood",
    title: "Did they seem more understood?",
    options: [
      { value: "more", label: "More" },
      { value: "same", label: "Same" },
      { value: "less", label: "Less" },
      { value: "unclear", label: "Unclear" },
    ],
  },
  {
    key: "usedPreparePlan",
    title: "Did you use your prepare plan?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "partly", label: "Partly" },
      { value: "no", label: "No" },
      { value: "no_prepare", label: "No plan" },
    ],
  },
] as const;

const PREFILL_KEY = "pure-eq:bys-prefill";

const ReviewBackground = () => <SkyBackground variant="warm" />;

function RefusalCard({
  output,
  onBack,
}: {
  output: AiRefusal;
  onBack: () => void;
}) {
  return (
    <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />
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

export default function ReviewPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [reviewEntryId, setReviewEntryId] = useState<string | null>(null);
  const [outcomeData, setOutcomeData] = useState<Record<string, string>>({});
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  const [outcomeError, setOutcomeError] = useState(false);
  const [openingLine, setOpeningLine] = useState("");
  // Tracks whether the user actually went through the repair branch in
  // this submission (yes/somewhat readiness + repair-trigger needs).
  // Drives the result-screen "show repair cards" + opening-line CTA.
  const [submittedRepairBranchActive, setSubmittedRepairBranchActive] =
    useState(false);
  // Cached at mount so handoffToBys can stamp the BYS prefill synchronously.
  // Cross-user sessionStorage bleed requires both a matching userId AND a
  // fresh stashedAt on the reader side (see /coach/before-send).
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

  // Dynamic step list — recomputed each render from form state. Length
  // moves between 9, 10, and 13 depending on whether the readiness gate
  // and repair sub-steps apply.
  const needsRepair = REPAIR_TRIGGER_NEEDS.includes(
    data.needsToHappenNext as NeedsNext,
  );
  const includesReadiness = needsRepair;
  const passedReadiness =
    data.readiness === "yes" || data.readiness === "somewhat";
  const includesRepairSteps = includesReadiness && passedReadiness;

  const STEPS: StepDef[] = [
    ...BASE_STEPS,
    ...(includesReadiness ? [READINESS_STEP] : []),
    ...(includesRepairSteps ? REPAIR_STEPS : []),
  ];
  const currentStep = STEPS[step] ?? BASE_STEPS[BASE_STEPS.length - 1];
  const value = data[currentStep.key] || "";

  function setFieldValue(key: string, next: string) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function canAdvance(): boolean {
    if (currentStep.kind === "person") return true;
    if (
      currentStep.kind === "select_ask" ||
      currentStep.kind === "select_needs" ||
      currentStep.kind === "select_readiness"
    ) {
      return !!value;
    }
    if (currentStep.kind === "textarea_two_column") {
      // Two distinct fields share one step. Advance only when both
      // columns have non-empty trimmed content. Field keys diverge
      // from the synthetic step `key` (observedInterpreted) because
      // the API + payload distinguish observedRaw vs interpretedRaw.
      return (
        (data.observedRaw ?? "").trim().length > 0 &&
        (data.interpretedRaw ?? "").trim().length > 0
      );
    }
    return value.trim().length > 0;
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit({ repairBranchActive: includesRepairSteps });
    }
  }

  async function handleSubmit({
    repairBranchActive,
    override,
  }: {
    repairBranchActive: boolean;
    // Caller-supplied field values that haven't yet flushed into `data`.
    // The select_needs / select_readiness handlers `setData(...)` then submit
    // in the same tick — handleSubmit's closure still sees the pre-pick `data`,
    // so the just-picked enum field would post as undefined and Zod would 400.
    // Pass the chosen value here to bypass the stale-closure window.
    override?: Partial<Record<string, string>>;
  }) {
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setSubmittedRepairBranchActive(repairBranchActive);
    const merged = { ...data, ...override };
    try {
      const res = await fetch("/api/coach/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName: merged.personName,
          whatHappened: merged.whatHappened,
          observedRaw: merged.observedRaw,
          interpretedRaw: merged.interpretedRaw,
          hardestMomentFeeling: merged.hardestMomentFeeling,
          whatYouDid: merged.whatYouDid,
          observedInThem: merged.observedInThem,
          theirExperience: merged.theirExperience,
          whatYouAvoided: merged.whatYouAvoided,
          askBeforeUnderstanding: merged.askBeforeUnderstanding,
          needsToHappenNext: merged.needsToHappenNext,
          repairBranchActive,
          yourPart: repairBranchActive ? merged.yourPart : null,
          secretWant: repairBranchActive ? merged.secretWant : null,
          couldMakeThemFeel: repairBranchActive ? merged.couldMakeThemFeel : null,
          personId: personId || null,
          threadId: threadId || null,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      if (res.status === 403) {
        router.push("/paywall");
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const result = await res.json();
      if (result.reviewEntryId) {
        setReviewEntryId(result.reviewEntryId);
      }
      if (result.aiOutput) {
        setAiOutput(result.aiOutput as AiOutput);
      } else {
        setSavedMessage(
          result.message ??
            "Your reflection is saved. Coaching feedback wasn't available this time.",
        );
      }
    } catch (err) {
      console.error("review submit failed", (err as Error)?.message);
      setSubmitError("Could not save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }

  function retryCoaching() {
    setSavedMessage(null);
    setAiOutput(null);
    handleSubmit({ repairBranchActive: submittedRepairBranchActive });
  }

  async function submitOutcome() {
    if (!reviewEntryId) return;
    setOutcomeError(false);
    try {
      const res = await fetch("/api/coach/review/outcome", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewEntryId,
          ...outcomeData,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setOutcomeSaved(true);
    } catch {
      setOutcomeError(true);
    }
  }

  function handoffToBys() {
    if (!openingLine.trim()) return;
    try {
      // Stamp userId + stashedAt so BYS can reject a stale prefill left
      // over from a prior session on the same browser tab (sessionStorage
      // is tab-scoped, not account-scoped). BYS requires both a fresh
      // stash (<5 min) AND a userId match against the current Supabase
      // session. If we didn't resolve a userId at mount, we skip the
      // stash — drop the handoff rather than leak an unsigned draft.
      if (!currentUserId) {
        router.push("/coach/before-send");
        return;
      }
      const payload = {
        draftText: openingLine,
        messageType: "repair" as const,
        sourceReviewEntryId: reviewEntryId,
        userId: currentUserId,
        stashedAt: Date.now(),
      };
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage write failure is non-fatal — BYS will just start
      // empty. Don't block the navigation.
    }
    router.push("/coach/before-send");
  }

  const allOutcomeAnswered = OUTCOME_QUESTIONS.every(
    (q) => outcomeData[q.key],
  );

  // ============================================================
  // Result screen
  // ============================================================
  if (aiOutput) {
    if (isRefusal(aiOutput)) {
      return (
        <RefusalCard
          output={aiOutput}
          onBack={() => router.push("/coach")}
        />
      );
    }
    if (aiOutput.mode !== "normal") {
      // Unknown shape — show a saved-fallback so the user has a way out.
      return (
        <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <ReviewBackground />
          <h2
            className="font-display text-[28px] leading-[1.15] text-ink"
            style={{ letterSpacing: "-0.6px" }}
          >
            Reflection saved
          </h2>
          <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Your reflection is saved, but coaching feedback isn't available
            for this one.
          </p>
          <button
            onClick={retryCoaching}
            className="mt-8 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
          >
            Try again for coaching feedback
          </button>
          <button
            onClick={() => router.push("/coach")}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            Back to Coach
          </button>
        </div>
      );
    }

    const baseVisible = BASE_RESULT_FIELDS.filter(({ key }) => {
      const v = aiOutput[key];
      return typeof v === "string" && v.trim().length > 0;
    });
    const repairVisible = submittedRepairBranchActive
      ? REPAIR_RESULT_FIELDS.filter(({ key }) => {
          const v = aiOutput[key];
          return typeof v === "string" && v.trim().length > 0;
        })
      : [];
    // User picked a repair-needs option but answered "no" to readiness —
    // surface the gentle redirect copy at the top of the result screen.
    const showNotReadyNotice =
      needsRepair && !submittedRepairBranchActive;

    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ReviewBackground />
        <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink">
          Review
        </span>
        <h2
          className="mt-3 font-display text-[28px] leading-[1.12] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Your <span className="italic">reflection</span>.
        </h2>

        {showNotReadyNotice && (
          <div className="mt-5 rounded-card-sm bg-surface p-4 shadow-soft">
            <p className="text-[13px] font-bold uppercase tracking-[1px] text-ink-muted">
              Repair takes readiness
            </p>
            <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
              You're not ready to repair yet. Name their hurt without
              defending your intent first. Come back when you can.
            </p>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {baseVisible.map(({ label, key }) => (
            <div
              key={key}
              className="rounded-card-sm bg-surface p-4 shadow-soft animate-card-in"
            >
              <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                {label}
              </p>
              <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                {aiOutput[key]}
              </p>
            </div>
          ))}
        </div>

        {repairVisible.length > 0 && (
          <>
            <p className="mt-7 text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
              For the repair
            </p>
            <div className="mt-2 space-y-3">
              {repairVisible.map(({ label, key }) => {
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
          </>
        )}

        {submittedRepairBranchActive && (
          <div className="mt-7 rounded-card-sm bg-surface p-4 shadow-soft">
            <p className="text-[13px] font-bold text-ink">
              Now you write the opening line.
            </p>
            <p className="mt-1 text-[12px] font-medium leading-[1.45] text-ink-soft">
              Write the first thing you would say. Then check it before you
              send it.
            </p>
            <div className="mt-3">
              <VoiceInput
                key="review-opening-line"
                value={openingLine}
                onChange={setOpeningLine}
                rows={5}
                placeholder="The first thing you'd say to them…"
              />
            </div>
            <button
              onClick={handoffToBys}
              disabled={!openingLine.trim()}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-brand text-[14px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              Check this before I send it
            </button>
          </div>
        )}

        {reviewEntryId && !outcomeSaved && (
          <div className="mt-6 rounded-card-sm bg-surface p-4 shadow-soft">
            <p className="text-[13px] font-bold text-ink">
              Rate this conversation
            </p>
            <p className="mt-1 text-[12px] font-medium text-ink-soft">
              Optional — helps build your patterns over time.
            </p>
            <div className="mt-4 space-y-3">
              {OUTCOME_QUESTIONS.map((q) => (
                <div key={q.key}>
                  <p className="text-[13px] font-semibold text-ink-soft">
                    {q.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          setOutcomeData((d) => ({
                            ...d,
                            [q.key]: opt.value,
                          }))
                        }
                        className={`rounded-pill px-3.5 py-2 text-[13px] font-semibold transition ${
                          outcomeData[q.key] === opt.value
                            ? "bg-brand text-white shadow-cta"
                            : "bg-surface-tint text-ink"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {allOutcomeAnswered && (
              <button
                onClick={submitOutcome}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-pill bg-brand-deep text-[14px] font-bold text-white shadow-cta active:scale-[0.98]"
              >
                Save outcome
              </button>
            )}
            {outcomeError && (
              <p className="mt-2 text-[13px] font-medium text-danger">
                Could not save outcome. Try again.
              </p>
            )}
          </div>
        )}

        {outcomeSaved && (
          <p className="mt-6 text-[13px] font-medium text-ink-soft">
            Outcome saved.
          </p>
        )}

        <button
          onClick={() => router.push("/coach")}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    );
  }

  if (savedMessage) {
    return (
      <div className="relative min-h-full px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ReviewBackground />
        <h2
          className="font-display text-[28px] leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          Reflection saved
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
        <ReviewBackground />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-surface-tint border-t-brand" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            Generating your review reflection…
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Form
  // ============================================================
  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />

      <div className="flex items-center justify-between">
        <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink">
          Review
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {step + 1} / {STEPS.length}
        </p>
      </div>
      <div className="mt-3">
        <StepDots current={step} total={STEPS.length} />
      </div>

      <h2
        className="mt-5 font-display text-[26px] leading-[1.12] text-ink"
        style={{ letterSpacing: "-0.5px" }}
      >
        {currentStep.title}
      </h2>
      {currentStep.prompt && (
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          {currentStep.prompt}
        </p>
      )}

      <div className="mt-5">
        {currentStep.kind === "person" ? (
          <>
            <PersonPicker
              key={currentStep.key}
              value={value}
              onChange={(next) => setFieldValue(currentStep.key, next)}
              onPersonSelect={(id) => {
                setPersonId(id);
                setThreadId(null);
              }}
              selectedPersonId={personId}
            />
            <ThreadPicker
              personId={personId}
              value={threadId}
              onChange={setThreadId}
            />
          </>
        ) : currentStep.kind === "select_ask" ? (
          <div className="space-y-2">
            {ASK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setFieldValue(currentStep.key, opt.value);
                  setStep(step + 1);
                }}
                className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                  value === opt.value
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : currentStep.kind === "select_needs" ? (
          <div className="space-y-2">
            {NEEDS_NEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  // Reset readiness if user changes needs-next, so a stale
                  // pre-selection from a different path doesn't gate them
                  // straight into the wrong branch.
                  setData((d) => ({
                    ...d,
                    [currentStep.key]: opt.value,
                    readiness: "",
                  }));
                  // Non-repair options terminate the flow here. Without
                  // this branch the user would setStep(step+1) past the
                  // end of STEPS (length stays at 9 when needsRepair is
                  // false), and the currentStep fallback would re-render
                  // this same screen with no submit path — a dead-end on
                  // 4 of 8 options.
                  if (REPAIR_TRIGGER_NEEDS.includes(opt.value)) {
                    setStep(step + 1);
                  } else {
                    // setData above hasn't flushed yet — pass the picked
                    // value through `override` so the POST body has it.
                    handleSubmit({
                      repairBranchActive: false,
                      override: { needsToHappenNext: opt.value },
                    });
                  }
                }}
                className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                  value === opt.value
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : currentStep.kind === "select_readiness" ? (
          <div className="space-y-2">
            {READINESS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setFieldValue(currentStep.key, opt.value);
                  if (opt.value === "no") {
                    // Submit immediately without repair-branch fields.
                    // Result screen will show the "come back when ready"
                    // notice above the base 4 cards. `readiness` isn't on
                    // the wire, but pass through `override` for symmetry
                    // with select_needs in case the schema ever adds it.
                    handleSubmit({
                      repairBranchActive: false,
                      override: { readiness: opt.value },
                    });
                    return;
                  }
                  // yes / somewhat: advance into repair sub-steps.
                  setStep(step + 1);
                }}
                className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                  value === opt.value
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface text-ink shadow-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : currentStep.kind === "textarea_two_column" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                What did you observe?
              </p>
              <VoiceInput
                key="observedRaw"
                value={data.observedRaw ?? ""}
                onChange={(next) => setFieldValue("observedRaw", next)}
                rows={4}
                placeholder="Facts only — what was said, body, tone."
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                What did you think it meant?
              </p>
              <VoiceInput
                key="interpretedRaw"
                value={data.interpretedRaw ?? ""}
                onChange={(next) => setFieldValue("interpretedRaw", next)}
                rows={4}
                placeholder="Your interpretation — what you read into it."
              />
            </div>
          </div>
        ) : (
          <VoiceInput
            key={currentStep.key}
            value={value}
            onChange={(next) => setFieldValue(currentStep.key, next)}
            rows={4}
            placeholder="Type or tap the mic to speak..."
          />
        )}
      </div>
      {submitError && (
        <p className="mt-3 text-[13px] font-medium text-danger">{submitError}</p>
      )}

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex h-12 flex-1 items-center justify-center rounded-pill bg-surface text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
          >
            Back
          </button>
        )}
        {currentStep.kind !== "select_ask" &&
          currentStep.kind !== "select_needs" &&
          currentStep.kind !== "select_readiness" && (
            <button
              onClick={handleNext}
              disabled={!canAdvance()}
              className="flex h-14 flex-1 items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              {step === STEPS.length - 1 ? "Get Reflection" : "Next"}
            </button>
          )}
      </div>
    </div>
  );
}
