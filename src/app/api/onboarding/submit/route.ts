import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitQuizSchema } from "@/lib/validation";
import {
  QUESTIONS,
  SCORING_VERSION,
  computeNaturalModule,
  scoreProfile,
  type QuizOption,
} from "@/lib/onboarding";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  // 3. Re-score server-side. Client-computed values are display-only; the
  //    DB row is always derived from the raw answers we just received.
  const orderedAnswers: (QuizOption | null)[] = new Array(9).fill(null);
  for (const a of parsed.data.answers) {
    orderedAnswers[a.questionIndex] = a.selectedOption;
  }
  const result = scoreProfile(orderedAnswers);
  const naturalModule = computeNaturalModule(result.improvementGoal);
  const now = new Date().toISOString();

  // 4. Build raw_records payload. Snapshot question text so future wording
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

  // 5. Source of truth first (raw_records), then the derived summary
  //    (user_profiles). If the summary insert fails we still have the
  //    source row and can re-derive later.
  const { data: rawInserted, error: rawErr } = await supabase
    .from("raw_records")
    .insert({
      user_id: user.id,
      record_type: "onboarding_profile",
      module_type: "onboarding",
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
    return NextResponse.json(
      { error: "Could not save profile snapshot" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    redirectTo: `/coach/${result.recommendedModule}`,
    profile: {
      primary: result.primary,
      secondary: result.secondary,
      improvementGoal: result.improvementGoal,
      recommendedModule: result.recommendedModule,
    },
  });
}
