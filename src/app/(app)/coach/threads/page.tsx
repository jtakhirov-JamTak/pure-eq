import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700" },
  stabilizing: { label: "Stabilizing", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700" },
  paused: { label: "Paused", color: "bg-zinc-100 text-zinc-600" },
  worsened: { label: "Worsened", color: "bg-red-100 text-red-700" },
  ended: { label: "Ended", color: "bg-zinc-100 text-zinc-500" },
};

export default async function ThreadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [threadsRes, personsRes] = await Promise.all([
    supabase
      .from("conversation_threads")
      .select("thread_id, title, status, person_id, last_activity_at, started_at")
      .eq("user_id", user.id)
      .order("last_activity_at", { ascending: false })
      .limit(50),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(100),
  ]);

  const threads = threadsRes.data ?? [];
  const personMap = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );

  function formatRelativeDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="px-5 pb-28 pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Conversations</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Your ongoing conversation threads.
          </p>
        </div>
        <Link
          href="/coach"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          Back
        </Link>
      </div>

      {threads.length === 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm text-zinc-600">
            No conversation threads yet. Threads are created automatically when
            you start a Prepare session about a specific person.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {threads.map((thread) => {
            const personName = thread.person_id
              ? personMap.get(thread.person_id) ?? "Someone"
              : "General";
            const statusInfo = STATUS_LABELS[thread.status] ?? STATUS_LABELS.open;

            return (
              <Link
                key={thread.thread_id}
                href={`/coach/threads/${thread.thread_id}`}
                className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900">
                      {personName}
                    </p>
                    {thread.title && (
                      <p className="mt-0.5 truncate text-sm text-zinc-500">
                        {thread.title}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Last activity: {formatRelativeDate(thread.last_activity_at)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
