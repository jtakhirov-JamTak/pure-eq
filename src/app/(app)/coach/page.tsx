import { getAuthUser, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { readFirstName } from "@/lib/user-metadata";
import { captureServerRead } from "@/lib/read-capture";
import { LoopNudge, type OpenLoop } from "@/components/coach/loop-nudge";

// Open-loop nudges (Phase 2 return loop): conversations the user prepared for
// but hasn't reviewed yet. An open thread (status "open") with a completed
// Prepare entry and NO completed Review entry. Capped at 3, most-recent first.
// Read-only; every query inspects .error (server-component read lesson).
async function getOpenLoops(userId: string): Promise<OpenLoop[]> {
  const supabase = await createClient();
  const threadsRes = await supabase
    .from("conversation_threads")
    .select("thread_id, person_id, last_activity_at")
    .eq("user_id", userId)
    .eq("status", "open")
    .not("person_id", "is", null)
    .order("last_activity_at", { ascending: false })
    .limit(20);
  if (threadsRes.error) {
    captureServerRead(
      "coach_hub",
      "conversation_threads",
      new Error("open_loops_threads_read_failed"),
    );
    return [];
  }
  const openThreads = threadsRes.data ?? [];
  const threadIds = openThreads.map((t) => t.thread_id);
  if (threadIds.length === 0) return [];

  const [recsRes, personsRes] = await Promise.all([
    supabase
      .from("raw_records")
      .select("thread_id, record_type")
      .eq("user_id", userId)
      .in("thread_id", threadIds)
      .in("record_type", ["prepare", "review"])
      .eq("is_complete", true)
      .is("deleted_at", null),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", userId)
      .limit(500),
  ]);
  if (recsRes.error) {
    captureServerRead(
      "coach_hub",
      "raw_records",
      new Error("open_loops_records_read_failed"),
    );
    return [];
  }
  if (personsRes.error) {
    captureServerRead(
      "coach_hub",
      "persons",
      new Error("open_loops_persons_read_failed"),
    );
  }

  const hasPrepare = new Set<string>();
  const hasReview = new Set<string>();
  for (const r of recsRes.data ?? []) {
    if (!r.thread_id) continue;
    if (r.record_type === "prepare") hasPrepare.add(r.thread_id);
    else if (r.record_type === "review") hasReview.add(r.thread_id);
  }
  const nameById = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );

  const loops: OpenLoop[] = [];
  for (const t of openThreads) {
    if (!t.person_id) continue;
    if (hasPrepare.has(t.thread_id) && !hasReview.has(t.thread_id)) {
      loops.push({
        threadId: t.thread_id,
        personId: t.person_id,
        personName: nameById.get(t.person_id) ?? "someone",
      });
      if (loops.length >= 3) break;
    }
  }
  return loops;
}

function firstNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const prefix = email.split("@")[0] ?? "";
  const chunk = prefix.split(/[._]/)[0] ?? "";
  if (!chunk) return "";
  return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
}

