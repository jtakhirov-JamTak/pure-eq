// Pure EQ domain — replace in fork.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProfileType, ProfileResult, ImprovementGoal } from "@/types";

export type QuizOption = "A" | "B" | "C" | "D" | "E";

export interface OnboardingQuestion {
  text: string;
  options: { label: QuizOption; text: string }[];
  // Primary profile mapping (2 pts). null for Q9 which is routing-only.
  mapping: Record<QuizOption, ProfileType> | null;
  // Optional secondary mapping (e.g. Q5-A → +1 Direct per product doc §3).
  secondary?: Partial<Record<QuizOption, { profile: ProfileType; points: number }>>;
}

export const QUESTIONS: OnboardingQuestion[] = [
  {
    text: "When conversations go well, what feels most natural to you?",
    options: [
      { label: "A", text: "Saying what matters clearly and directly" },
      { label: "B", text: "Thinking carefully before I speak" },
      { label: "C", text: "Helping the other person feel comfortable and understood" },
      { label: "D", text: "Staying calm, measured, and in control" },
      { label: "E", text: "Bringing honest energy and emotional presence into the conversation" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "intense" },
  },
  {
    text: "What do people tend to appreciate most about how you communicate?",
    options: [
      { label: "A", text: "I'm straightforward and easy to understand" },
      { label: "B", text: "I'm thoughtful and do not react too quickly" },
      { label: "C", text: "I'm warm, supportive, and considerate" },
      { label: "D", text: "I stay steady and do not make things bigger than they are" },
      { label: "E", text: "I notice what others are feeling, even when they do not say it directly" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "perceptive" },
  },
  {
    text: "When someone is upset with you, what is your first instinct?",
    options: [
      { label: "A", text: "Clear things up directly" },
      { label: "B", text: "Slow down and understand what is really going on" },
      { label: "C", text: "Reassure them and reduce the tension" },
      { label: "D", text: "Pull back so I do not make it worse" },
      { label: "E", text: "Read between the lines and figure out what they really mean" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "perceptive" },
  },
  {
    text: "In hard conversations, what becomes hardest for you?",
    options: [
      { label: "A", text: "Staying calm once emotions rise" },
      { label: "B", text: "Saying what I really mean without overthinking" },
      { label: "C", text: "Not taking responsibility for fixing everything" },
      { label: "D", text: "Not shutting down or pulling back" },
      { label: "E", text: "Not assuming I already know what the other person means" },
    ],
    mapping: { A: "intense", B: "reflective", C: "warm", D: "measured", E: "perceptive" },
  },
  {
    text: "What usually goes wrong first when tension rises?",
    options: [
      { label: "A", text: "I push my point too hard" },
      { label: "B", text: "I hesitate, over-process, or wait too long" },
      { label: "C", text: "I focus too much on smoothing things over" },
      { label: "D", text: "I go quiet, withdraw, or avoid the real issue" },
      { label: "E", text: "I start interpreting instead of checking" },
    ],
    mapping: { A: "intense", B: "reflective", C: "warm", D: "measured", E: "perceptive" },
    // Product doc §3 explicit rule: Q5-A also gives +1 to Direct.
    secondary: { A: { profile: "direct", points: 1 } },
  },
  {
    text: "When you feel misunderstood, what do you most tend to do?",
    options: [
      { label: "A", text: "Push harder to explain my point" },
      { label: "B", text: "Replay everything in my head and second-guess myself" },
      { label: "C", text: "Try to make the conversation feel better fast" },
      { label: "D", text: "Pull back and say less" },
      { label: "E", text: "React strongly or feel emotionally overwhelmed" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "intense" },
  },
  {
    text: "When the other person gets more intense, what do you do?",
    options: [
      { label: "A", text: "Stand my ground" },
      { label: "B", text: "Go quiet and think" },
      { label: "C", text: "Try to bring the temperature down" },
      { label: "D", text: "Stay calm, don't react" },
      { label: "E", text: "Match their energy" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "intense" },
  },
  {
    text: "After a conversation goes badly, what do you do first?",
    options: [
      { label: "A", text: "Go back and address it" },
      { label: "B", text: "Replay it in my head" },
      { label: "C", text: "Check if they're okay" },
      { label: "D", text: "Give it space" },
      { label: "E", text: "Try to read where they're at before I do anything" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "perceptive" },
  },
  {
    // Routing-only per §3 — "Do not use Question 9 to break profile ties."
    // Forecast: routes to the module the user needs RIGHT NOW.
    text: "What's your forecast right now?",
    options: [
      { label: "A", text: "Hard convo incoming" },
      { label: "B", text: "I'm in it right now" },
      { label: "C", text: "Just looking around" },
    ],
    mapping: null,
  },
];

export type RecommendedModule = "prepare" | "review" | "repair" | "before_send";

// Forecast → module routing. Replaces the old aspiration GOAL_MAPPING.
// A and C land on Prepare (default safe path); B lands on Before-You-Send
// (the user is mid-conversation and needs a verdict on a draft message).
export const FORECAST_MAPPING: Record<"A" | "B" | "C", RecommendedModule> = {
  A: "prepare",
  B: "before_send",
  C: "prepare",
};

// ---------- v0 feature flag ----------
// Modules that exist in production. Both forecast destinations (Prepare and
// Before-You-Send) are live; Review and Repair stay gated until they ship.
export const V0_MODULES_ENABLED: Record<RecommendedModule, boolean> = {
  prepare: true,
  before_send: true,
  review: false,
  repair: false,
};

// Module → app route. Lives here (not in submit/route.ts) so unit tests can
// import it as a binding canary against the RecommendedModule union.
// Underscored enum vs hyphenated path is the reason this lookup exists.
export const MODULE_TO_PATH: Record<RecommendedModule, string> = {
  prepare: "/coach/prepare",
  before_send: "/coach/before-send",
  review: "/coach/review",
  repair: "/coach/repair",
};

export function clampToEnabledModule(natural: RecommendedModule): RecommendedModule {
  return V0_MODULES_ENABLED[natural] ? natural : "prepare";
}

// ---------- Scoring ----------
// Questions 1-8 score the profile. Q9 is routing only.
// 2 pts to primary mapping, optional secondary pts per question config.
// Tie-break: Q8 → Q7 → Q6 → Q5 → Q4 (per §3).
export const SCORING_VERSION = 1;

// Shared by client (result screen) and server (API route). Same module
// import on both sides so drift is impossible at runtime — if you find
// yourself duplicating this logic, stop and reuse the shared function.
export function scoreProfile(answers: (QuizOption | null)[]): ProfileResult {
  const scores: Record<ProfileType, number> = {
    direct: 0,
    reflective: 0,
    warm: 0,
    measured: 0,
    perceptive: 0,
    intense: 0,
  };

  let pointsScored = 0;
  for (let i = 0; i < 8; i++) {
    const answer = answers[i];
    if (!answer) continue;
    const q = QUESTIONS[i];
    if (!q.mapping) continue;
    scores[q.mapping[answer]] += 2;
    pointsScored += 2;
    const sec = q.secondary?.[answer];
    if (sec) {
      scores[sec.profile] += sec.points;
      pointsScored += sec.points;
    }
  }

  if (pointsScored === 0) {
    throw new Error("scoreProfile: no scorable answers in questions 1-8");
  }

  const sorted = (Object.entries(scores) as [ProfileType, number][]).sort(
    (a, b) => b[1] - a[1]
  );

  let primary = sorted[0][0];

  // Tie-break on primary using later questions in reverse order.
  if (sorted[0][1] === sorted[1][1]) {
    const tieBreakers = [7, 6, 5, 4, 3];
    for (const qi of tieBreakers) {
      const answer = answers[qi];
      if (!answer) continue;
      const mapping = QUESTIONS[qi].mapping;
      if (!mapping) continue;
      const profile = mapping[answer];
      if (profile === sorted[0][0] || profile === sorted[1][0]) {
        primary = profile;
        break;
      }
    }
  }

  // Secondary must be computed AFTER tie-break, excluding the final primary,
  // otherwise a tie-swap can leave secondary == primary.
  const secondary =
    sorted.find(([p, s]) => p !== primary && s > 0)?.[0] ?? null;

  // Q9 is now a forecast question: answer maps directly to a module.
  // Defaults to "prepare" when missing or out-of-set (defensive — the
  // pointsScored guard above already throws on truly empty input, and the
  // UI only renders A/B/C buttons so D/E are unreachable from the client).
  const q9Answer = answers[8];
  const naturalModule: RecommendedModule =
    q9Answer === "A" || q9Answer === "B" || q9Answer === "C"
      ? FORECAST_MAPPING[q9Answer]
      : "prepare";
  const recommendedModule = clampToEnabledModule(naturalModule);

  // improvementGoal is deprecated post-forecast-rewrite. Kept on ProfileResult
  // for back-compat with stored payload_json rows; new submissions write the
  // sentinel "staying_calm". Delete when payload_json is migrated.
  const improvementGoal: ImprovementGoal = "staying_calm";

  return { primary, secondary, scores, improvementGoal, recommendedModule };
}

// ---------- Result screen content ----------
export const PROFILE_DESCRIPTIONS: Record<
  ProfileType,
  { strength: string; stress: string; willHelpMost: string }
> = {
  direct: {
    strength: "You bring clarity, honesty, and straightforward energy.",
    stress: "You can push too hard, over-explain, or come across as blunt.",
    willHelpMost:
      "You'll benefit most from slowing down before you push — Prepare helps you script what you actually want before the moment gets hot.",
  },
  reflective: {
    strength: "You bring perspective, thoughtfulness, and restraint.",
    stress: "You can overthink, delay, or say less than you mean.",
    willHelpMost:
      "You'll benefit most from landing on your point before the conversation — Prepare helps you say what you mean without losing it mid-exchange.",
  },
  warm: {
    strength: "You bring empathy, care, and emotional safety.",
    stress: "You can over-accommodate, avoid conflict, or lose your own needs.",
    willHelpMost:
      "You'll benefit most from holding your own needs alongside theirs — Prepare helps you name what you want without softening it away.",
  },
  measured: {
    strength: "You bring steadiness, calm, and emotional control.",
    stress: "You can withdraw, shut down, or become hard to read.",
    willHelpMost:
      "You'll benefit most from speaking up before you withdraw — Prepare helps you put words to what's hard so you don't go quiet under pressure.",
  },
  perceptive: {
    strength: "You bring awareness, intuition, and emotional depth.",
    stress: "You can over-interpret, assume, or react to things not yet confirmed.",
    willHelpMost:
      "You'll benefit most from checking before interpreting — Prepare helps you ask the question instead of answering it for them.",
  },
  intense: {
    strength: "You bring passion, emotional honesty, and presence.",
    stress: "You can escalate, flood, or overwhelm the other person.",
    willHelpMost:
      "You'll benefit most from landing your point without flooding — Prepare helps you say what matters without the volume.",
  },
};

// Tailwind color classes per profile for the result-screen avatar.
// Kept as static string maps so Tailwind's JIT can pick them up.
export const PROFILE_AVATAR_CLASSES: Record<ProfileType, string> = {
  direct: "bg-red-500",
  reflective: "bg-blue-500",
  warm: "bg-amber-500",
  measured: "bg-zinc-500",
  perceptive: "bg-purple-500",
  intense: "bg-orange-600",
};

export const MODULE_LABELS: Record<RecommendedModule, string> = {
  prepare: "Prepare",
  review: "Review",
  repair: "Repair",
  before_send: "Before You Send",
};

// Fetches the user's latest Profile Snapshot (append-only per §6.2.A).
// Shared by the onboarding server gate, root landing page, and /insights —
// one source for "does this user have a profile". Selects only the fields
// current callers read; add more to the select when a future caller needs
// them (avoid "select everything" drift).
export async function getLatestProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data } = await supabase
    .from("user_profiles")
    .select("primary_profile, secondary_profile")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
