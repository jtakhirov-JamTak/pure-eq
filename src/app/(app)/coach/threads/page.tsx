import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { captureServerRead } from "@/lib/read-capture";

// Storm status chips — soft-tinted fill + status-colored ink on the dark
// surface (replaces the old light pastels, which were invisible on navy).
const STATUS_LABELS: Record<
  string,
  { label: string; className: string }
> = {
  open: { label: "Open", className: "bg-accent-soft text-accent-ink" },
  stabilizing: {
    label: "Stabilizing",
    className: "bg-warm-soft text-warm",
  },
  resolved: {
    label: "Resolved",
    className: "bg-positive/15 text-positive",
  },
  paused: { label: "Paused", className: "bg-surface-tint text-ink-soft" },
  worsened: {
    label: "Worsened",
    className: "bg-danger/15 text-danger",
  },
  ended: { label: "Ended", className: "bg-surface-tint text-ink-soft" },
};

export default async function ThreadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Coins redesign Phase 3: viewing your own threads is free (login-only).
  const [threadsRes, personsRes] = await Promise.all([
    supabase
      .from("conversation_threads")
      .select(
        "thread_id, title, status, person_id, last_activity_at, started_at",
      )
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

  if (threadsRes.error) {
    captureServerRead(
      "threads",
      "conversation_threads",
      new Error("conversation_threads_read_failed"),
    );
  }
  if (personsRes.error) {
    captureServerRead(
      "threads",
      "persons",
      new Error("persons_read_failed"),
    );
  }

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
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <StormBackground />

      <div className="flex items-start justify-between gap-4 pt-2">
        <div>
          <h1
            className="font-display text-[30px] font-medium leading-[1.1] text-ink"
            style={{ letterSpacing: "-0.8px" }}
          >
            Conversations
          </h1>
          <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Your ongoing conversation threads.
          </p>
        </div>
        <Link
          href="/coach"
          className="shrink-0 rounded-pill border border-hairline bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
        >
          Back
        </Link>
      </div>

      {threads.length === 0 ? (
        <Card className="mt-6 p-5">
          <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
            No conversation threads yet. Threads are created automatically when
            you start a Prepare session about a specific person.
          </p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {threads.map((thread) => {
            const personName = thread.person_id
              ? (personMap.get(thread.person_id) ?? "Someone")
              : "General";
            const statusInfo =
              STATUS_LABELS[thread.status] ?? STATUS_LABELS.open;

            return (
              <li key={thread.thread_id}>
                <Link
                  href={`/coach/threads/${thread.thread_id}`}
                  className="block rounded-card border border-hairline bg-surface p-4 transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-ink">
                        {personName}
                      </p>
                      {thread.title && (
                        <p className="mt-0.5 truncate text-[13px] font-medium text-ink-soft">
                          {thread.title}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${statusInfo.className}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-ink-muted">
                    {formatRelativeDate(thread.last_activity_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