export default async function CoachPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const firstName =
    readFirstName(user.user_metadata) || firstNameFromEmail(user.email);
  const greeting = firstName ? `Hi, ${firstName}.` : "Hi there.";

  const openLoops = await getOpenLoops(user.id);

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <StormBackground />

      {/* Headline */}
      <div className="mb-6 pt-2">
        <h1
          className="font-display text-[28px] font-medium leading-[1.1] break-words text-ink sm:text-[34px] sm:leading-[1.08]"
          style={{ letterSpacing: "-0.7px" }}
        >
          {greeting}
          <br />
          <span className="italic">Blue Skies ahead.</span>
        </h1>
        <p className="mt-2 text-[15px] font-medium leading-[1.5] text-ink-soft">
          Prepare for, review, or pressure-check a conversation.
        </p>
      </div>

      {/* Before You Send — hero. Harmonized to Storm: the old yellow/orange
          gradient is recolored to a deep sky->navy so it reads as the hero
          (deeper + larger than the sky Prepare tile) while staying on-palette. */}
      <Link
        href="/coach/before-send"
        className="relative block min-h-[184px] overflow-hidden rounded-card p-6 shadow-dark transition active:scale-[0.99]"
        style={{
          background: "linear-gradient(160deg, #1F6FC4 0%, #16335A 100%)",
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-white">
          ~90 sec · quick check
        </p>
        <h2
          className="mt-3 font-display text-[28px] font-medium leading-[1.1] text-white"
          style={{ letterSpacing: "-0.6px" }}
        >
          You&rsquo;re about to <span className="italic">hit send</span>.
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-[1.45] text-white">
          Paste a draft. See how it will land before you regret it.
        </p>
      </Link>

      {/* "What's going on?" router — the three conversation entry points. */}
      <h2
        className="mb-3 mt-7 font-display text-[20px] font-medium leading-[1.1] text-ink"
        style={{ letterSpacing: "-0.4px" }}
      >
        What&rsquo;s going on?
      </h2>

      {/* Prepare / Pulse Check / Review row */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Link
          href="/coach/prepare"
          className="relative block min-h-[132px] overflow-hidden rounded-card p-4 shadow-dark transition active:scale-[0.99]"
          style={{
            // Deepened from #4FB0FF so white text clears AA (was ~2.3:1).
            background: "linear-gradient(160deg, #2470C0 0%, #163A6B 100%)",
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-white">
            ~3 min · guided
          </p>
          <h2
            className="mt-3 font-display text-[20px] leading-[1.1] text-white"
            style={{ letterSpacing: "-0.4px" }}
          >
            Coming <span className="italic">up</span>.
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.4] text-white">
            A conversation you need to plan.
          </p>
        </Link>

        <Link
          href="/coach/pulse-check"
          className="relative block min-h-[132px] overflow-hidden rounded-card p-4 shadow-dark transition active:scale-[0.99]"
          style={{
            // Deepened from #34C8B0 so white text clears AA (was ~2.1:1).
            background: "linear-gradient(160deg, #0E8276 0%, #0A4F47 100%)",
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-white">
            ~3 min · early read
          </p>
          <h2
            className="mt-3 font-display text-[20px] leading-[1.1] text-white"
            style={{ letterSpacing: "-0.4px" }}
          >
            Something <span className="italic">feels off</span>.
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.4] text-white">
            Pulse Check before you act.
          </p>
        </Link>

        <Link
          href="/coach/review"
          className="relative block min-h-[132px] overflow-hidden rounded-card p-4 shadow-dark transition active:scale-[0.99]"
          style={{
            background: "linear-gradient(160deg, #3A4A66 0%, #1F2A42 100%)",
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#ecc08a]">
            ~4 min · reflect
          </p>
          <h2
            className="mt-3 font-display text-[20px] leading-[1.1] text-white"
            style={{ letterSpacing: "-0.4px" }}
          >
            Just <span className="italic">happened</span>.
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.4] text-white/90">
            Look at how it landed.
          </p>
        </Link>
      </div>

      {/* "I'm activated" affordance → Regulate (Tools: Triggered/Overwhelmed).
          Calm bordered card, distinct from the conversation gradient tiles, to
          signal a different mode: self-regulation in the moment. */}
      <Link
        href="/tools"
        className="mt-6 flex items-center justify-between gap-3 rounded-card border border-hairline bg-surface/70 p-4 shadow-dark transition active:scale-[0.99]"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#ecc08a]">
            When emotions hit hard
          </p>
          <h2
            className="mt-1.5 font-display text-[19px] leading-[1.15] text-ink"
            style={{ letterSpacing: "-0.4px" }}
          >
            I&rsquo;m <span className="italic">activated</span> right now.
          </h2>
        </div>
        <span className="shrink-0 text-[20px] text-ink-soft" aria-hidden>
          &rarr;
        </span>
      </Link>

      {/* Open-loop return nudges (Phase 2) — only renders when loops exist. */}
      {openLoops.length > 0 && (
        <div className="mt-6">
          <LoopNudge loops={openLoops} />
        </div>
      )}
    </div>
  );
}
