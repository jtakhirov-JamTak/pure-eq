import { getAuthUser } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { getPersonHistory } from "@/lib/coach/person-history";
import type { PersonMoment } from "@/lib/coach/person-history";

// Person history — the relationship-centric view. Every conversation with
// this person (open AND closed, each tapping into the existing conversation
// detail) plus their linked regulation moments and draft checks. Reached from
// the "People" section on the Conversations tab (the single entry point —
// founder choice 2026-06-12).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOMAIN_LABELS: Record<string, string> = {
  partner: "Partner",
  friend: "Friend",
  family: "Family",
  manager: "Manager",
  direct_report: "Direct report",
  coworker: "Coworker",
  client: "Client",
  other: "Other",
};

const MOMENT_LABELS: Record<PersonMoment["recordType"], string> = {
  trigger_log: "Triggered",
  overwhelmed: "Overwhelmed",
  before_you_send: "Before-send check",
};

// Worsened gets the legible warm-red from the Threads chip lesson; open gets
// accent so "still live" reads at a glance; everything else stays quiet.
function statusClass(status: string): string {
  if (status === "worsened") return "text-[#ec9a8f]";
  if (status === "open" || status === "stabilizing") return "text-accent-ink";
  return "text-ink-soft";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PersonHistoryPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  if (!UUID_RE.test(personId)) notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const history = await getPersonHistory(user.id, personId);
  if (!history) notFound();

  const { person, stats, conversations, moments } = history;

  return (
    <div className="relative min-h-full px-5 pb-28 pt-8">
      <StormBackground />

      <div className="flex items-center justify-between">
        <Link
          href="/conversations"
          className="rounded-pill border border-hairline bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
        >
          Back
        </Link>
      </div>

      {/* Relationship header */}
      <div className="mt-4">
        <Kicker className="text-accent-ink">
          {DOMAIN_LABELS[person.domain] ?? person.domain}
        </Kicker>
        <h1
          className="mt-1.5 font-display text-[28px] font-medium leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.7px" }}
        >
          {person.name}
        </h1>
        <p className="mt-2 text-[12px] font-medium text-ink-soft">
          Tracking since {formatDate(person.createdAt)}
        </p>
      </div>

      {/* Stats header */}
      <Card className="mt-4 p-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[24px] font-medium leading-none text-ink">
            {stats.total}
          </span>
          <span className="text-[13px] font-medium text-ink-soft">
            conversation{stats.total === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-accent"
            />
            <span className="font-bold text-ink">{stats.open}</span> open
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-positive"
            />
            <span className="font-bold text-ink">{stats.resolved}</span>{" "}
            resolved
          </span>
        </div>
      </Card>

      {/* Every conversation with this person — open and closed. */}
      <div className="mt-6">
        <Kicker as="h2">Conversations</Kicker>
        {conversations.length === 0 ? (
          <Card className="mt-2.5 p-5">
            <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
              No conversations with {person.name} yet. When you prepare for or
              review one, the whole history shows up here.
            </p>
            <Link
              href="/coach/prepare"
              className="mt-3 inline-flex min-h-11 items-center text-[13px] font-bold text-accent-ink active:opacity-70"
            >
              Prepare for a conversation →
            </Link>
          </Card>
        ) : (
          <div className="mt-2.5 space-y-2">
            {conversations.map((c) => (
              <Link
                key={c.threadId}
                href={`/conversations/${c.threadId}`}
                className="block rounded-card border border-hairline bg-surface p-4 transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex-1 text-[11px] font-bold uppercase tracking-[0.5px] ${statusClass(c.status)}`}
                  >
                    {c.status}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-ink-soft">
                    {formatDate(c.lastActivityAt)}
                  </span>
                </div>
                {c.topic && (
                  <p className="mt-1.5 truncate text-[14px] font-semibold text-ink">
                    {c.topic}
                  </p>
                )}
                {c.aiHeadline && (
                  <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-[1.45] text-ink-soft">
                    {c.aiHeadline}
                  </p>
                )}
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-accent-ink">
                  View conversation <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Regulation moments + draft checks linked to this person. Renders
          only when any exist — most persons won't have these (silence over
          empty sections). */}
      {moments.length > 0 && (
        <div className="mt-6">
          <Kicker as="h2">In-the-moment entries</Kicker>
          <ul className="mt-2.5 divide-y divide-hairline rounded-card border border-hairline bg-surface px-4">
            {moments.map((m, i) => (
              <li
                key={`${m.recordType}-${m.createdAt}-${i}`}
                className="flex min-h-11 items-center justify-between gap-3 py-3"
              >
                <span className="text-[13px] font-semibold text-ink">
                  {MOMENT_LABELS[m.recordType]}
                </span>
                <span className="shrink-0 text-[12px] font-medium text-ink-soft">
                  {formatDate(m.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
