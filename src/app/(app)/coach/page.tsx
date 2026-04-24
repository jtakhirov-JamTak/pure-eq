import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { readFirstName } from "@/lib/user-metadata";

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

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="coach-hub" />

      {/* Headline */}
      <div className="mb-6 pt-2">
        <h1
          className="font-display text-[28px] leading-[1.1] break-words text-ink sm:text-[34px] sm:leading-[1.08]"
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

      {/* Before You Send — hero */}
      <Link
        href="/coach/before-send"
        className="relative block min-h-[184px] overflow-hidden rounded-card p-6 shadow-dark transition active:scale-[0.99]"
        style={{
          background: "linear-gradient(160deg, #FFD166 0%, #F39423 100%)",
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink/85">
          ~90 sec · quick check
        </p>
        <h2
          className="mt-3 font-display text-[28px] leading-[1.1] text-ink"
          style={{ letterSpacing: "-0.6px" }}
        >
          You&rsquo;re about to <span className="italic">hit send</span>.
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-[1.45] text-ink/80">
          Paste a draft. See how it will land before you regret it.
        </p>
      </Link>

      {/* Prepare + Review grid */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Link
          href="/coach/prepare"
          className="relative block min-h-[132px] overflow-hidden rounded-card p-4 shadow-dark transition active:scale-[0.99]"
          style={{
            background: "linear-gradient(160deg, #4FB0FF 0%, #2A86E3 100%)",
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
          <p className="mt-1.5 text-[13px] font-medium leading-[1.4] text-white/90">
            A conversation you need to plan.
          </p>
        </Link>

        <Link
          href="/coach/review"
          className="relative block min-h-[132px] overflow-hidden rounded-card p-4 shadow-dark transition active:scale-[0.99]"
          style={{
            background: "linear-gradient(160deg, #3A4A66 0%, #1F2A42 100%)",
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-warm">
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
    </div>
  );
}
