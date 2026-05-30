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
  // Deprecated post-forecast Q9 rewrite. New submissions write null; reads
  // disambiguate cohorts via user_profiles.created_at. Field stays on the
  // type so existing payload_json rows remain typeable on legacy reads.
  improvementGoal: ImprovementGoal | null;
  recommendedModule: "prepare" | "review" | "repair" | "before_send";
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

// Lean Prepare conversation-move chip (redesign). What kind of conversation
// this is — drives the AI prompt framing. Stored on
// prepare_entries.conversation_move (migration 0040).
export const CONVERSATION_MOVES = [
  "clarify",
  "ask",
  "boundary",
  "share",
  "decide",
  "pause",
] as const;
export type ConversationMove = (typeof CONVERSATION_MOVES)[number];

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
// Legacy (pre-redesign) needs-to-happen-next chip. New lean Review posts write
// `next_move` (REVIEW_NEXT_MOVE_VALUES) instead; this stays for /history reads
// on legacy rows and the Insights behavioral-context aggregation.
export type ReviewNeedsToHappenNext =
  | "nothing"
  | "clarify"
  | "align"
  | "apologize"
  | "reassure"
  | "give_space"
  | "set_boundary"
  | "ask_for_repair";

// Lean Review next-move chip (redesign). What the user thinks should happen
// after the conversation. Stored on review_entries.next_move (migration 0041).
// Distinct from the old needs_to_happen_next taxonomy: adds prepare / step_back
// / save_pattern, drops the repair-trigger granularity (Repair is now a single
// chip routing to the future standalone Repair module).
export const REVIEW_NEXT_MOVE_VALUES = [
  "nothing",
  "repair",
  "prepare",
  "set_boundary",
  "follow_up",
  "step_back",
  "save_pattern",
] as const;
export type ReviewNextMove = (typeof REVIEW_NEXT_MOVE_VALUES)[number];

// Review repair-branch readiness gate response.
export type RepairReadiness = "yes" | "somewhat" | "no";

// ============================================================
// Lean Pulse Check ("Something feels off") — redesign Slice C1
// ============================================================
// Pulse next-move chip (v2). Determines the result-screen routing matrix:
//   do_nothing → close · observe → reveals check-window picker, then close
//   ask_light → reveals light-question field + routes to Before-You-Send
//   prepare → /coach/prepare · repair → persisted intent (standalone Repair
//   ships in Slice D) · set_boundary → close · step_back → close.
// Stored on pulse_check_entries.next_move (migration 0042). Supersedes the
// legacy PULSE_NEXT_MOVE_VALUES (validation.ts) — kept there for /history reads.
export const PULSE_NEXT_MOVE_V2_VALUES = [
  "do_nothing",
  "observe",
  "ask_light",
  "prepare",
  "repair",
  "set_boundary",
  "step_back",
] as const;
export type PulseNextMove = (typeof PULSE_NEXT_MOVE_V2_VALUES)[number];

// Observation window when next_move = observe. Stored on
// pulse_check_entries.check_window (migration 0042). Powers the future
// Pulse-observe follow-up nudge (Slice E).
export const CHECK_WINDOW_VALUES = [
  "24h",
  "3d",
  "7d",
  "next_interaction",
] as const;
export type CheckWindow = (typeof CHECK_WINDOW_VALUES)[number];

// ============================================================
// AI feedback tiering + editable cards (Slice A — coins redesign)
// ============================================================
// Persisted on every Coach derived table's ai_tier column (migration 0038)
// and read by the renderer + the future coin ledger. quick = 3 cards (4
// coins), deep = 5 cards (6 coins). NULL on a row = legacy pre-tiering output.
export type AiTier = "quick" | "deep";

// The five Coach derived tables an AI card can belong to. Mirrors the
// entry_table CHECK in migration 0039 — keep in sync (single source of truth
// for the polymorphic ai_card_edits.entry_table value).
export const AI_CARD_ENTRY_TABLES = [
  "prepare_entries",
  "review_entries",
  "before_you_send_entries",
  "pulse_check_entries",
  "repair_entries",
] as const;
export type AiCardEntryTable = (typeof AI_CARD_ENTRY_TABLES)[number];

// A user's verdict on a single AI card (migration 0039 ai_card_edits.status).
//   accepted — card kept as-is
//   edited   — card text replaced; edited_text is the version of record
//   not_true — card rejected as inaccurate
// Calibration / memory read edited_text when status = 'edited', else the
// model's original card value.
export type CardEditStatus = "accepted" | "edited" | "not_true";

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
  signalNoiseObservation: string | null;
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
  observedRaw: string | null;
  interpretedRaw: string | null;
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
  // Deprecated 2026-05-03 per cross-eval batch #1; retained for historical
  // rows. New rows write null. See validation.ts for rationale.
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
