// Pure EQ domain — replace in fork.
import Link from "next/link";

export default function CoachPage() {
  return (
    <div className="px-5 pt-8">
      <h2 className="text-xl font-bold text-zinc-900">Coach</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Prepare for hard conversations, review what happened, and repair when needed.
      </p>

      <div className="mt-8 space-y-4">
        <Link
          href="/coach/prepare"
          className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">Prepare</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Get clear before a hard conversation. Build self-awareness and plan your approach.
          </p>
        </Link>

        <Link
          href="/coach/review"
          className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">Review</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Reflect on what happened. Understand your patterns and see what you may have missed.
          </p>
        </Link>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 opacity-60">
          <h3 className="text-base font-semibold text-zinc-400">Repair</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Coming soon. Attempt repair after something landed badly.
          </p>
        </div>
      </div>
    </div>
  );
}
