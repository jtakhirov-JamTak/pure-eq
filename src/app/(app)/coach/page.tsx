import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { captureServerRead } from "@/lib/read-capture";

function firstNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const prefix = email.split("@")[0] ?? "";
  const chunk = prefix.split(/[._]/)[0] ?? "";
  if (!chunk) return "";
  return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
}

function readFirstName(
  metadata: Record<string, unknown> | null | undefined,
): string {
  const raw = metadata?.first_name;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return trimmed.slice(0, 50);
}

export default async function CoachPage() {
  const t0 = Date.now();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

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

  if (threadsRes.error) {
    captureServerRead(
      "coach_hub",
      "conversation_threads",
      new Error("conversation_threads_read_failed"),
    );
  }
  if (personsRes.error) {
    captureServerRead(
      "coach_hub",
      "persons",
      new Error("persons_read_failed"),
    );
  }

  const threads = threadsRes.data ?? [];
  const personMap = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );
  const firstName =
    readFirstName(user.user_metadata) || firstNameFromEmail(user.email);
  const greeting = firstName ? `Hi, ${firstName}.` : "Hi there.";

  console.log(`[perf] coach hub ${Date.now() - t0}ms threads=${threads.length}`);

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="coach-hub" />

      {/* Headline */}
      <div className="mb-6 pt-2">
        <h1
          className="font-display text-[34px] leading-[1.08] text-ink"
          style={{ letterSpacing: "-0.9px" }}
        >
          {greeting}
          <br />
          <span className="italic">Blue Skies ahead.</span>
        </h1>
        <p className="mt-2 text-[15px] font-medium leading-[1.5] text-ink-soft">
          Prepare, Review, or Repair a conversation.
        </p>
      </div>

      {/* Prepare card — primary */}
      <Link
        href="/coach/prepare"
        className="relative block rounded-card bg-surface p-5 shadow-card transition active:scale-[0.99]"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-pill bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-white">
            Prepare
          </span>
          <span className="text-[11px] font-semibold text-ink-muted">
            · 9 steps
          </span>
        </div>
        <div
          className="mb-1.5 font-display text-[26px] leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          A conversation is <span className="italic">coming up</span>.
        </div>
        <p className="text-[14px] font-medium leading-[1.45] text-ink-soft">
          Get clear on what you want, and how to land it.
        </p>
      </Link>

      {/* Review + Repair grid */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Link
          href="/coach/review"
          className="relative block overflow-hidden rounded-card-sm bg-surface p-4 shadow-soft transition active:scale-[0.98] min-h-[108px]"
        >
          <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-ink">
            Review
          </span>
          <div
            className="mt-2 font-display text-[20px] italic leading-[1.2] text-ink"
            style={{ letterSpacing: "-0.4px" }}
          >
            Reflect
          </div>
          <p className="mt-1 text-[12px] font-medium leading-[1.4] text-ink-soft">
            A conversation just happened.
          </p>
        </Link>

        <Link
          href="/coach/repair"
          className="relative block overflow-hidden rounded-card-sm bg-surface p-4 shadow-soft transition active:scale-[0.98] min-h-[108px]"
        >
          <span className="inline-block rounded-pill bg-surface-tint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-ink">
            Repair
          </span>
          <div
            className="mt-2 font-display text-[20px] italic leading-[1.2] text-ink"
            style={{ letterSpacing: "-0.4px" }}
          >
            Mend
          </div>
          <p className="mt-1 text-[12px] font-medium leading-[1.4] text-ink-soft">
            Something went sideways.
          </p>
        </Link>
      </div>

      {/* Active conversations — only if threads exist */}
      {threads.length > 0 && (
        <div className="mt-4 rounded-card-xs bg-surface p-4 shadow-soft">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
              Active conversations
            </p>
            <Link
              href="/coach/threads"
              className="text-[13px] font-semibold text-brand active:opacity-70"
            >
              See all
            </Link>
          </div>
          <ul className="divide-y divide-hair">
            {threads.slice(0, 2).map((thread) => {
              const personName = thread.person_id
                ? (personMap.get(thread.person_id) ?? "Someone")
                : "General";
              return (
                <li key={thread.thread_id}>
                  <Link
                    href={`/coach/threads/${thread.thread_id}`}
                    className="flex items-center gap-3 py-2.5 active:opacity-70"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {personName}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-ink-muted capitalize">
                      {thread.status === "stabilizing" ? "stabilizing" : "open"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
