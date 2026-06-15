import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { readFirstName } from "@/lib/user-metadata";
import { getConversationsOverview } from "@/lib/coach/open-loops";
import { OpenConversations } from "@/components/conversations/open-conversations";

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

  // Open-loop resume cards on Home (not on Convos): the reminder that you
  // prepared for a conversation. Rendered at the BOTTOM of Home (founder
  // direction 2026-06-15) so the entry points lead and the follow-ups trail.
  const { openLoops } = await getConversationsOverview(user.id, 3);

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
          <h3
            className="mt-3 font-display text-[20px] leading-[1.1] text-white"
            style={{ letterSpacing: "-0.4px" }}
          >
            Coming <span className="italic">up</span>.
          </h3>
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
          <h3
            className="mt-3 font-display text-[20px] leading-[1.1] text-white"
            style={{ letterSpacing: "-0.4px" }}
          >
            Something <span className="italic">feels off</span>.
          </h3>
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
          <h3
            className="mt-3 font-display text-[20px] leading-[1.1] text-white"
            style={{ letterSpacing: "-0.4px" }}
          >
            Just <span className="italic">happened</span>.
          </h3>
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

      {/* Pick up where you left off — at the bottom. Renders nothing when there
          are no open loops. */}
      {openLoops.length > 0 && (
        <div className="mt-8">
          <OpenConversations loops={openLoops} />
        </div>
      )}
    </div>
  );
}
