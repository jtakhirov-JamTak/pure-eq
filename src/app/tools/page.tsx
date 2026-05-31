import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SkyBackground } from "@/components/brand/SkyBackground";

export default async function ToolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Coins redesign Phase 3: Tools are free (login-only). The old 7-day Tools
  // free-window + locked-hub card are retired.
  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="tools-hub" />

      <div className="pt-2">
        <span className="inline-block rounded-pill bg-warm px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-ink">
          When storms roll in
        </span>
        <h1
          className="mt-2.5 font-display text-[32px] leading-[1.08] text-ink"
          style={{ letterSpacing: "-1px" }}
        >
          Two tools for when
          <br />
          <span className="italic">emotions hit hard</span>.
        </h1>
      </div>

      <div className="mt-7 space-y-3.5">
        <Link
          href="/tools/overwhelmed"
          className="relative block overflow-hidden rounded-card p-5 text-white shadow-dark transition active:scale-[0.99]"
          style={{
            background:
              "linear-gradient(160deg, #2a86e3 0%, #1A4A8F 100%)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1.5px] opacity-85">
            ~4 min · guided
          </span>
          <div
            className="mt-3 font-display text-[26px] leading-[1.1]"
            style={{ letterSpacing: "-0.6px" }}
          >
            I&apos;m <span className="italic">overwhelmed</span>
          </div>
          <p className="mt-1.5 max-w-[260px] text-[14px] font-medium leading-[1.4] text-white/90">
            Settle the storm. Feel, clear your mind, reset.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["Feel", "Label", "Validate", "Regulate", "Move"].map((s) => (
              <span
                key={s}
                className="rounded-pill bg-white/20 px-2.5 py-1 text-[11px] font-bold tracking-[0.3px]"
              >
                {s}
              </span>
            ))}
          </div>
        </Link>

        <Link
          href="/tools/triggered"
          className="relative block overflow-hidden rounded-card p-5 text-white shadow-dark transition active:scale-[0.99]"
          style={{
            background:
              "linear-gradient(160deg, #3A4A66 0%, #1F2A42 100%)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-warm">
            7 steps · reflect
          </span>
          <div
            className="mt-3 font-display text-[26px] leading-[1.1]"
            style={{ letterSpacing: "-0.6px" }}
          >
            I&apos;m <span className="italic">triggered</span>
          </div>
          <p className="mt-1.5 max-w-[260px] text-[14px] font-medium leading-[1.4] text-white/90">
            Catch the spark. Overcome your trigger in real time.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["Fact", "Story", "Emotion", "Urge", "Outcome"].map((s) => (
              <span
                key={s}
                className="rounded-pill bg-warm/20 px-2.5 py-1 text-[11px] font-bold tracking-[0.3px] text-warm"
              >
                {s}
              </span>
            ))}
          </div>
        </Link>
      </div>
    </div>
  );
}
