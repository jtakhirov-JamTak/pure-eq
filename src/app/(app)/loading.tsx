// Shown instantly on navigation into any (app) route while the server
// renders the real page. Matches the common hub/list layout in this
// app: title + subtitle + card stack. Next.js finds this via the
// nearest-loading.tsx rule, so /coach, /insights, /history, and the
// nested Coach routes all share it.
export default function Loading() {
  return (
    <div
      className="px-5 pb-28 pt-8"
      aria-label="Loading"
      aria-busy="true"
    >
      <div className="animate-pulse">
        <div className="h-6 w-32 rounded-md bg-zinc-200" />
        <div className="mt-2 h-4 w-64 rounded-md bg-zinc-100" />

        <div className="mt-8 space-y-4">
          <div className="h-24 rounded-xl border border-zinc-100 bg-zinc-50" />
          <div className="h-24 rounded-xl border border-zinc-100 bg-zinc-50" />
          <div className="h-24 rounded-xl border border-zinc-100 bg-zinc-50" />
        </div>
      </div>
    </div>
  );
}
