// Pure EQ domain — replace in fork.
//
// Plain-text export of user-authored content. Excludes AI coaching output,
// pattern observations, derived insights, outcome tracking, and subscription
// metadata. Excludes soft-deleted rows. Designed to be readable top-to-bottom.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { QUESTIONS, type QuizOption } from "@/lib/onboarding";

type Tables = Database["public"]["Tables"];

const DIVIDER = "=".repeat(64);
const ENTRY_SEP = "-".repeat(64);

// Supabase PostgREST caps responses at db-max-rows (1000 by default in
// Supabase Cloud). Setting .limit(N) where N > db-max-rows silently
// truncates at 1000 without an error, so match the cap here and surface a
// truncation notice in the export when we hit it. Raise db-max-rows in
// Supabase project config to lift this.
const ROW_CAP = 1000;
const TRUNCATION_NOTE = `(Showing the most recent ${ROW_CAP} entries — contact support for a full export.)`;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown date";
  // "2026-04-18 14:32 UTC" — unambiguous and locale-independent.
  return (
    d.toISOString().slice(0, 10) +
    " " +
    d.toISOString().slice(11, 16) +
    " UTC"
  );
}

// Push `label: value` or a labeled block, omitting empty values so the
// export doesn't print "(none)" across every skipped optional field.
function appendField(
  lines: string[],
  label: string,
  value: string | null | undefined,
) {
  if (value === null || value === undefined) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  lines.push(`  ${label}:`);
  for (const line of trimmed.split(/\r?\n/)) {
    lines.push(`    ${line}`);
  }
}

function section(title: string, body: string): string {
  return [DIVIDER, title.toUpperCase(), DIVIDER, "", body].join("\n");
}

function emptySection(title: string): string {
  return section(title, "No entries yet.\n");
}

function truncationPrefix(truncated: boolean): string {
  return truncated ? `${TRUNCATION_NOTE}\n\n` : "";
}

// ---------------------------------------------------------------------------
// Per-section formatters — exported for unit testing.
// Row types are Picked from Database so column renames break the build
// rather than silently dropping fields.
// ---------------------------------------------------------------------------

type ProfileRow = Pick<
  Tables["user_profiles"]["Row"],
  "primary_profile" | "secondary_profile" | "created_at"
>;

type OnboardingPayload = {
  answers?: { q_index: number; selected: QuizOption }[];
  question_snapshot?: {
    text: string;
    options: Record<string, string>;
  }[];
};

export function formatProfileSection(
  profile: ProfileRow | null,
  onboardingRaw: { payload_json: unknown; created_at: string } | null,
): string {
  if (!profile) return emptySection("Communication Profile");

  const lines: string[] = [];
  lines.push(`Snapshot taken: ${formatDate(profile.created_at)}`);
  lines.push(`Primary profile: ${profile.primary_profile}`);
  if (profile.secondary_profile) {
    lines.push(`Secondary profile: ${profile.secondary_profile}`);
  }

  const raw = onboardingRaw?.payload_json;
  // Defensive: payload_json is `unknown` — don't trust the shape. Only
  // touch `answers` if it's actually an array, and only emit `question_snapshot`
  // text if each snapshot row has the fields we expect.
  const payload: OnboardingPayload =
    typeof raw === "object" && raw !== null ? (raw as OnboardingPayload) : {};
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  if (answers.length > 0) {
    lines.push("");
    lines.push("Quiz answers:");
    const snapshot = payload.question_snapshot;
    for (const a of answers) {
      const idx = a.q_index;
      const snap = Array.isArray(snapshot) ? snapshot[idx] : undefined;
      const qText = snap?.text ?? QUESTIONS[idx]?.text ?? `Question ${idx + 1}`;
      const optText =
        snap?.options?.[a.selected] ??
        QUESTIONS[idx]?.options.find((o) => o.label === a.selected)?.text ??
        "";
      lines.push(`  Q${idx + 1}. ${qText}`);
      lines.push(`    → ${a.selected}: ${optText}`);
    }
  }
  lines.push("");
  return section("Communication Profile", lines.join("\n"));
}

