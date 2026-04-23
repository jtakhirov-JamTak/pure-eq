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

// Coach module types
export interface PrepareEntry {
  id: string;
  userId: string;
  personId: string | null;
  threadId: string | null;
  personName: string;
  relationship: RelationshipDomain;
  situation: string;
  desiredOutcome: string;
  primaryEmotion: string;
  defaultPattern: string;
  otherPersonHypothesis: string;
  realityCheckQuestion: string;
  triggerPlan: string;
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
  observedInThem: string;
  theirExperience: string;
  whatHelped: string;
  whatHurt: string;
  validatedAssumptions: string;
  unresolvedAndNext: string;
  inputModes: Record<string, InputMode>;
  createdAt: string;
  completedAt: string | null;
}

// AI output types — structured JSON, never free-form.
export interface PrepareAIOutput {
  reality_check_question: string;
  thing_not_to_do: string;
  best_next_move: string;
}

export interface ReviewAIOutput {
  how_user_likely_came_across: string;
  alternative_explanation: string;
}

export interface RepairAIOutput {
  repair_strategy: string;
  thing_not_to_say: string;
  recommended_timing: string;
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
