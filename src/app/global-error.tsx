"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong</title>
      </head>
      <body className="bg-white">
        <div className="flex min-h-dvh flex-col items-center justify-center px-5">
          <p className="text-6xl font-bold text-zinc-200">!</p>
          <p className="mt-4 text-base font-medium text-zinc-700">
            Something went wrong
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            We&apos;ve been notified. Try again in a moment.
          </p>
          <button
            onClick={reset}
            className="mt-6 flex h-11 items-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white"
          >
            Try again
          </button>
          <a
            href="/coach"
            className="mt-3 flex h-11 items-center px-4 text-sm text-zinc-500"
          >
            Back to Coach
          </a>
        </div>
      </body>
    </html>
  );
}