type PersonMap = Map<string, string>;
type ThreadMap = Map<string, string | null>;

function personLabel(personId: string | null, map: PersonMap): string {
  if (!personId) return "No person set";
  return map.get(personId) ?? "Unknown person";
}

function threadLabel(threadId: string | null, map: ThreadMap): string | null {
  if (!threadId) return null;
  return map.get(threadId) ?? null;
}

function entryHeader(
  createdAt: string,
  personId: string | null,
  personMap: PersonMap,
  threadId: string | null,
  threadMap: ThreadMap,
): string {
  const parts = [`[${formatDate(createdAt)}]`, personLabel(personId, personMap)];
  const t = threadLabel(threadId, threadMap);
  if (t) parts.push(`Thread: ${t}`);
  return parts.join(" — ");
}

// Prepare rows span three shape eras after the 2026-04-23 redesign:
// - Path A (pre-conversation, pre-SOT): situation_text, primary_value
//   (legacy), their_need, how_to_make_them_feel.
// - Path B ("something feels off"): what_feels_off, what_changed,
//   story_telling_yourself, afraid_it_means.
// - SOT (2026-05-08 + 2026-05-17 followup, path='sot'/'sot_v2'): the
//   structured "Coach Source Of Truth" flow with primary_emotion +
//   body chip, default_pattern, neutral_check_question, the empathy
//   ladder (observed_from_them → their_state_hedged → fairest_version
//   → predicted_reaction → hidden_expectation), outcome (specific_shift
//   / outcome_floor), opener, trigger_plan.
// The `path` column is NULL on rows written before migration 0026,
// 'path_a'/'path_b' for the 2026-04-23 era, and 'sot'/'sot_v2' for the
// SOT era. The formatter handles all eras by field-presence: if a field
// is non-empty it renders.
type PrepareRow = Pick<
  Tables["prepare_entries"]["Row"],
  | "created_at"
  | "path"
  // Path A / legacy
  | "situation_text"
  | "desired_outcome"
  | "primary_value"
  | "their_need"
  | "how_to_make_them_feel"
  // Path B
  | "what_feels_off"
  | "what_changed"
  | "story_telling_yourself"
  | "afraid_it_means"
  | "signal_noise_observation"
  // SOT 2026-05-08 (migration 0036) + 2026-05-17 followup (0037)
  | "primary_emotion"
  | "body_location"
  | "emotion_as_data"
  | "default_pattern"
  | "observed_from_them"
  | "their_state_hedged"
  | "fairest_version"
  | "predicted_reaction"
  | "hidden_expectation"
  | "neutral_check_question"
  | "specific_shift"
  | "outcome_floor"
  | "opener"
  | "trigger_plan"
  // Lean (0040) + redesign (0053) inputs
  | "conversation_move"
  | "conversation_type_primary"
  | "conversation_type_secondary"
  | "feeling_and_why"
  | "my_pattern"
  | "their_feeling_want"
  | "hidden_ask_and_floor"
  | "person_id"
  | "thread_id"
>;

