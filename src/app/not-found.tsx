import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-5">
      <StormBackground />
      <p className="font-display text-6xl font-medium text-ink-soft">404</p>
      <p className="mt-4 text-base font-semibold text-ink">Page not found</p>
      <p className="mt-1 text-sm font-medium text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/coach"
        className="mt-6 flex h-12 items-center rounded-pill bg-accent px-6 text-sm font-bold text-accent-text shadow-cta active:scale-[0.98]"
      >
        Back to Coach
      </Link>
    </div>
  );
}
