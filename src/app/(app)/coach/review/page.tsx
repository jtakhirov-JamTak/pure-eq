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
  TextareaTwoColumn,
  type TextareaTwoColumnValue,
} from "@/components/coach/steps/textarea-two-column";
import {
  SelectNeedsWithForecast,
  type SelectNeedsWithForecastValue,
} from "@/components/coach/steps/select-needs-with-forecast";
import {
  SelectProtectingWithOptionalText,
  type SelectProtectingValue,
} from "@/components/coach/steps/select-protecting-with-optional-text";
import {
  SelectCalibrationChip,
  type CalibrationBlockValue,
} from "@/components/coach/steps/select-calibration-chip";
import { SelectRepairNeed } from "@/components/coach/steps/select-repair-need";
import {
  TimingCombo,
  type TimingComboValue,
} from "@/components/coach/steps/timing-combo";
import {
  pageCanAdvance,
  REPAIR_TRIGGER_NEEDS,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { PrepareSnapshot } from "@/lib/coach/calibration";

// Coach SOT 2026-05-06: calibration chip enums live page-side (the schema
// only validates non-empty 3-field shape). Future iterations may swap the
// chip labels/values; refactor into a constants module if a second page
// consumes them.
const CALIBRATION_CHIPS = {
  compare: [
    { value: "matched", label: "Matched my forecast" },
    { value: "off_softer", label: "Softer than I forecast" },
    { value: "off_harder", label: "Harder than I forecast" },
    { value: "different_topic", label: "Different topic surfaced" },
  ],
  shift: [
    { value: "i_softened", label: "I softened first" },
    { value: "they_opened", label: "They opened first" },
    { value: "we_pivoted", label: "We pivoted to a new frame" },
    { value: "stuck", label: "We stayed stuck" },
  ],
  floor: [
    { value: "named_it", label: "I named it" },
    { value: "stayed_present", label: "I stayed present" },
    { value: "didnt_make_worse", label: "I didn't make it worse" },
    { value: "no_floor", label: "No floor held" },
  ],
} as const;

// SOT 2026-05-08 Commit 2: Quick = 5 Qs across 2 pages with the calibration
// loop intact (needsAndForecast carries the forward forecast so a future
// Review can score against it). hardestMomentFeeling NOT collected on Quick —
// that field is being deprecated; Full replaces it with feltAtHardestMoment
// in Commit 5. Quick path NEVER triggers the repair branch (enforced by
// `repairActive` requiring `reviewDepth === "full"` further down).
const REVIEW_QUICK_PAGES: PageDef[] = [
  {
    pageKey: "quick_1",
    qs: [
      {
        key: "personName",
        title: "Who was this conversation with?",
        prompt: "Start typing to see people you've mentioned before.",
        kind: "person",
      },
      {
        key: "whatHappened",
        title: "What happened?",
        prompt: "Stick to facts. What was said and done — not interpretations yet.",
        kind: "textarea",
      },
      {
        key: "observedInterpreted",
        title: "What did you observe vs. what did you think it meant?",
        prompt:
          "Two columns. Left: what you saw or heard. Right: what you concluded.",
        kind: "textarea_two_column",
      },
    ],
  },
  {
    pageKey: "quick_2",
    qs: [
      {
        key: "whatYouDid",
        title: "What did you do?",
        prompt: "The actual move. Quote yourself if you can.",
        kind: "textarea",
      },
      {
        key: "needsAndForecast",
        title: "Next move + 5–7 day forecast",
        prompt: "Pick the closest, then say what you expect to be true 5–7 days from now.",
        kind: "select_needs_with_forecast",
      },
    ],
  },
];

const REVIEW_FULL_BASE_PAGES: PageDef[] = [
  {
    pageKey: "full_1",
    qs: [
      {
        key: "personName",
        title: "Who was this conversation with?",
        prompt: "Start typing to see people you've mentioned before.",
        kind: "person",
      },
    ],
  },
  {
    pageKey: "full_2",
    qs: [
      {
        key: "whatHappened",
        title: "What actually happened?",
        prompt: "Stick to facts.",
        kind: "textarea",
      },
      {
        key: "observedInterpreted",
        title: "Split what you saw from what you thought",
        prompt: null,
        kind: "textarea_two_column",
      },
      {
        key: "hardestMomentFeeling",
        title: "What was the hardest moment, and what did you feel?",
        prompt: null,
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "full_3",
    qs: [
      {
        key: "whatYouDid",
        title: "What did you do during the conversation?",
        prompt: "Including the small moves you noticed yourself making.",
        kind: "textarea",
      },
      {
        key: "observedInThem",
        title: "What did you observe in them — body, tone, words?",
        prompt: null,
        kind: "textarea",
      },
      {
        key: "theirExperience",
        title: "Looking back, what do you think their experience was?",
        prompt: null,
        kind: "textarea",
      },
      {
        key: "whatYouAvoided",
        title: "What did you avoid saying or doing?",
        prompt: null,
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "full_4",
    qs: [
      {
        key: "askBeforeUnderstanding",
        title: "Did you ask before assuming what was going on for them?",
        prompt: null,
        kind: "select",
      },
      {
        key: "needsAndForecast",
        title: "What needs to happen next?",
        prompt: "Pick the closest fit. Then forecast what you think will happen.",
        kind: "select_needs_with_forecast",
      },
    ],
  },
  // Page 5 shape derives from linkedPrepareEntryId — see PAGES build below.
];

const REPAIR_PAGES: PageDef[] = [
  {
    pageKey: "repair_1",
    qs: [
      {
        key: "impactToName",
        title: "Name the impact you can see now",
        prompt:
          "What did this likely feel like for them? Specific, not generic.",
        kind: "textarea",
      },
      {
        key: "theirNeedFirst",
        title: "What do they need first?",
        prompt: null,
        kind: "select_repair_need",
      },
    ],
  },
  {
    pageKey: "repair_2",
    qs: [
      {
        key: "pressureVsCare",
        title: "Where on the pressure / care line is your repair?",
        prompt:
          "Honest — pressure leaks into repair more than people think. Name where this lands.",
        kind: "textarea",
      },
      {
        key: "timing",
        title: "When could this land best?",
        prompt: null,
        kind: "timing_combo",
      },
    ],
  },
  {
    pageKey: "repair_3",
    qs: [
      {
        key: "firstRepairSentence",
        title: "Write the first sentence of the repair",
        prompt:
          "Just the opening line. The Before-Send check will catch what to cut.",
        kind: "textarea",
      },
    ],
  },
];

const ASK_OPTIONS = [
  { value: "yes", label: "Yes, I asked" },
  { value: "no", label: "No, I assumed" },
  { value: "unclear", label: "Not sure" },
] as const;

type AiNormal = {
  mode: "normal";
  how_you_came_across: string;
  impact_vs_intent: string;
  alternative_explanation: string;
  question_you_missed: string;
  what_to_own?: string | null;
  impact_on_them?: string;
  thing_not_to_say?: string | null;
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

const PREFILL_KEY = "pure-eq:bys-prefill";

const ReviewBackground = () => <SkyBackground variant="warm" />;

type ReviewDepth = "quick" | "full";

export default function ReviewPage() {
  const router = useRouter();
  const [reviewDepth, setReviewDepth] = useState<ReviewDepth | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [linkedPrepareEntryId, setLinkedPrepareEntryId] = useState<
    string | null
  >(null);
  const [, setPrepareSnapshot] = useState<PrepareSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [reviewEntryId, setReviewEntryId] = useState<string | null>(null);
  const [submittedRepairBranchActive, setSubmittedRepairBranchActive] =
    useState(false);
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

  // Linked-Prepare lookup — fires when personId is set on a Full review.
  // Drives the page-5 shape (calibration vs standalone). On error: degrade
  // to standalone (linkedPrepareEntryId stays null).
  useEffect(() => {
    if (!personId || reviewDepth !== "full") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/coach/prepare/most-recent?personId=${encodeURIComponent(personId)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (json.snapshot) {
          setLinkedPrepareEntryId(json.snapshot.prepareEntryId);
          setPrepareSnapshot(json.snapshot);
        } else {
          setLinkedPrepareEntryId(null);
          setPrepareSnapshot(null);
        }
      } catch {
        // Silent — the server lookup at submit is the authoritative path.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId, reviewDepth]);

  // Build page-5 dynamically based on linked status.
  const page5: PageDef = linkedPrepareEntryId
    ? {
        pageKey: "full_5_calibration",
        qs: [
          {
            key: "calibrationBlock",
            title: "Calibrate against your forecast",
            prompt:
              "We pulled your most recent Prepare for this person — pick how it actually compared.",
            kind: "select_calibration_chip",
          },
        ],
      }
    : {
        pageKey: "full_5_standalone",
        qs: [
          {
            key: "whatProtecting",
            title: "What were you protecting?",
            prompt: null,
            kind: "select_protecting_with_optional_text",
          },
          {
            key: "whatYouLearned",
            title: "What did you learn that you'll carry forward?",
            prompt: "One specific takeaway, in your own words.",
            kind: "textarea",
          },
        ],
      };

  // Repair branch active when needsAndForecast.chip ∈ REPAIR_TRIGGER_NEEDS
  // AND we're on Full path. Quick path NEVER triggers repair.
  const needsForecast = data.needsAndForecast as
    | SelectNeedsWithForecastValue
    | undefined;
  const repairActive =
    reviewDepth === "full" &&
    needsForecast !== undefined &&
    (REPAIR_TRIGGER_NEEDS as readonly string[]).includes(needsForecast.chip);

  const PAGES: PageDef[] =
    reviewDepth === "quick"
      ? REVIEW_QUICK_PAGES
      : reviewDepth === "full"
        ? [
            ...REVIEW_FULL_BASE_PAGES,
            page5,
            ...(repairActive ? REPAIR_PAGES : []),
          ]
        : [];
  const totalPages = PAGES.length;
  const currentPage: PageDef | null = PAGES[pageIndex] ?? null;

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function canAdvance(): boolean {
    if (!currentPage) return false;
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
      const observedInterpreted =
        (data.observedInterpreted as TextareaTwoColumnValue | undefined) ??
        { left: "", right: "" };
      const calibration = data.calibrationBlock as
        | CalibrationBlockValue
        | undefined;
      const protectingValue = data.whatProtecting as
        | SelectProtectingValue
        | undefined;
      const timing = data.timing as TimingComboValue | undefined;
      const repairBranchActive = repairActive;
      setSubmittedRepairBranchActive(repairBranchActive);
      const body = {
        reviewDepth,
        personName: data.personName,
        whatHappened: data.whatHappened,
        observedRaw: observedInterpreted.left,
        interpretedRaw: observedInterpreted.right,
        // hardestMomentFeeling: Quick no longer collects it (SOT 2026-05-08
        // Commit 2). Full still does until Commit 5 replaces with
        // feltAtHardestMoment. Omit when undefined so Zod .optional() passes.
        hardestMomentFeeling: data.hardestMomentFeeling ?? undefined,
        whatYouDid: data.whatYouDid ?? undefined,
        observedInThem: data.observedInThem ?? undefined,
        theirExperience: data.theirExperience ?? undefined,
        whatYouAvoided: data.whatYouAvoided ?? undefined,
        askBeforeUnderstanding: data.askBeforeUnderstanding ?? undefined,
        needsToHappenNext: needsForecast?.chip ?? undefined,
        // Forecast text (5-7 day prediction companion to the chip). Stored
        // in review_entries.forecast so a future Review can calibrate
        // against it via linked_prepare_entry_id / calibration_block.
        forecast: needsForecast?.forecast?.trim()
          ? needsForecast.forecast
          : undefined,
        repairBranchActive,
        // Repair-swap fields (Commit 6).
        impactToName: repairBranchActive ? data.impactToName : null,
        theirNeedFirst: repairBranchActive ? data.theirNeedFirst : null,
        pressureVsCare: repairBranchActive ? data.pressureVsCare : null,
        timingWhen: repairBranchActive ? timing?.when ?? null : null,
        timingNow: repairBranchActive ? timing?.isNowThatMoment ?? null : null,
        firstRepairSentence: repairBranchActive
          ? data.firstRepairSentence
          : null,
        // Page 5
        linkedPrepareEntryId: linkedPrepareEntryId,
        calibrationBlock: calibration ?? null,
        whatProtecting: protectingValue ?? null,
        whatYouLearned: data.whatYouLearned ?? null,
        personId: personId || null,
        idempotencyKey: idempotencyKeyRef.current,
      };
      const res = await fetch("/api/coach/review", {
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
      if (result.reviewEntryId) setReviewEntryId(result.reviewEntryId);
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
    handleSubmit();
  }

  function handoffToBys() {
    const sentence = (data.firstRepairSentence as string | undefined) ?? "";
    if (!sentence.trim() || !currentUserId) {
      router.push("/coach/before-send");
      return;
    }
    try {
      const payload = {
        draftText: sentence,
        messageType: "repair" as const,
        sourceReviewEntryId: reviewEntryId,
        userId: currentUserId,
        stashedAt: Date.now(),
      };
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage failure is non-fatal.
    }
    router.push("/coach/before-send");
  }

  // --- Result screens ---
  if (aiOutput) {
    if (isRefusal(aiOutput)) {
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
    if (aiOutput.mode === "normal") {
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
                  {aiOutput[key] as string}
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
                        {aiOutput[key] as string}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {submittedRepairBranchActive && data.firstRepairSentence ? (
            <div className="mt-7 rounded-card-sm bg-surface p-4 shadow-soft">
              <p className="text-[13px] font-bold text-ink">
                Your repair sentence
              </p>
              <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink">
                {data.firstRepairSentence as string}
              </p>
              <button
                onClick={handoffToBys}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-pill bg-brand text-[14px] font-bold text-white shadow-cta active:scale-[0.98]"
              >
                Check this before I send it
              </button>
            </div>
          ) : null}
          <button
            onClick={() => router.push("/coach")}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      );
    }
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
            Generating your reflection…
          </p>
        </div>
      </div>
    );
  }

  // --- Depth chooser ---
  if (!reviewDepth) {
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
          How <span className="italic">deep</span> do you want to go?
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Quick if you just need a fast read. Full if it deserves the full
          reflection.
        </p>

        <button
          onClick={() => setReviewDepth("quick")}
          className="mt-6 block w-full rounded-card bg-surface p-5 text-left shadow-card transition active:scale-[0.99]"
        >
          <span className="inline-block rounded-pill bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.8px] text-white">
            Recommended
          </span>
          <div
            className="mt-2 font-display text-[22px] leading-[1.15] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Quick read.
          </div>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.45] text-ink-soft">
            ~2 min · 4 questions. No repair branch.
          </p>
        </button>

        <button
          onClick={() => setReviewDepth("full")}
          className="mt-3 block w-full rounded-card bg-surface p-5 text-left shadow-card transition active:scale-[0.99]"
        >
          <div
            className="font-display text-[22px] leading-[1.15] text-ink"
            style={{ letterSpacing: "-0.5px" }}
          >
            Full reflection.
          </div>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.45] text-ink-soft">
            ~5 min · forecast calibration + optional repair branch.
          </p>
        </button>
      </div>
    );
  }

  if (!currentPage) return null;

  // --- Form ---
  function renderStep(step: StepDef) {
    if (step.kind === "person") {
      return (
        <PersonPicker
          value={(data.personName as string | undefined) ?? ""}
          onChange={(next) => setFieldValue("personName", next)}
          onPersonSelect={(id) => {
            setPersonId(id);
            // New person → invalidate any pre-fetched linkage.
            setLinkedPrepareEntryId(null);
            setPrepareSnapshot(null);
          }}
          selectedPersonId={personId}
        />
      );
    }
    if (step.kind === "select" && step.key === "askBeforeUnderstanding") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <div className="space-y-2">
          {ASK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFieldValue(step.key, opt.value)}
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
    if (step.kind === "textarea_two_column") {
      const value = data[step.key] as TextareaTwoColumnValue | undefined;
      return (
        <TextareaTwoColumn
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          leftLabel="What did you observe?"
          rightLabel="What did you think it meant?"
          leftPlaceholder="Facts only — body, tone, exact words."
          rightPlaceholder="Your interpretation."
        />
      );
    }
    if (step.kind === "select_needs_with_forecast") {
      const value = data[step.key] as
        | SelectNeedsWithForecastValue
        | undefined;
      return (
        <SelectNeedsWithForecast
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
        />
      );
    }
    if (step.kind === "select_protecting_with_optional_text") {
      const value = data[step.key] as SelectProtectingValue | undefined;
      return (
        <SelectProtectingWithOptionalText
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
        />
      );
    }
    if (step.kind === "select_calibration_chip") {
      const value = data[step.key] as CalibrationBlockValue | undefined;
      return (
        <SelectCalibrationChip
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          chips={CALIBRATION_CHIPS}
        />
      );
    }
    if (step.kind === "select_repair_need") {
      const value = (data[step.key] as string | undefined) ?? "";
      return (
        <SelectRepairNeed
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
        />
      );
    }
    if (step.kind === "timing_combo") {
      const value = data[step.key] as TimingComboValue | undefined;
      return (
        <TimingCombo
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
        />
      );
    }
    return null;
  }

  return (
    <div className="relative min-h-full px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <ReviewBackground />
      <CoachPage
        eyebrow={reviewDepth === "quick" ? "Review · Quick" : "Review"}
        eyebrowClassName="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-ink"
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
          {pageIndex === totalPages - 1 ? "Get Reflection" : "Next"}
        </button>
      </div>
    </div>
  );
}