export function formatPrepareSection(
  rows: PrepareRow[],
  personMap: PersonMap,
  threadMap: ThreadMap,
  truncated = false,
): string {
  const title = `Prepare entries (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const r of rows) {
    const lines: string[] = [];
    const pathLabel =
      r.path === "path_a"
        ? " — Conversation coming up"
        : r.path === "path_b"
          ? " — Something feels off"
          : r.path === "sot" || r.path === "sot_v2"
            ? " — Coach SOT"
            : "";
    lines.push(
      entryHeader(r.created_at, r.person_id, personMap, r.thread_id, threadMap) +
        pathLabel,
    );
    lines.push("");
    // Path A / legacy
    appendField(lines, "Situation", r.situation_text);
    appendField(lines, "Desired outcome", r.desired_outcome);
    appendField(lines, "What matters to me", r.primary_value);
    appendField(lines, "What they might need", r.their_need);
    appendField(lines, "How I want them to feel", r.how_to_make_them_feel);
    // Path B
    appendField(lines, "What feels off", r.what_feels_off);
    appendField(lines, "What changed", r.what_changed);
    appendField(lines, "Story I'm telling myself", r.story_telling_yourself);
    appendField(lines, "What I'm afraid it means", r.afraid_it_means);
    appendField(
      lines,
      "What would tell me this is real (3–7 day signal/noise)",
      r.signal_noise_observation,
    );
    // SOT 2026-05-08 + 2026-05-17 — empathy ladder + outcome + opener + plan.
    appendField(lines, "Primary emotion going in", r.primary_emotion);
    appendField(lines, "Where I feel it in my body", r.body_location);
    appendField(lines, "What this emotion is data about", r.emotion_as_data);
    appendField(lines, "My default pattern under this emotion", r.default_pattern);
    appendField(lines, "What I observed in them", r.observed_from_them);
    appendField(lines, "What I'd guess they're feeling (hedged)", r.their_state_hedged);
    appendField(lines, "Fairest version of their behavior", r.fairest_version);
    appendField(lines, "What I predict their reaction will be", r.predicted_reaction);
    appendField(lines, "Hidden expectation I'm bringing", r.hidden_expectation);
    appendField(lines, "Neutral question to ask instead of assume", r.neutral_check_question);
    appendField(lines, "Specific shift I want", r.specific_shift);
    appendField(lines, "Floor — what's good enough", r.outcome_floor);
    // Lean (0040) + redesign (0053) inputs.
    appendField(lines, "Kind of conversation (legacy)", r.conversation_move);
    appendField(lines, "Outcome sought (primary)", r.conversation_type_primary);
    appendField(lines, "Outcome sought (secondary)", r.conversation_type_secondary);
    appendField(lines, "What I'm feeling and why", r.feeling_and_why);
    appendField(lines, "My pattern that gets in the way", r.my_pattern);
    appendField(lines, "What they might feel or want", r.their_feeling_want);
    appendField(lines, "Hidden hope + good-enough floor", r.hidden_ask_and_floor);
    appendField(lines, "Opener", r.opener);
    appendField(lines, "If-then trigger plan", r.trigger_plan);
    blocks.push(lines.join("\n"));
  }
  return section(
    title,
    truncationPrefix(truncated) + blocks.join(`\n\n${ENTRY_SEP}\n\n`) + "\n",
  );
}

// Review rows span three shape eras:
// - Legacy: what_helped, what_hurt, validated_assumptions, unresolved_and_next.
// - 2026-04-23 redesign: what_you_did, what_you_avoided,
//   ask_before_understanding, needs_to_happen_next, plus repair branch
//   (your_part, secret_want, could_make_them_feel).
// - SOT 2026-05-08 (0036) + 2026-05-17 followup (0037):
//   review_depth (quick/full), felt_at_hardest_moment + body_location
//   pair, feeling_tracking, calibration_block jsonb {compare,shift,floor},
//   what_protecting + what_protecting_text, lesson screen
//   (lesson_about_them / lesson_about_self / lesson_differently), forecast,
//   what_else_explains, what_read_missed, plus expanded repair fields
//   (impact_to_name, their_need_first, pressure_vs_care, timing_when,
//   timing_now, first_repair_sentence) and outcome arc fields
//   (easier_or_harder, treat_as_data, something_that_helped,
//   their_in_moment_experience, signs_how_they_left, turning_point).
// All fields render via appendField — non-empty values only.
type CalibrationBlock = {
  compare?: string;
  shift?: string;
  floor?: string;
};
type ReviewRow = Pick<
  Tables["review_entries"]["Row"],
  | "created_at"
  | "review_depth"
  | "what_happened"
  | "observed_raw"
  | "interpreted_raw"
  | "hardest_moment_feeling"
  | "felt_at_hardest_moment"
  | "body_location"
  | "feeling_tracking"
  | "observed_in_them"
  | "their_experience"
  | "their_in_moment_experience"
  | "what_helped"
  | "what_hurt"
  | "validated_assumptions"
  | "unresolved_and_next"
  | "what_you_did"
  | "what_you_avoided"
  | "ask_before_understanding"
  | "needs_to_happen_next"
  | "next_move"
  | "data_and_update"
  | "forecast"
  | "easier_or_harder"
  | "treat_as_data"
  | "something_that_helped"
  | "signs_how_they_left"
  | "turning_point"
  | "what_protecting"
  | "what_protecting_text"
  | "lesson_about_them"
  | "lesson_about_self"
  | "lesson_differently"
  | "what_else_explains"
  | "what_read_missed"
  | "calibration_block"
  | "repair_branch_active"
  | "impact_to_name"
  | "their_need_first"
  | "pressure_vs_care"
  | "timing_when"
  | "timing_now"
  | "first_repair_sentence"
  | "your_part"
  | "secret_want"
  | "could_make_them_feel"
  | "person_id"
  | "thread_id"
>;

export function formatReviewSection(
  rows: ReviewRow[],
  personMap: PersonMap,
  threadMap: ThreadMap,
  truncated = false,
): string {
  const title = `Review entries (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const r of rows) {
    const lines: string[] = [];
    const depthLabel =
      r.review_depth === "quick"
        ? " — Quick review"
        : r.review_depth === "full"
          ? " — Full review"
          : "";
    lines.push(
      entryHeader(r.created_at, r.person_id, personMap, r.thread_id, threadMap) +
        depthLabel,
    );
    lines.push("");
    appendField(lines, "What happened", r.what_happened);
    // Cross-eval batch #1 (2026-05-03): two-column observed/interpreted step.
    // Legacy rows have null on these and skip via appendField.
    appendField(lines, "What I observed (facts)", r.observed_raw);
    appendField(lines, "What I thought it meant", r.interpreted_raw);
    // SOT 2026-05-08: felt_at_hardest_moment + body_location pair supersedes
    // the legacy hardest_moment_feeling text column. Both rendered if present
    // (legacy rows have one, SOT rows the other).
    appendField(lines, "What I felt at the hardest moment", r.felt_at_hardest_moment);
    appendField(lines, "Where I felt it in my body", r.body_location);
    appendField(lines, "Hardest moment — what I was feeling (legacy)", r.hardest_moment_feeling);
    appendField(lines, "Was that feeling tracking something real?", r.feeling_tracking);
    appendField(lines, "What I observed in them", r.observed_in_them);
    appendField(lines, "What it might have felt like for them in that moment", r.their_in_moment_experience);
    appendField(lines, "Their experience (legacy)", r.their_experience);
    // New shape (2026-04-23)
    appendField(lines, "What I did", r.what_you_did);
    appendField(lines, "What I avoided", r.what_you_avoided);
    appendField(lines, "Did I ask before assuming", r.ask_before_understanding);
    appendField(lines, "What needs to happen next", r.needs_to_happen_next);
    // Lean Review (redesign): next_move chip + merged data_and_update.
    appendField(lines, "Next move", r.next_move);
    appendField(lines, "What this taught me / what to change next time", r.data_and_update);
    appendField(lines, "Forecast (5–7 day)", r.forecast);
    // SOT 2026-05-08 outcome arc
    appendField(lines, "Easier or harder than I predicted?", r.easier_or_harder);
    appendField(lines, "Was that prediction worth treating as data?", r.treat_as_data);
    appendField(lines, "Something that helped (even if small)", r.something_that_helped);
    appendField(lines, "Signs of how they left it", r.signs_how_they_left);
    appendField(lines, "Turning point in the conversation", r.turning_point);
    // SOT 2026-05-08 lesson + protecting
    appendField(lines, "What I was wanting or protecting", r.what_protecting);
    appendField(lines, "What that was (one line)", r.what_protecting_text);
    appendField(lines, "Lesson — what I learned about them", r.lesson_about_them);
    appendField(lines, "Lesson — what I learned about myself", r.lesson_about_self);
    appendField(lines, "Lesson — what I'd do differently", r.lesson_differently);
    appendField(lines, "What else could explain what happened", r.what_else_explains);
    appendField(lines, "What might my read have missed", r.what_read_missed);
    // Calibration block (linked-Prepare reviews only) — jsonb shape
    // { compare, shift, floor }. Each is an enum string; render verbatim.
    if (r.calibration_block && typeof r.calibration_block === "object") {
      const cal = r.calibration_block as CalibrationBlock;
      appendField(lines, "Calibration — vs prediction", cal.compare);
      appendField(lines, "Calibration — vs prior similar conversations", cal.shift);
      appendField(lines, "Calibration — vs outcome floor", cal.floor);
    }
    if (r.repair_branch_active) {
      // SOT 2026-05-08 expanded repair branch (6 fields).
      appendField(lines, "Impact to name in the repair", r.impact_to_name);
      appendField(lines, "Their need to address first", r.their_need_first);
      appendField(lines, "Pressure vs care — how to land it", r.pressure_vs_care);
      appendField(lines, "Timing — when to repair", r.timing_when);
      if (r.timing_now !== null && r.timing_now !== undefined) {
        appendField(lines, "Repair-now decision", r.timing_now ? "Now" : "Later");
      }
      appendField(lines, "First repair sentence", r.first_repair_sentence);
      // Legacy repair fields (pre-SOT).
      appendField(lines, "My part in this (legacy)", r.your_part);
      appendField(lines, "What I secretly want from them (legacy)", r.secret_want);
      appendField(lines, "What I want them to feel after the repair (legacy)", r.could_make_them_feel);
    }
    // Legacy shape (pre-2026-04-23)
    appendField(lines, "What helped", r.what_helped);
    appendField(lines, "What hurt", r.what_hurt);
    appendField(lines, "Assumptions I validated", r.validated_assumptions);
    appendField(lines, "Unresolved — and what's next", r.unresolved_and_next);
    blocks.push(lines.join("\n"));
  }
  return section(
    title,
    truncationPrefix(truncated) + blocks.join(`\n\n${ENTRY_SEP}\n\n`) + "\n",
  );
}

