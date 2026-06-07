import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { getOpenLoops } from "@/lib/coach/open-loops";
import { getActivityStats } from "@/lib/coach/activity-stats";
import { OpenConversations } from "@/components/conversations/open-conversations";
import { ActivityDashboard } from "@/components/conversations/activity-dashboard";

// Conversations tab landing. Not a wall of conversations — three ways in:
//   1. Pick up where you left off (most recent open loop) + open conversations
//   2. See all conversations (full history)
//   3. Your activity dashboard (usage over time)
export default async function ConversationsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [openLoops, stats] = await Promise.all([
    getOpenLoops(user.id, 5),
    getActivityStats(user.id),
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

      {openLoops.length > 0 ? (
        <OpenConversations loops={openLoops} />
      ) : (
        <Card className="p-5">
          <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
            Nothing in progress right now. When you prepare for a conversation,
            it shows up here so you can review how it went.
          </p>
          <Link
            href="/coach/prepare"
            className="mt-3 inline-flex min-h-11 items-center text-[13px] font-bold text-accent-ink active:opacity-70"
          >
            Prepare for a conversation →
          </Link>
        </Card>
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

      {/* Your activity dashboard */}
      <ActivityDashboard stats={stats} />
    </div>
  );
}
