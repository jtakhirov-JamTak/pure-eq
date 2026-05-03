import Link from "next/link";
import { SkyBackground } from "@/components/brand/SkyBackground";

export function ToolsHubLocked() {
  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="tools-hub" />

      <h1
        className="mt-2 font-display text-[30px] leading-[1.1] text-ink"
        style={{ letterSpacing: "-0.8px" }}
      >
        Tools
      </h1>

      <div className="mt-5 rounded-card bg-surface p-5 shadow-card">
        <span className="inline-block rounded-pill bg-warm-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.6px] text-ink">
          Locked
        </span>
        <p className="mt-3 text-[14px] font-medium leading-[1.5] text-ink-soft">
          Overwhelmed and Triggered are free during your first 7 days after
          onboarding.
        </p>
        <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
          After day 7, Tools require a subscription.
        </p>
        <Link
          href="/paywall"
          className="mt-5 flex h-12 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Subscribe to keep using Tools
        </Link>
      </div>
    </div>
  );
}
