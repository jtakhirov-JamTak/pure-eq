// Pure EQ domain — replace in fork.
// Communication Profile types
export type ProfileType =
  | "direct"
  | "reflective"
  | "warm"
  | "measured"
  | "perceptive"
  | "intense";

export type RelationshipDomain =
  | "partner"
  | "friend"
  | "family"
  | "manager"
  | "direct_report"
  | "coworker"
  | "client"
  | "other";

export type ThreadStatus =
  | "open"
  | "stabilizing"
  | "resolved"
  | "paused"
  | "worsened"
  | "ended";

export type ImprovementGoal =
  | "staying_calm"
  | "understanding_people"
  | "repairing_conflict"
  | "setting_boundaries"
  | "speaking_up";

export type InputMode = "voice" | "text";

// Onboarding quiz answer mapping
export interface QuizAnswer {
  questionIndex: number;
  selectedOption: "A" | "B" | "C" | "D" | "E";
}

export interface ProfileResult {
  primary: ProfileType;
  secondary: ProfileType | null;
  scores: Record<ProfileType, number>;
  improvementGoal: ImprovementGoal;
  recommendedModule: "prepare" | "review" | "repair";
}

// ============================================================
// Coach module taxonomy (re-introduced for Coach redesign 2026-04-23)
// ============================================================
//
// Pattern tags are persisted on prepare_entries.pattern_tag and
// review_entries.pattern_tag (display-only for v1; Insights does not
// consume them yet — that's an open path, see plan
// fizzy-cuddling-biscuit.md). The first 13 are the v1 taxonomy from
// migration 0003; the last 4 are added for the new Before-You-Send
// surface and the new Review fields.
export const OBSERVATION_TAGS = [
  // v1 (migration 0003)
  "defended_intent_early",
  "assumed_meaning_without_checking",
  "delayed_direct_ask",
  "withdrew_under_tension",
  "over_explained_when_misunderstood",
  "moved_to_solution_too_fast",
  "validation_present",
  "repair_attempt_helped",
  "repair_attempt_missed_ownership",
  "escalated_after_trigger",
  "recurring_trigger_criticism",
  "recurring_trigger_pressure",
  "prepare_plan_not_used",
  // v2 (Coach redesign 2026-04-23)
  "punishment_via_message",
  "scorekeeping",
  "intent_before_impact",
  "asked_before_understanding_missed",
] as const;
export type ObservationTag = (typeof OBSERVATION_TAGS)[number];

// Path discriminator for Prepare. Path A = "I need to have a conversation"
// (classic 9-field talk-prep). Path B = "Something feels off" (7-field
// early-detection).
export type PreparePath = "path_a" | "path_b";

// Before-You-Send: message_type and verdict enums.
export type BeforeYouSendMessageType =
  | "conflict"
  | "check_in"
  | "apology"
  | "repair"
  | "ask"
  | "boundary"
  | "other";
export type BeforeYouSendVerdict = "safe" | "risky" | "do_not_send";

// Review: select-field enums.
export type AskBeforeUnderstanding = "yes" | "no" | "unclear";
export type ReviewNeedsToHappenNext =
  | "nothing"
  | "clarify"
  | "align"
  | "apologize"
  | "reassure"
  | "give_space"
  | "set_boundary"
  | "ask_for_repair";

// Review repair-branch readiness gate response.
export type RepairReadiness = "yes" | "somewhat" | "no";

// Coach module entry interfaces (app-level shape — distinct from
// generated DB row types in src/types/database.ts).
export interface PrepareEntry {
  id: string;
  userId: string;
  personId: string | null;
  threadId: string | null;
  personName: string;
  relationship: RelationshipDomain;
  path: PreparePath;
  // Path A fields (legacy 9-field shape, mostly nullable per row)
  situation: string | null;
  desiredOutcome: string | null;
  primaryEmotion: string | null;
  defaultPattern: string | null;
  otherPersonHypothesis: string | null;
  realityCheckQuestion: string;
  triggerPlan: string;
  theirNeed: string | null;
  howToMakeThemFeel: string | null;
  // Path B fields
  whatFeelsOff: string | null;
  whatChanged: string | null;
  storyTellingYourself: string | null;
  afraidItMeans: string | null;
  // Common
  patternTag: ObservationTag | null;
  inputModes: Record<string, InputMode>;
  createdAt: string;
  completedAt: string | null;
}

export interface ReviewEntry {
  id: string;
  userId: string;
  personId: string | null;
  threadId: string | null;
  whatHappened: string;
  hardestMomentFeeling: string;
  whatYouDid: string;
  observedInThem: string;
  theirExperience: string;
  whatYouAvoided: string;
  askBeforeUnderstanding: AskBeforeUnderstanding;
  needsToHappenNext: ReviewNeedsToHappenNext;
  // Repair branch (only when repair_branch_active === true)
  repairBranchActive: boolean;
  yourPart: string | null;
  secretWant: string | null;
  couldMakeThemFeel: string | null;
  patternTag: ObservationTag | null;
  inputModes: Record<string, InputMode>;
  createdAt: string;
  completedAt: string | null;
}

// Before You Send entry (NEW 2026-04-23). Stateless verdict-only flow;
// no person/thread linking.
export interface BeforeYouSendEntry {
  id: string;
  userId: string;
  draftText: string;
  messageType: BeforeYouSendMessageType;
  intentOptional: string | null;
  createdAt: string;
  completedAt: string | null;
}

// Tools types
export interface OverwhelmedEntry {
  id: string;
  userId: string;
  beforeRating: number; // 1-5
  bodyLocation: string | null;
  feelingLabel: string;
  afterRating: number; // 1-5
  afterFeeling: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TriggerEntry {
  id: string;
  userId: string;
  trigger: string;
  interpretation: string;
  emotion: string;
  emotionIntensity: number; // 1-10
  urge: string;
  urgeIntensity: number; // 1-10
  behavior: string;
  outcome: string;
  reflection: string;
  afterFeeling: string;
  inputModes: Record<string, InputMode>;
  createdAt: string;
  completedAt: string | null;
}

// Subscription states
export type SubscriptionStatus =
  | "none"
  | "trial_active"
  | "active"
  | "trial_expired"
  | "cancelled";

// Banned AI phrases — checked before displaying any output
export const BANNED_PHRASES = [
  "You are someone who",
  "Deep down",
  "You fear",
  "Your wound is",
  "Your trauma response is",
  "Subconsciously",
  "This means you have",
] as const;
