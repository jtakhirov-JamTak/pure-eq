import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CoachPage() {
  const t0 = Date.now();
  // Same request-cached getAuthUser as the (app) layout — zero extra
  // Supabase Auth round trip here.
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Fetch recent active threads (limit 3 for the hub).
  const [threadsRes, personsRes] = await Promise.all([
    supabase
      .from("conversation_threads")
      .select("thread_id, title, status, person_id, last_activity_at")
      .eq("user_id", user.id)
      .in("status", ["open", "stabilizing"])
      .order("last_activity_at", { ascending: false })
      .limit(3),
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

  console.log(`[perf] coach hub ${Date.now() - t0}ms threads=${threads.length}`);

  function formatRelativeDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="px-5 pb-28 pt-8">
      <h2 className="text-xl font-bold text-zinc-900">Coach</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Prepare for hard conversations, review what happened, and repair when
        needed.
      </p>

      <div className="mt-8 space-y-4">
        <Link
          href="/coach/prepare"
          className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">Prepare</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Get clear before a hard conversation. Build self-awareness and plan
            your approach.
          </p>
        </Link>

        <Link
          href="/coach/review"
          className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">Review</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Reflect on what happened. Understand your patterns and see what you
            may have missed.
          </p>
        </Link>

        <Link
          href="/coach/repair"
          className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">Repair</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Attempt repair after something landed badly or a rupture needs
            attention.
          </p>
        </Link>
      </div>

      {/* Active Threads */}
      {threads.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-700">
              Active Conversations
            </p>
            <Link
              href="/coach/threads"
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              See all
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {threads.map((thread) => {
              const personName = thread.person_id
                ? personMap.get(thread.person_id) ?? "Someone"
                : "General";

              return (
                <Link
                  key={thread.thread_id}
                  href={`/coach/threads/${thread.thread_id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 transition-colors hover:border-zinc-200 hover:bg-white"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800">
                      {personName}
                    </p>
                    {thread.title && (
                      <p className="truncate text-xs text-zinc-500">
                        {thread.title}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatRelativeDate(thread.last_activity_at)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
