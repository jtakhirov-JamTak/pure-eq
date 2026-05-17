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
  TextareaWithBodyChip,
  type TextareaWithBodyChipValue,
} from "@/components/coach/steps/textarea-with-body-chip";
import {
  TextareaThreeFieldLesson,
  type TextareaThreeFieldLessonValue,
} from "@/components/coach/steps/textarea-three-field-lesson";
import { BODY_LOCATION_VALUES } from "@/lib/validation";
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
  deriveRepairBranchActive,
  type PageDef,
  type StepDef,
} from "@/lib/coach/page-flow";
import { safeUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { PrepareSnapshot } from "@/lib/coach/calibration";

// Coach SOT 2026-05-08 Commit 3: calibration chip taxonomy moved into the
// SelectCalibrationChip component (per-chipSet enums there). Old 3-in-1
// taxonomy ("matched/off_softer/off_harder", "i_softened/they_opened/...",
// "named_it/...") measured conversation flow, which doesn't close the
// Prepare → Review calibration loop. SOT chips score the user's pre-
// conversation prediction directly: better/about_right/worse vs forecast,
// yes/partial/no/too_soon on the specific shift, yes/mostly/no on the
// good-enough outcome floor.

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

// SOT 2026-05-08 Commit 5: Full Review redesign — 4 base pages + dynamic
// page 5 (calibration / standalone) + optional 3-page Repair branch.
// Page 5 SHARES whatProtecting + lessonScreen + needsAndForecast across
// both branches; only the middle 2-3 Qs vary (3 calibration chips when
// linked, 2 alternative-explanation textareas when standalone).
// Deprecated fields (observedInThem, whatYouAvoided, askBeforeUnderstanding,
// hardestMomentFeeling) are no longer collected; legacy rows in /history
// continue to read the columns nullable.
const REVIEW_FULL_BASE_PAGES: PageDef[] = [
  {
    pageKey: "full_1_reality",
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
        prompt: "Two columns. Left: what you saw or heard. Right: what you concluded.",
        kind: "textarea_two_column",
      },
    ],
  },
  {
    pageKey: "full_2_self",
    qs: [
      {
        key: "feltAtHardestMomentWithBody",
        title: "What did you feel at the hardest moment, and where in your body?",
        prompt: "Name the feeling, then point at where it sits.",
        kind: "textarea_with_body_chip",
      },
      {
        key: "feelingTracking",
        title: "Was the feeling tracking something real?",
        prompt:
          "Sometimes the feeling is signal, sometimes noise. Was it tracking something your reasoning hadn't surfaced yet?",
        kind: "textarea",
      },
      {
        key: "whatYouDid",
        title: "What did you do?",
        prompt: "The actual move. Quote yourself if you can.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "full_3_impact",
    qs: [
      {
        key: "easierOrHarder",
        title: "What did you make easier or harder for them to do next?",
        prompt:
          "Did you make it easier for them to be honest, repair, soften? Or harder? Be specific about which behavior of yours did it.",
        kind: "textarea",
      },
      {
        key: "treatAsData",
        title: "What did they tell you — directly or indirectly — that you need to treat as data?",
        prompt:
          "Words, tone, body, what they didn't say, what they kept coming back to. The thing you've been telling yourself wasn't really what they meant.",
        kind: "textarea",
      },
      {
        key: "somethingThatHelped",
        title: "Was there any moment that helped, even slightly?",
        prompt:
          "Even small. A pause, a softening, a question they asked. Or: nothing helped — that's also data.",
        kind: "textarea",
      },
    ],
  },
  {
    pageKey: "full_4_theirs",
    qs: [
      {
        key: "theirInMomentExperience",
        title: "What might it have felt like for them in that moment?",
        prompt:
          "Best guess at the felt experience for them. One emotion if you can.",
        kind: "textarea",
      },
      {
        key: "signsHowTheyLeft",
        title: "What signs suggest how they may have felt leaving the interaction?",
        prompt:
          "Best guess grounded in what you observed — tone, what they said or didn't say, body, pace of leaving. Not pure speculation.",
        kind: "textarea",
      },
      {
        key: "turningPoint",
        title: "What was the turning point — a specific sentence, pause, or tone shift where things got better or worse?",
        prompt: "One moment. Could be when it improved, could be when it slipped.",
        kind: "textarea",
      },
    ],
  },
  // Page 5 shape derives from linkedPrepareEntryId — see PAGES build below.
];

// SOT 2026-05-08 Commit 5: Repair wording sharpened on Q1, Q3, Q4, Q5.
// Q2 (theirNeedFirst) wording was correct — left alone.
const REPAIR_PAGES: PageDef[] = [
  {
    pageKey: "repair_1",
    qs: [
      {
        key: "impactToName",
        title: "What specific impact should you name before explaining intent?",
        prompt:
          "Not 'I hurt them.' Specific: 'they probably felt dismissed and stopped trying to explain.'",
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
        title: "What would make this repair feel like pressure instead of care?",
        prompt:
          "Be honest. The thing that, if you did it, would make them feel managed instead of met.",
        kind: "textarea",
      },
      {
        key: "timing",
        title: "When are they most likely to hear this — and is now that moment?",
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
        title: "What's the first repair sentence you'll actually use?",
        prompt:
          "The actual words. Say it out loud now. The Before-Send check will flag common repair-killers.",
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

  // SOT 2026-05-08 Commit 5: Page 5 shares whatProtecting + lessonScreen +
  // needsAndForecast across both branches. Only the middle 2-3 Qs vary —
  // 3 calibration chips when a linked Prepare exists; 2 "what else could
  // explain / what might my read have missed" textareas otherwise. Both
  // branches close with the next-move + 5-7 day forecast Q.
  const sharedHead: StepDef[] = [
    {
      key: "whatProtecting",
      title: "What were you wanting or protecting that you didn't say out loud?",
      prompt: "Pick the closest. Optional one-line after.",
      kind: "select_protecting_with_optional_text",
      // Companion text is voluntary — only the chip selection gates advance.
      // Without this, pageCanAdvance's default-object branch returns false
      // whenever `text: ""`, bricking Page 5 for every Full Review user.
      requiredSubFields: ["chip"],
    },
    {
      key: "lessonScreen",
      title: "Lesson from this interaction",
      prompt: "Three fields. The first is required, the others are optional.",
      kind: "textarea_three_field_lesson",
      // SOT 2026-05-08 fix5 (#12): generic required-sub-field declaration
      // replaces a hardcoded `kind === "textarea_three_field_lesson"` branch
      // in pageCanAdvance. Only `a` gates advance.
      requiredSubFields: ["a"],
    },
  ];
  const sharedTail: StepDef[] = [
    {
      key: "needsAndForecast",
      title: "Next move + 5–7 day forecast",
      prompt:
        "Pick the closest, then say what you expect to be true 5–7 days from now.",
      kind: "select_needs_with_forecast",
    },
  ];
  const middleCalibration: StepDef[] = [
    {
      key: "calibrationCompare",
      title: "How did this compare to what you predicted in Prepare?",
      prompt: null,
      kind: "select_calibration_chip",
      chipSet: "compare",
    },
    {
      key: "calibrationShift",
      title: "Did the specific shift you asked for actually happen?",
      prompt: null,
      kind: "select_calibration_chip",
      chipSet: "shift",
    },
    {
      key: "calibrationFloor",
      title: "Did you hit the good-enough outcome you set?",
      prompt: null,
      kind: "select_calibration_chip",
      chipSet: "floor",
    },
  ];
  const middleStandalone: StepDef[] = [
    {
      key: "whatElseExplains",
      title: "What else could explain what happened?",
      prompt:
        "An explanation for their behavior or the outcome that you didn't consider in the moment. Not the optimistic one — the equally plausible one.",
      kind: "textarea",
    },
    {
      key: "whatReadMissed",
      title: "What might your read of this have been missing?",
      prompt:
        "If a friend who knew both of you well watched this, what would they say you got wrong or under-weighted?",
      kind: "textarea",
    },
  ];
  const page5: PageDef = {
    pageKey: linkedPrepareEntryId ? "full_5_calibration" : "full_5_standalone",
    qs: [
      ...sharedHead,
      ...(linkedPrepareEntryId ? middleCalibration : middleStandalone),
      ...sharedTail,
    ],
  };

  // 2026-05-17 fix3 (#14): use the shared deriveRepairBranchActive from
  // page-flow.ts so client + server can't drift if the trigger chip set or
  // depth rules change. The server re-runs the same predicate over the
  // parsed payload and treats this client value as a hint only.
  const needsForecast = data.needsAndForecast as
    | SelectNeedsWithForecastValue
    | undefined;
  const repairActive = deriveRepairBranchActive({
    reviewDepth,
    needsToHappenNext: needsForecast?.chip ?? null,
  });

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

  // SOT 2026-05-08 fix2 + 2026-05-17 followup fix3 (#11): clamp pageIndex
  // when the user navigates back and changes the needs-to-happen-next chip
  // in a way that drops Repair pages out of PAGES. Inline derivation runs
  // during render, so currentPage and totalPages are consistent on the
  // SAME paint (the prior useEffect approach left one frame where
  // PAGES[pageIndex] was undefined before the effect re-ran setPageIndex,
  // briefly rendering an empty page). The useEffect below still runs to
  // bring stored pageIndex back into range so handleBack/handleNext don't
  // skip pages, but rendering no longer depends on it firing.
  const safePageIndex =
    totalPages > 0 ? Math.min(pageIndex, totalPages - 1) : 0;
  useEffect(() => {
    if (totalPages > 0 && pageIndex > totalPages - 1) {
      setPageIndex(totalPages - 1);
    }
  }, [totalPages, pageIndex]);

  const currentPage: PageDef | null = PAGES[safePageIndex] ?? null;

  function setFieldValue(key: string, next: unknown) {
    setData((d) => ({ ...d, [key]: next }));
  }

  function canAdvance(): boolean {
    if (!currentPage) return false;
    return pageCanAdvance(currentPage, data);
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (safePageIndex < totalPages - 1) {
      setPageIndex(safePageIndex + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (safePageIndex > 0) setPageIndex(safePageIndex - 1);
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
      // SOT 2026-05-08 Commit 3: calibration is captured as 3 separate
      // string state keys (one per chipSet). Combine them at submit time
      // into the { compare, shift, floor } jsonb shape the schema expects.
      // Only emit calibrationBlock when all 3 are populated (matches the
      // linked-Prepare branch — page-canAdvance enforces this on the form).
      const calCompare = (data.calibrationCompare as string | undefined) ?? "";
      const calShift = (data.calibrationShift as string | undefined) ?? "";
      const calFloor = (data.calibrationFloor as string | undefined) ?? "";
      const calibration: CalibrationBlockValue | null =
        calCompare && calShift && calFloor
          ? { compare: calCompare, shift: calShift, floor: calFloor }
          : null;
      const protectingValue = data.whatProtecting as
        | SelectProtectingValue
        | undefined;
      const timing = data.timing as TimingComboValue | undefined;
      const repairBranchActive = repairActive;
      setSubmittedRepairBranchActive(repairBranchActive);

      // SOT 2026-05-08 Commit 5: Full Page 2 felt-at-hardest-moment step
      // uses textarea_with_body_chip. Flatten into text + body chip at
      // POST time. Quick never sets this — flatten safely to ""/undefined.
      const feltAtHardest =
        (data.feltAtHardestMomentWithBody as TextareaWithBodyChipValue | undefined) ??
        { text: "", bodyLocation: "" };
      const feltAtHardestText = feltAtHardest.text?.trim()
        ? feltAtHardest.text
        : undefined;
      const reviewBodyLocation = feltAtHardest.bodyLocation
        ? (feltAtHardest.bodyLocation as (typeof BODY_LOCATION_VALUES)[number])
        : undefined;

      // lessonScreen: 3-field block with first-required-others-optional
      // contract. Empty optional sub-fields land as null in the schema
      // shape so the DB columns stay nullable on the legacy path. Quick
      // never sets this.
      const lessonScreenRaw = data.lessonScreen as
        | { a?: string; b?: string; c?: string }
        | undefined;
      const lessonScreenForBody =
        lessonScreenRaw && lessonScreenRaw.a?.trim()
          ? {
              a: lessonScreenRaw.a,
              b: lessonScreenRaw.b?.trim() ? lessonScreenRaw.b : null,
              c: lessonScreenRaw.c?.trim() ? lessonScreenRaw.c : null,
            }
          : undefined;

      const body = {
        reviewDepth,
        personName: data.personName,
        whatHappened: data.whatHappened,
        observedRaw: observedInterpreted.left,
        interpretedRaw: observedInterpreted.right,
        // Legacy hardestMomentFeeling: not collected post-SOT. Always omit;
        // historical rows still render via /history.
        // SOT 2026-05-08 Commit 5 — Full self-state + impact + theirs Qs.
        feltAtHardestMoment: feltAtHardestText,
        bodyLocation: reviewBodyLocation,
        feelingTracking: (data.feelingTracking as string | undefined) ?? undefined,
        whatYouDid: data.whatYouDid ?? undefined,
        easierOrHarder:
          (data.easierOrHarder as string | undefined) ?? undefined,
        treatAsData: (data.treatAsData as string | undefined) ?? undefined,
        somethingThatHelped:
          (data.somethingThatHelped as string | undefined) ?? undefined,
        theirInMomentExperience:
          (data.theirInMomentExperience as string | undefined) ?? undefined,
        signsHowTheyLeft:
          (data.signsHowTheyLeft as string | undefined) ?? undefined,
        turningPoint: (data.turningPoint as string | undefined) ?? undefined,
        needsToHappenNext: needsForecast?.chip ?? undefined,
        forecast: needsForecast?.forecast?.trim()
          ? needsForecast.forecast
          : undefined,
        repairBranchActive,
        // Repair branch fields.
        impactToName: repairBranchActive ? data.impactToName : null,
        theirNeedFirst: repairBranchActive ? data.theirNeedFirst : null,
        pressureVsCare: repairBranchActive ? data.pressureVsCare : null,
        timingWhen: repairBranchActive ? timing?.when ?? null : null,
        timingNow: repairBranchActive ? timing?.isNowThatMoment ?? null : null,
        firstRepairSentence: repairBranchActive
          ? data.firstRepairSentence
          : null,
        // Page 5 — shared head + variant middle + shared tail.
        linkedPrepareEntryId: linkedPrepareEntryId,
        calibrationBlock: calibration ?? null,
        whatProtecting: protectingValue ?? null,
        lessonScreen: lessonScreenForBody ?? null,
        whatElseExplains:
          (data.whatElseExplains as string | undefined) ?? undefined,
        whatReadMissed:
          (data.whatReadMissed as string | undefined) ?? undefined,
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
    if (step.kind === "textarea_three_field_lesson") {
      const value = data[step.key] as TextareaThreeFieldLessonValue | undefined;
      return (
        <TextareaThreeFieldLesson
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          labelA="The lesson — required"
          labelB="What you'd do differently next time — optional"
          labelC="What you'd carry forward — optional"
          placeholderA="One specific takeaway, in your own words."
          placeholderB="The behavior swap, named concretely."
          placeholderC="A principle, framing, or move worth keeping."
        />
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
      const value = (data[step.key] as string | undefined) ?? "";
      // 2026-05-17 fix3 (#12): hard fail when a calibration StepDef forgets
      // to declare chipSet. The prior fallback to "compare" rendered the
      // wrong chips and 400'd at submit with no clear cause — bad for
      // diagnosis. With the throw, the bug becomes loud and immediate
      // during dev/QA, and prod gets a single broken Q rather than a
      // silent partial-mislabel that contaminates the calibration block.
      if (!step.chipSet) {
        throw new Error(
          `select_calibration_chip StepDef "${step.key}" is missing required chipSet prop`,
        );
      }
      return (
        <SelectCalibrationChip
          value={value}
          onChange={(next) => setFieldValue(step.key, next)}
          chipSet={step.chipSet}
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
        pageIndex={safePageIndex}
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
        {safePageIndex > 0 && (
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
          {safePageIndex === totalPages - 1 ? "Get Reflection" : "Next"}
        </button>
      </div>
    </div>
  );
}
