import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requirePaidAccessPage } from "@/lib/require-access";
import { HistoryList, type HistoryEntry } from "./history-list";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { captureServerRead } from "@/lib/read-capture";

const PAGE_SIZE = 10;

// Includes legacy `repair` so archived repair rows still surface in
// /history. The `repair` surface itself was removed in the Coach redesign
// (2026-04-23); new repair content ships inside review_entries.
const DELETABLE_TYPES = [
  "prepare",
  "pulse_check",
  "review",
  "before_you_send",
  "repair",
  "trigger_log",
  "overwhelmed",
] as const;

const MODULE_LABEL: Record<(typeof DELETABLE_TYPES)[number], string> = {
  prepare: "Prepare",
  pulse_check: "Pulse Check",
  review: "Review",
  before_you_send: "Before-Send",
  repair: "Repair",
  trigger_log: "Triggered",
  overwhelmed: "Overwhelmed",
};

export default async function HistoryPage() {
  const t0 = Date.now();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  await requirePaidAccessPage(user);

  const countQueries = DELETABLE_TYPES.map((t) =>
    supabase
      .from("raw_records")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("record_type", t)
      .eq("is_complete", true)
      .is("deleted_at", null),
  );
  const rowsQuery = supabase
    .from("raw_records")
    .select("raw_record_id, record_type, created_at, completed_at")
    .eq("user_id", user.id)
    .in("record_type", DELETABLE_TYPES as unknown as string[])
    .eq("is_complete", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const [countResults, rowsRes] = await Promise.all([
    Promise.all(countQueries),
    rowsQuery,
  ]);

  // Inspect .error on each count query and the rows query — PostgREST returns
  // { data: null, error } on RLS mis-config / schema drift / transient outage
  // rather than throwing. Without this, a failure silently zeros the counts.
  countResults.forEach((r, i) => {
    if (r.error) {
      captureServerRead(
        "history",
        `count_${DELETABLE_TYPES[i]}`,
        new Error(`count_${DELETABLE_TYPES[i]}_read_failed`),
      );
    }
  });
  if (rowsRes.error) {
    captureServerRead(
      "history",
      "raw_records",
      new Error("raw_records_read_failed"),
    );
  }

  const { data: rows } = rowsRes;

  const counts: Record<(typeof DELETABLE_TYPES)[number], number> = {
    prepare: 0,
    pulse_check: 0,
    review: 0,
    before_you_send: 0,
    repair: 0,
    trigger_log: 0,
    overwhelmed: 0,
  };
  DELETABLE_TYPES.forEach((t, i) => {
    counts[t] = countResults[i].count ?? 0;
  });

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const initialEntries: HistoryEntry[] = (rows ?? []).map((r) => ({
    id: r.raw_record_id,
    recordType: r.record_type,
    label:
      MODULE_LABEL[r.record_type as keyof typeof MODULE_LABEL] ?? r.record_type,
    completedAt: r.completed_at ?? r.created_at,
  }));

  console.log(`[perf] history ${Date.now() - t0}ms total=${totalCount}`);

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="calm" />

      <h1
        className="mt-2 font-display text-[30px] leading-[1.1] text-ink"
        style={{ letterSpacing: "-0.8px" }}
      >
        History
      </h1>
      <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink-soft">
        Everything you&apos;ve completed, newest first.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {DELETABLE_TYPES.map((t) => (
          <div
            key={t}
            className="rounded-card-xs bg-surface p-3 text-center shadow-soft"
          >
            <p className="font-display text-[22px] leading-none text-ink">
              {counts[t]}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.5px] text-ink-soft">
              {MODULE_LABEL[t]}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[13px] font-medium text-ink-soft">
        Total completed:{" "}
        <span className="font-bold text-ink">{totalCount}</span>
      </p>

      <a
        href="/api/export"
        download
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-pill bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-soft active:opacity-80"
      >
        <Download className="h-4 w-4" />
        Download my data (.txt)
      </a>

      <HistoryList initialEntries={initialEntries} pageSize={PAGE_SIZE} />
    </div>
  );
}
