import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { getConversationSummaries } from "@/lib/coach/conversation-summary";

// Origin chips: how the conversation started. "prepare" = a conversation you
// planned; "pulse_check" = "something felt off" early read.
const ORIGIN_LABELS: Record<string, { label: string; className: string }> = {
  prepare: { label: "Prepared", className: "bg-accent-soft text-accent-ink" },
  pulse_check: {
    label: "Something felt off",
    className: "bg-accent-soft text-accent-ink",
  },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-accent-soft text-accent-ink" },
  stabilizing: { label: "Stabilizing", className: "bg-warm-soft text-warm" },
  resolved: { label: "Resolved", className: "bg-positive/15 text-positive" },
  paused: { label: "Paused", className: "bg-surface-tint text-ink-soft" },
  worsened: { label: "Worsened", className: "bg-danger/15 text-[#ec9a8f]" },
  ended: { label: "Ended", className: "bg-surface-tint text-ink-soft" },
};

export default async function AllConversationsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const conversations = await getConversationSummaries(user.id);

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
          className="shrink-0 rounded-pill border border-hairline bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
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
        <ul className="mt-6 space-y-2.5">
          {conversations.map((c) => {
            const origin = c.origin ? ORIGIN_LABELS[c.origin] : null;
            const status = STATUS_LABELS[c.status] ?? STATUS_LABELS.open;
            return (
              <li key={c.threadId}>
                <Link
                  href={`/conversations/${c.threadId}`}
                  className="block rounded-card border border-hairline bg-surface p-4 transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                      {c.personName}
                    </p>
                    <span
                      className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {origin && (
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ${origin.className}`}
                      >
                        {origin.label}
                      </span>
                    )}
                    {c.hasReview && (
                      <span className="rounded-pill bg-warm-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-warm">
                        Reviewed
                      </span>
                    )}
                  </div>

                  {c.topic && (
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-[1.45] text-ink">
                      {c.topic}
                    </p>
                  )}
                  {c.aiHeadline && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-[1.45] text-ink-soft">
                      <span className="font-semibold text-accent-ink">
                        Coach:{" "}
                      </span>
                      {c.aiHeadline}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
