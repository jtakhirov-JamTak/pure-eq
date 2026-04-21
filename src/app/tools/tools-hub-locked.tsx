import Link from "next/link";

export function ToolsHubLocked() {
  return (
    <div className="px-5 pt-8 pb-28">
      <h2 className="text-xl font-bold text-zinc-900">Tools</h2>
      <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-sm text-zinc-700">
          Overwhelmed and Triggered are free during your first 7 days after
          onboarding.
        </p>
        <p className="mt-2 text-sm text-zinc-700">
          After day 7, Tools require a subscription.
        </p>
        <Link
          href="/paywall"
          className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white"
        >
          Subscribe to keep using Tools
        </Link>
      </div>
    </div>
  );
}