// Before-You-Send: new in the 2026-04-23 redesign. No person or thread.
type BeforeYouSendRow = Pick<
  Tables["before_you_send_entries"]["Row"],
  "created_at" | "draft_text" | "message_type" | "intent_optional"
>;

export function formatBeforeYouSendSection(
  rows: BeforeYouSendRow[],
  truncated = false,
): string {
  const title = `Before-You-Send drafts (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const r of rows) {
    const lines: string[] = [];
    lines.push(`[${formatDate(r.created_at)}] — ${r.message_type}`);
    lines.push("");
    appendField(lines, "Draft", r.draft_text);
    appendField(lines, "Intent I wanted to land", r.intent_optional);
    blocks.push(lines.join("\n"));
  }
  return section(
    title,
    truncationPrefix(truncated) + blocks.join(`\n\n${ENTRY_SEP}\n\n`) + "\n",
  );
}

type RepairRow = Pick<
  Tables["repair_entries"]["Row"],
  | "created_at"
  | "what_needs_repair"
  | "your_responsibility"
  | "their_need"
  | "desired_outcome"
  | "channel"
  | "timing"
  | "person_id"
  | "thread_id"
>;

export function formatRepairSection(
  rows: RepairRow[],
  personMap: PersonMap,
  threadMap: ThreadMap,
  truncated = false,
): string {
  const title = `Repair entries (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const r of rows) {
    const lines: string[] = [];
    lines.push(
      entryHeader(r.created_at, r.person_id, personMap, r.thread_id, threadMap),
    );
    lines.push("");
    appendField(lines, "What needs repair", r.what_needs_repair);
    appendField(lines, "My responsibility", r.your_responsibility);
    appendField(lines, "Their need", r.their_need);
    appendField(lines, "Desired outcome", r.desired_outcome);
    appendField(lines, "Channel", r.channel);
    appendField(lines, "Timing", r.timing);
    blocks.push(lines.join("\n"));
  }
  return section(
    title,
    truncationPrefix(truncated) + blocks.join(`\n\n${ENTRY_SEP}\n\n`) + "\n",
  );
}

