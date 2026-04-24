// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitQuizSchema } from "@/lib/validation";
import {
  MODULE_TO_PATH,
  QUESTIONS,
  SCORING_VERSION,
  scoreProfile,
  type QuizOption,
} from "@/lib/onboarding";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // 0. Origin check — CSRF protection.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid onboarding submission" },
      { status: 400 }
    );
  }

  // 2. Auth — never trust client-provided user id.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 3. Rate limit per user. 5 submissions per minute is generous for a
  //    legitimate flow (one retry + some testing) and blocks accidental
  //    loops / hostile spamming.
  const rl = await rateLimit(`onboarding:${user.id}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // 4. Re-score server-side. Client-computed values are display-only; the
  //    DB row is always derived from the raw answers we just received.
  //    submitQuizSchema already enforces exactly one answer per index 0-8.
  const orderedAnswers: (QuizOption | null)[] = new Array(9).fill(null);
  for (const a of parsed.data.answers) {
    orderedAnswers[a.questionIndex] = a.selectedOption;
  }

  let result;
  try {
    result = scoreProfile(orderedAnswers);
  } catch {
    return NextResponse.json(
      { error: "Quiz answers could not be scored" },
      { status: 400 }
    );
  }
  // Forecast-era: natural === recommended for every enabled module. Field
  // kept on payload_json for back-compat with pre-rewrite rows.
  const naturalModule = result.recommendedModule;
  const now = new Date().toISOString();

  // 5. Build raw_records payload. Snapshot question text so future wording
  //    changes don't corrupt historical records (§21.2 "preserve source").
  const payload = {
    answers: parsed.data.answers.map((a) => ({
      q_index: a.questionIndex,
      selected: a.selectedOption,
    })),
    question_snapshot: QUESTIONS.map((q) => ({
      text: q.text,
      options: Object.fromEntries(q.options.map((o) => [o.label, o.text])),
      mapping: q.mapping,
      secondary: q.secondary ?? null,
    })),
    derived: {
      primary_profile: result.primary,
      secondary_profile: result.secondary,
      scores: result.scores,
      improvement_goal: result.improvementGoal,
      natural_module: naturalModule,
      enabled_module: result.recommendedModule,
    },
  };

  // 6. Source of truth first (raw_records), then the derived summary
  //    (user_profiles). If the summary insert fails we delete the orphan
  //    raw_record so retries don't pile up. A Postgres RPC would be more
  //    elegant, but cleanup-on-failure is sufficient for v0.
  const { data: rawInserted, error: rawErr } = await supabase
    .from("raw_records")
    .insert({
      user_id: user.id,
      record_type: "onboarding_profile",
      module_type: "onboarding",
      // Server-generated session id. Not client-correlated in v0 — if we
      // ever need cross-device correlation we'll pipe this from the client.
      source_session_id: crypto.randomUUID(),
      payload_json: payload,
      schema_version: 1,
      is_complete: true,
      completed_at: now,
    })
    .select("raw_record_id")
    .single();

  if (rawErr || !rawInserted) {
    console.error("onboarding: raw_records insert failed", rawErr?.code);
    return NextResponse.json(
      { error: "Could not save onboarding" },
      { status: 500 }
    );
  }

  const { error: profileErr } = await supabase.from("user_profiles").insert({
    user_id: user.id,
    primary_profile: result.primary,
    secondary_profile: result.secondary,
    scoring_version: SCORING_VERSION,
    routing_output: {
      improvement_goal: result.improvementGoal,
      natural_module: naturalModule,
      enabled_module: result.recommendedModule,
      scores: result.scores,
      source_raw_record_id: rawInserted.raw_record_id,
    },
  });

  if (profileErr) {
    console.error("onboarding: user_profiles insert failed", profileErr.code);
    // Cleanup orphan raw_record so retries start clean. Failure to delete
    // here is acceptable: the next successful attempt will just add another
    // raw row, which is append-only by design anyway.
    await supabase
      .from("raw_records")
      .delete()
      .eq("raw_record_id", rawInserted.raw_record_id);
    return NextResponse.json(
      { error: "Could not save profile snapshot" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    redirectTo: MODULE_TO_PATH[result.recommendedModule],
    profile: {
      primary: result.primary,
      secondary: result.secondary,
      improvementGoal: result.improvementGoal,
      recommendedModule: result.recommendedModule,
    },
  });
}
