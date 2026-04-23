// Local types for the weekly_reflections table. These mirror migration
// 0022 exactly. After the migration lands on remote Supabase, running
// `npm run db:types` will regenerate src/types/database.ts to include this
// table; at that point, these local types can be re-derived from the
// generated ones via `Database["public"]["Tables"]["weekly_reflections"]`.
// For now we hand-type so the code compiles against the pre-regen types.

import type { ReflectionOutput } from "@/lib/ai/schemas";

export interface WeeklyReflectionRow {
  reflection_id: string;
  user_id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  input_entry_count: number;
  input_window_days: number;
  generator_version: string;
  prompt_version: string;
  ai_json: ReflectionOutput;
  ai_duration_ms: number;
}

export interface WeeklyReflectionInsert {
  user_id: string;
  period_start: string;
  period_end: string;
  input_entry_count: number;
  input_window_days: number;
  generator_version: string;
  prompt_version: string;
  ai_json: ReflectionOutput;
  ai_duration_ms: number;
}
