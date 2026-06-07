import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { Kicker } from "@/components/ui/kicker";
import ThreadStatusSelector from "./thread-status-selector";
import { DeleteConversationButton } from "./delete-conversation-button";
import { ThreadReviewButton } from "@/components/coach/thread-review-button";
import { getThreadEntries } from "@/lib/coach/conversation-summary";

const MODULE_BADGES: Record<string, { label: string; color: string }> = {
  prepare: { label: "Prepare", color: "bg-accent-soft text-accent-ink" },
  pulse_check: { label: "Pulse Check", color: "bg-accent-soft text-accent-ink" },
  review: { label: "Review", color: "bg-warm-soft text-warm" },
  repair: { label: "Repair", color: "bg-positive/15 text-positive" },
};

export default async function ConversationDetailPage({
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

  // Coins redesign Phase 3: viewing your own thread is free (login-only).
  // Fetch thread (RLS ensures user ownership).
  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("thread_id, title, status, person_id, last_activity_at, started_at")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread) notFound();

  // Fetch person name and the thread timeline (each entry carries the user's
  // input summary AND the coach AI headline — sourced from the derived tables).
  const [personRes, entries] = await Promise.all([
    thread.person_id
      ? supabase
          .from("persons")
          .select("display_name")
          .eq("person_id", thread.person_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getThreadEntries(user.id, threadId),
  ]);

  const personName = personRes.data?.display_name ?? "Someone";

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="relative min-h-full px-5 pb-28 pt-8">
      <StormBackground />

      <div className="flex items-center justify-between">
        <Link
          href="/conversations/all"
          className="rounded-pill border border-hairline bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
        >
          Back
        </Link>
      </div>

      <div className="mt-4">
        <Kicker>Conversation with {personName}</Kicker>
        {thread.title && (
          <h2 className="mt-1.5 truncate text-[18px] font-semibold text-ink">
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

      <p className="mt-4 text-[11px] font-medium text-ink-muted">
        Started {formatDate(thread.started_at)} · Last activity{" "}
        {formatDate(thread.last_activity_at)}
      </p>

      {/* Entry Timeline */}
      <div className="mt-6">
        <Kicker>Timeline</Kicker>

        {entries.length === 0 ? (
          <p className="mt-3 text-[13px] font-medium text-ink-soft">
            No entries linked to this thread yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {entries.map((entry, i) => {
              const badge = MODULE_BADGES[entry.recordType] ?? {
                label: entry.recordType,
                color: "bg-surface-tint text-ink-soft",
              };

              return (
                <div
                  key={`${entry.recordType}-${entry.createdAt}-${i}`}
                  className="rounded-card border border-hairline bg-surface p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[11px] font-medium text-ink-muted">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>

                  {entry.inputSummary && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink-muted">
                        What you wrote
                      </p>
                      <p className="mt-1 text-[13px] font-medium leading-[1.5] text-ink-soft">
                        {entry.inputSummary}
                      </p>
                    </div>
                  )}

                  {entry.aiHeadline && (
                    <div className="mt-3 border-t border-hairline pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-accent-ink">
                        Coach
                      </p>
                      <p className="mt-1 text-[13px] font-medium leading-[1.5] text-ink">
                        {entry.aiHeadline}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-8 space-y-2">
        <Kicker>Add to this thread</Kicker>
        <div className="mt-1 flex gap-2">
          {thread.person_id ? (
            <ThreadReviewButton
              personName={personName}
              personId={thread.person_id}
            />
          ) : (
            <Link
              href="/coach/review"
              className="rounded-pill border border-hairline bg-surface px-4 py-2 text-[13px] font-semibold text-ink active:opacity-80"
            >
              Review
            </Link>
          )}
        </div>
      </div>

      {/* Delete this conversation */}
      <div className="mt-10 border-t border-hairline pt-6">
        <DeleteConversationButton threadId={thread.thread_id} />
      </div>
    </div>
  );
}