type TriggerRow = Pick<
  Tables["trigger_entries"]["Row"],
  | "created_at"
  | "event_text"
  | "interpretation"
  | "emotion"
  | "urge"
  | "behavior"
  | "outcome"
  | "learning"
  | "person_id"
>;

export function formatTriggerSection(
  rows: TriggerRow[],
  personMap: PersonMap,
  truncated = false,
): string {
  const title = `Triggered entries (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const r of rows) {
    const lines: string[] = [];
    lines.push(
      `[${formatDate(r.created_at)}] — ${personLabel(r.person_id, personMap)}`,
    );
    lines.push("");
    appendField(lines, "Event", r.event_text);
    appendField(lines, "Interpretation", r.interpretation);
    appendField(lines, "Emotion", r.emotion);
    appendField(lines, "Urge", r.urge);
    appendField(lines, "What I did", r.behavior);
    appendField(lines, "Outcome", r.outcome);
    appendField(lines, "Learning", r.learning);
    blocks.push(lines.join("\n"));
  }
  return section(
    title,
    truncationPrefix(truncated) + blocks.join(`\n\n${ENTRY_SEP}\n\n`) + "\n",
  );
}

type OverwhelmedRow = Pick<
  Tables["overwhelmed_entries"]["Row"],
  "created_at" | "what_happened" | "body_sensations" | "overwhelm_before" | "overwhelm_after" | "technique_used"
>;

export function formatOverwhelmedSection(
  rows: OverwhelmedRow[],
  truncated = false,
): string {
  const title = `Overwhelmed entries (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const r of rows) {
    const lines: string[] = [];
    lines.push(`[${formatDate(r.created_at)}]`);
    lines.push("");
    appendField(lines, "What happened", r.what_happened);
    appendField(lines, "Body sensations", r.body_sensations);
    if (r.overwhelm_before !== null) {
      appendField(
        lines,
        "Overwhelm level before",
        `${r.overwhelm_before} / 5`,
      );
    }
    if (r.overwhelm_after !== null) {
      appendField(
        lines,
        "Overwhelm level after",
        `${r.overwhelm_after} / 5`,
      );
    }
    appendField(lines, "Technique used", r.technique_used);
    blocks.push(lines.join("\n"));
  }
  return section(
    title,
    truncationPrefix(truncated) + blocks.join(`\n\n${ENTRY_SEP}\n\n`) + "\n",
  );
}

