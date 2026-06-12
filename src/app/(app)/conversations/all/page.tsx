import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { getConversationSummaries } from "@/lib/coach/conversation-summary";
import { AllConversationsList } from "@/components/conversations/all-conversations-list";

export default async function AllConversationsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const { summaries: conversations, truncated } = await getConversationSummaries(
    user.id,
  );

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <StormBackground />

      <div className="flex items-start justify-between gap-4 pt-2">
        <div>
          <h1
            className="font-display text-[30px] font-medium leading-[1.1] text-ink"
            style={{ letterSpacing: "-0.8px" }}
          >
            All conversations
          </h1>
          <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink-soft">
            Everything you&apos;ve worked through, newest first.
          </p>
        </div>
        <Link
          href="/conversations"
          className="inline-flex min-h-11 shrink-0 items-center rounded-pill border border-hairline bg-surface px-3.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
        >
          Back
        </Link>
      </div>

      {conversations.length === 0 ? (
        <Card className="mt-6 p-5">
          <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
            No conversations yet. They&apos;re created when you prepare for —
            or pulse-check — a conversation about someone.
          </p>
        </Card>
      ) : (
        <>
          <AllConversationsList conversations={conversations} />
          {truncated && (
            <p className="mt-5 text-center text-[12px] font-medium leading-[1.5] text-ink-soft">
              Showing your 1,000 most recent conversations.
            </p>
          )}
        </>
      )}
    </div>
  );
}
