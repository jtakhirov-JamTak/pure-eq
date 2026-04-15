// Pure EQ domain — replace in fork.
export default function InsightsPage() {
  // TODO: Fetch user profile from Supabase
  // For now, show the empty state per product spec Section 17.5

  return (
    <div className="px-5 pt-8">
      <h2 className="text-xl font-bold text-zinc-900">Insights</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Your patterns, profile, and long-term learning.
      </p>

      {/* Communication Profile — always available after onboarding */}
      <div className="mt-8 rounded-xl border border-zinc-200 p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Your Communication Profile
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Complete onboarding to see your profile here.
        </p>
      </div>

      {/* Recurring Blind Spots — below threshold */}
      <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-700">
          Recurring Blind Spots
        </p>
        <p className="mt-1 text-sm text-zinc-400">Not enough data yet</p>
        <p className="mt-2 text-xs text-zinc-400">
          Insights are generated from your Coach and Tools entries over time.
          The more you use the app, the more patterns we can identify.
        </p>
      </div>

      {/* How You Tend to Land — below threshold */}
      <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-700">
          How You Tend to Land
        </p>
        <p className="mt-1 text-sm text-zinc-400">Not enough data yet</p>
      </div>

      {/* People / Relationship Memory — below threshold */}
      <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-700">
          People &amp; Relationships
        </p>
        <p className="mt-1 text-sm text-zinc-400">Not enough data yet</p>
      </div>
    </div>
  );
}