type PersonRow = Pick<
  Tables["persons"]["Row"],
  "display_name" | "relationship_domain" | "relationship_subtype" | "created_at"
>;

export function formatPersonsSection(rows: PersonRow[]): string {
  const title = `People (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const lines: string[] = [];
  for (const p of rows) {
    const domain = p.relationship_subtype
      ? `${p.relationship_domain} — ${p.relationship_subtype}`
      : p.relationship_domain;
    lines.push(`- ${p.display_name} (${domain})`);
  }
  lines.push("");
  return section(title, lines.join("\n"));
}

type ThreadRow = Pick<
  Tables["conversation_threads"]["Row"],
  "title" | "status" | "started_at" | "last_activity_at" | "person_id"
>;

export function formatThreadsSection(
  rows: ThreadRow[],
  personMap: PersonMap,
): string {
  const title = `Conversations (${rows.length})`;
  if (rows.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const t of rows) {
    const lines: string[] = [];
    lines.push(`- ${t.title ?? "(untitled)"}`);
    lines.push(`    With: ${personLabel(t.person_id, personMap)}`);
    lines.push(`    Status: ${t.status}`);
    lines.push(`    Started: ${formatDate(t.started_at)}`);
    lines.push(`    Last activity: ${formatDate(t.last_activity_at)}`);
    blocks.push(lines.join("\n"));
  }
  blocks.push("");
  return section(title, blocks.join("\n"));
}

type MemoryRow = Pick<
  Tables["relationship_memories"]["Row"],
  "user_written_context" | "pinned_notes" | "last_interaction_at" | "person_id"
>;

export function formatMemoriesSection(
  rows: MemoryRow[],
  personMap: PersonMap,
): string {
  const nonEmpty = rows.filter(
    (m) =>
      (m.user_written_context && m.user_written_context.trim()) ||
      (m.pinned_notes && m.pinned_notes.trim()),
  );
  const title = `Relationship notes (${nonEmpty.length})`;
  if (nonEmpty.length === 0) return emptySection(title);
  const blocks: string[] = [];
  for (const m of nonEmpty) {
    const lines: string[] = [];
    lines.push(`- ${personLabel(m.person_id, personMap)}`);
    if (m.last_interaction_at) {
      lines.push(`    Last interaction: ${formatDate(m.last_interaction_at)}`);
    }
    appendField(lines, "  Context", m.user_written_context);
    appendField(lines, "  Pinned notes", m.pinned_notes);
    blocks.push(lines.join("\n"));
  }
  blocks.push("");
  return section(title, blocks.join("\n"));
}

function formatHeader(userEmail: string): string {
  const now = new Date();
  return [
    "PURE EQ — YOUR DATA EXPORT",
    `Exported: ${formatDate(now.toISOString())}`,
    `Account: ${userEmail || "(no email on record)"}`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Orchestrator — runs all queries in parallel and composes the text file.
// Throws on any DB error so the route handler can surface a 500 instead of
// returning a silently-empty export.
// ---------------------------------------------------------------------------

export async function buildExportText(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
): Promise<string> {
  const [
    profileRes,
    onboardingRawRes,
    prepareRes,
    reviewRes,
    repairRes,
    beforeYouSendRes,
    triggerRes,
    overwhelmedRes,
    personsRes,
    threadsRes,
    memoriesRes,
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("primary_profile, secondary_profile, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("raw_records")
      .select("payload_json, created_at")
      .eq("user_id", userId)
      .eq("record_type", "onboarding_profile")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("prepare_entries")
      .select(
        "created_at, path, situation_text, desired_outcome, primary_value, their_need, how_to_make_them_feel, what_feels_off, what_changed, story_telling_yourself, afraid_it_means, signal_noise_observation, primary_emotion, body_location, emotion_as_data, default_pattern, observed_from_them, their_state_hedged, fairest_version, predicted_reaction, hidden_expectation, neutral_check_question, specific_shift, outcome_floor, opener, trigger_plan, conversation_move, conversation_type_primary, conversation_type_secondary, feeling_and_why, my_pattern, their_feeling_want, hidden_ask_and_floor, person_id, thread_id",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("review_entries")
      .select(
        "created_at, review_depth, what_happened, observed_raw, interpreted_raw, hardest_moment_feeling, felt_at_hardest_moment, body_location, feeling_tracking, observed_in_them, their_experience, their_in_moment_experience, what_helped, what_hurt, validated_assumptions, unresolved_and_next, what_you_did, what_you_avoided, ask_before_understanding, needs_to_happen_next, next_move, data_and_update, forecast, easier_or_harder, treat_as_data, something_that_helped, signs_how_they_left, turning_point, what_protecting, what_protecting_text, lesson_about_them, lesson_about_self, lesson_differently, what_else_explains, what_read_missed, calibration_block, repair_branch_active, impact_to_name, their_need_first, pressure_vs_care, timing_when, timing_now, first_repair_sentence, your_part, secret_want, could_make_them_feel, person_id, thread_id",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("repair_entries")
      .select(
        "created_at, what_needs_repair, your_responsibility, their_need, desired_outcome, channel, timing, person_id, thread_id",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("before_you_send_entries")
      .select(
        "created_at, draft_text, message_type, intent_optional",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("trigger_entries")
      .select(
        "created_at, event_text, interpretation, emotion, urge, behavior, outcome, learning, person_id",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("overwhelmed_entries")
      .select(
        "created_at, what_happened, body_sensations, overwhelm_before, overwhelm_after, technique_used",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("persons")
      .select("person_id, display_name, relationship_domain, relationship_subtype, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(ROW_CAP),

    supabase
      .from("conversation_threads")
      .select("thread_id, title, status, started_at, last_activity_at, person_id")
      .eq("user_id", userId)
      .order("last_activity_at", { ascending: false })
      .limit(ROW_CAP),

    supabase
      .from("relationship_memories")
      .select("user_written_context, pinned_notes, last_interaction_at, person_id")
      .eq("user_id", userId)
      .limit(ROW_CAP),
  ]);

  // Per-query error inspection: an aggregation route that silently renders
  // "No entries yet." sections on DB failure tells the user their data is
  // gone when it's actually a connectivity problem. Throw so the route
  // handler returns 500 and the user can retry.
  const errors: string[] = [];
  if (profileRes.error) errors.push(`profile(${profileRes.error.code ?? "?"})`);
  if (onboardingRawRes.error) errors.push(`onboarding(${onboardingRawRes.error.code ?? "?"})`);
  if (prepareRes.error) errors.push(`prepare(${prepareRes.error.code ?? "?"})`);
  if (reviewRes.error) errors.push(`review(${reviewRes.error.code ?? "?"})`);
  if (repairRes.error) errors.push(`repair(${repairRes.error.code ?? "?"})`);
  if (beforeYouSendRes.error) errors.push(`before_you_send(${beforeYouSendRes.error.code ?? "?"})`);
  if (triggerRes.error) errors.push(`trigger(${triggerRes.error.code ?? "?"})`);
  if (overwhelmedRes.error) errors.push(`overwhelmed(${overwhelmedRes.error.code ?? "?"})`);
  if (personsRes.error) errors.push(`persons(${personsRes.error.code ?? "?"})`);
  if (threadsRes.error) errors.push(`threads(${threadsRes.error.code ?? "?"})`);
  if (memoriesRes.error) errors.push(`memories(${memoriesRes.error.code ?? "?"})`);
  if (errors.length > 0) {
    throw new Error(`export: query failures: ${errors.join(", ")}`);
  }

  const persons = personsRes.data ?? [];
  const threads = threadsRes.data ?? [];
  const personMap: PersonMap = new Map(
    persons.map((p) => [p.person_id, p.display_name]),
  );
  const threadMap: ThreadMap = new Map(
    threads.map((t) => [t.thread_id, t.title]),
  );

  // Truncation: if a section filled to ROW_CAP exactly, PostgREST may have
  // capped at the db-max-rows limit — notify the user inside that section.
  const prepareRows = prepareRes.data ?? [];
  const reviewRows = reviewRes.data ?? [];
  const repairRows = repairRes.data ?? [];
  const beforeYouSendRows = beforeYouSendRes.data ?? [];
  const triggerRows = triggerRes.data ?? [];
  const overwhelmedRows = overwhelmedRes.data ?? [];

  const parts = [
    formatHeader(userEmail),
    formatProfileSection(profileRes.data, onboardingRawRes.data),
    formatPrepareSection(prepareRows, personMap, threadMap, prepareRows.length >= ROW_CAP),
    formatReviewSection(reviewRows, personMap, threadMap, reviewRows.length >= ROW_CAP),
    formatBeforeYouSendSection(beforeYouSendRows, beforeYouSendRows.length >= ROW_CAP),
    formatRepairSection(repairRows, personMap, threadMap, repairRows.length >= ROW_CAP),
    formatTriggerSection(triggerRows, personMap, triggerRows.length >= ROW_CAP),
    formatOverwhelmedSection(overwhelmedRows, overwhelmedRows.length >= ROW_CAP),
    formatPersonsSection(persons),
    formatThreadsSection(threads, personMap),
    formatMemoriesSection(memoriesRes.data ?? [], personMap),
  ];

  return parts.join("\n");
}
