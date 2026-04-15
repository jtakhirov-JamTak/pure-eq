import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          Pure EQ
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Handle hard conversations better.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Build self-awareness, emotional regulation, and empathic accuracy
          — before, during, and after difficult interactions.
        </p>

        <Link
          href="/onboarding"
          className="mt-10 inline-flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Get your communication profile in 90 seconds
        </Link>

        <p className="mt-6 text-xs text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-600 underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
