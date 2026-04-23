// Weekly reflection row types derived from the generated Supabase types.
// `ai_json` lands as `Json` from the generator but we narrow it to
// ReflectionOutput for consumers that handle Zod-validated rows.

import type { Database } from "@/types/database";
import type { ReflectionOutput } from "@/lib/ai/schemas";

type WeeklyReflectionDbRow =
  Database["public"]["Tables"]["weekly_reflections"]["Row"];
type WeeklyReflectionDbInsert =
  Database["public"]["Tables"]["weekly_reflections"]["Insert"];

export type WeeklyReflectionRow = Omit<WeeklyReflectionDbRow, "ai_json"> & {
  ai_json: ReflectionOutput;
};

export type WeeklyReflectionInsert = Omit<WeeklyReflectionDbInsert, "ai_json"> & {
  ai_json: ReflectionOutput;
};
