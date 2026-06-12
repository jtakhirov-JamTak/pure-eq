import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { getConversationsOverview } from "@/lib/coach/open-loops";
import { getConversationStats } from "@/lib/coach/conversation-stats";
import { OpenConversations } from "@/components/conversations/open-conversations";
import { ConversationStatsCard } from "@/components/conversations/conversation-stats";

// Conversations tab landing. Not a wall of conversations — three ways in:
//   1. Pick up where you left off (most recent open loop) + open conversations
//   2. See all conversations (full history)
//   3. Your activity dashboard (usage over time)
export default async function ConversationsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [{ openLoops, openThreads }, stats] = await Promise.all([
    getConversationsOverview(user.id, 3),
    getConversationStats(user.id),
  ]);

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <StormBackground />

      <div className="mb-5 pt-2">
        <h1
          className="font-display text-[30px] font-medium leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.8px" }}
        >
          Conversations
        </h1>
        <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Pick up where you left off, or look back at how things landed.
        </p>
      </div>

      {/* Conversation stats — at the top: the at-a-glance overview of
          everything below it. (The activity heatmap this replaced now renders
          inside the Monthly Report instead.) */}
      <ConversationStatsCard stats={stats} />

      <div className="mt-6">
        {openLoops.length > 0 ? (
          <OpenConversations loops={openLoops} />
        ) : (
          <Card className="p-5">
            <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
              Nothing in progress right now. When you prepare for a
              conversation, it shows up here so you can review how it went.
            </p>
            <Link
              href="/coach/prepare"
              className="mt-3 inline-flex min-h-11 items-center text-[13px] font-bold text-accent-ink active:opacity-70"
            >
              Prepare for a conversation →
            </Link>
          </Card>
        )}
      </div>

      {/* Open conversations — open/stabilizing threads (browse → detail), as
          distinct from the resume-into-Review loops above. Last 3. */}
      {openThreads.length > 0 && (
        <div className="mt-6">
          <Kicker className="text-accent-ink">Open conversations</Kicker>
          <ul className="mt-2.5 divide-y divide-hairline rounded-card border border-hairline bg-surface px-4">
            {openThreads.map((t) => (
              <li key={t.threadId}>
                <Link
                  href={`/conversations/${t.threadId}`}
                  className="flex min-h-11 items-center gap-3 py-3 active:opacity-70"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {t.personName}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium capitalize text-ink-soft">
                    {t.status === "stabilizing" ? "stabilizing" : "open"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* People — the entry point into per-person relationship history
          (/people/[personId]): every conversation with that person, open and
          closed, plus their linked in-the-moment entries. */}
      {stats.people.length > 0 && (
        <div className="mt-6">
          <Kicker className="text-accent-ink">People</Kicker>
          <ul className="mt-2.5 divide-y divide-hairline rounded-card border border-hairline bg-surface px-4">
            {stats.people.map((p) => (
              <li key={p.personId}>
                <Link
                  href={`/people/${p.personId}`}
                  className="flex min-h-11 items-center gap-3 py-3 active:opacity-70"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-ink-soft">
                    {p.conversations} conversation
                    {p.conversations === 1 ? "" : "s"}
                    {p.open > 0 ? ` · ${p.open} open` : ""}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* See all conversations */}
      <Link
        href="/conversations/all"
        className="mt-4 flex min-h-14 items-center gap-3 rounded-card border border-hairline bg-surface/70 px-4 py-3.5 shadow-dark transition active:bg-surface-tint"
      >
        <span className="flex-1 font-medium text-ink">
          See all conversations
        </span>
        <ChevronRight className="h-4 w-4 text-ink-soft" />
      </Link>
    </div>
  );
}
