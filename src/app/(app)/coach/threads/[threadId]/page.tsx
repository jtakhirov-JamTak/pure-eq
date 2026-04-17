import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ThreadStatusSelector from "./thread-status-selector";

const MODULE_BADGES: Record<string, { label: string; color: string }> = {
  prepare: { label: "Prepare", color: "bg-blue-100 text-blue-700" },
  review: { label: "Review", color: "bg-purple-100 text-purple-700" },
  repair: { label: "Repair", color: "bg-amber-100 text-amber-700" },
};

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch thread (RLS ensures user ownership).
  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("thread_id, title, status, person_id, last_activity_at, started_at")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread) notFound();

  // Fetch person name and entries linked to this thread.
  const [personRes, entriesRes] = await Promise.all([
    thread.person_id
      ? supabase
          .from("persons")
          .select("display_name")
          .eq("person_id", thread.person_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("raw_records")
      .select("raw_record_id, record_type, created_at, payload_json")
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .eq("is_complete", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  const personName = personRes.data?.display_name ?? "Someone";
  const entries = entriesRes.data ?? [];

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getExcerpt(payloadJson: unknown): string {
    if (!payloadJson || typeof payloadJson !== "object") return "";
    const payload = payloadJson as { fields?: Record<string, string> };
    const fields = payload.fields;
    if (!fields) return "";
    // Pick the most descriptive field per module type.
    const text =
      fields.situation ??
      fields.whatHappened ??
      fields.whatNeedsRepair ??
      "";
    if (!text) return "";
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  }

  return (
    <div className="px-5 pb-28 pt-8">
      <div className="flex items-center justify-between">
        <Link
          href="/coach/threads"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          Back
        </Link>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Conversation with {personName}
        </p>
        {thread.title && (
          <h2 className="mt-1 truncate text-lg font-bold text-zinc-900">
            {thread.title}
          </h2>
        )}
      </div>

      <div className="mt-4">
        <ThreadStatusSelector
          threadId={thread.thread_id}
          currentStatus={thread.status}
        />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Started {formatDate(thread.started_at)} · Last activity{" "}
        {formatDate(thread.last_activity_at)}
      </p>

      {/* Entry Timeline */}
      <div className="mt-6">
        <p className="text-sm font-medium text-zinc-700">Timeline</p>

        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No entries linked to this thread yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {entries.map((entry) => {
              const badge = MODULE_BADGES[entry.record_type] ?? {
                label: entry.record_type,
                color: "bg-zinc-100 text-zinc-600",
              };
              const excerpt = getExcerpt(entry.payload_json);

              return (
                <div
                  key={entry.raw_record_id}
                  className="rounded-xl border border-zinc-200 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {entry.created_at ? formatDate(entry.created_at) : ""}
                    </span>
                  </div>
                  {excerpt && (
                    <p className="mt-2 text-sm text-zinc-600">{excerpt}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-8 space-y-2">
        <p className="text-sm font-medium text-zinc-700">Add to this thread</p>
        <div className="flex gap-2">
          <Link
            href="/coach/review"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Review
          </Link>
          <Link
            href="/coach/repair"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Repair
          </Link>
        </div>
      </div>
    </div>
  );
}
