// Shown instantly on navigation into /tools, /tools/overwhelmed, and
// /tools/triggered while the server renders the real page. Tools lives
// outside (app) and has its own layout, so it needs its own loading.tsx.
export default function Loading() {
  return (
    <div
      className="px-5 pb-28 pt-8"
      aria-label="Loading"
      aria-busy="true"
    >
      <div className="animate-pulse">
        <div className="h-6 w-24 rounded-md bg-zinc-200" />
        <div className="mt-2 h-4 w-56 rounded-md bg-zinc-100" />

        <div className="mt-8 space-y-4">
          <div className="h-28 rounded-xl border border-zinc-100 bg-zinc-50" />
          <div className="h-28 rounded-xl border border-zinc-100 bg-zinc-50" />
        </div>
      </div>
    </div>
  );
}
