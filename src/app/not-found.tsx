import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5">
      <p className="text-6xl font-bold text-zinc-200">404</p>
      <p className="mt-4 text-base font-medium text-zinc-700">
        Page not found
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        The page you're looking for doesn't exist.
      </p>
      <Link
        href="/coach"
        className="mt-6 flex h-11 items-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white"
      >
        Back to Coach
      </Link>
    </div>
  );
}
