import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HistoryList, type HistoryEntry } from "./history-list";

const PAGE_SIZE = 10;

// record_types surfaced in the History UI. onboarding_profile is handled by
// the Retake Quiz flow (on /insights); outcome_tracking is a follow-up PATCH
// to an existing coach entry, not a standalone completed entry.
const DELETABLE_TYPES = [
  "prepare",
  "review",
  "repair",
  "trigger_log",
  "overwhelmed",
] as const;

const MODULE_LABEL: Record<(typeof DELETABLE_TYPES)[number], string> = {
  prepare: "Prepare",
  review: "Review",
  repair: "Repair",
  trigger_log: "Triggered",
  overwhelmed: "Overwhelmed",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Counts per module type. Five parallel `head + count: exact` queries —
  // fine for v0 on a low-traffic page. Swap for a GROUP BY RPC if load grows.
  const countQueries = DELETABLE_TYPES.map((t) =>
    supabase
      .from("raw_records")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("record_type", t)
      .eq("is_complete", true)
      .is("deleted_at", null)
  );

  const countResults = await Promise.all(countQueries);

  const counts: Record<(typeof DELETABLE_TYPES)[number], number> = {
    prepare: 0,
    review: 0,
    repair: 0,
    trigger_log: 0,
    overwhelmed: 0,
  };
  DELETABLE_TYPES.forEach((t, i) => {
    counts[t] = countResults[i].count ?? 0;
  });

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  // Latest 10 entries across the five deletable types.
  const { data: rows } = await supabase
    .from("raw_records")
    .select("raw_record_id, record_type, created_at, completed_at")
    .eq("user_id", user.id)
    .in("record_type", DELETABLE_TYPES as unknown as string[])
    .eq("is_complete", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const initialEntries: HistoryEntry[] = (rows ?? []).map((r) => ({
    id: r.raw_record_id,
    recordType: r.record_type,
    label:
      MODULE_LABEL[r.record_type as keyof typeof MODULE_LABEL] ?? r.record_type,
    completedAt: r.completed_at ?? r.created_at,
  }));

  return (
    <div className="px-5 pt-8 pb-28">
      <h1 className="text-2xl font-bold text-zinc-900">History</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Everything you&apos;ve completed, newest first.
      </p>

      {/* Counts per module */}
      <div className="mt-6 grid grid-cols-5 gap-2">
        {DELETABLE_TYPES.map((t) => (
          <div
            key={t}
            className="rounded-lg border border-zinc-200 bg-white p-3 text-center"
          >
            <p className="text-2xl font-semibold text-zinc-900">{counts[t]}</p>
            <p className="mt-1 text-xs text-zinc-500">{MODULE_LABEL[t]}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-zinc-600">
        Total completed: <span className="font-semibold">{totalCount}</span>
      </p>

      {/* List with select + delete + load more */}
      <HistoryList initialEntries={initialEntries} pageSize={PAGE_SIZE} />
    </div>
  );
}
