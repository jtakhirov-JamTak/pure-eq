// Pure EQ domain — replace in fork.
"use client";

import { useRouter } from "next/navigation";

export default function ToolsPage() {
  const router = useRouter();

  return (
    <div className="px-5 pt-8 pb-20">
      <h2 className="text-xl font-bold text-zinc-900">Tools</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Use these when you need help in the moment.
      </p>

      <div className="mt-8 space-y-4">
        <button
          onClick={() => router.push("/tools/overwhelmed")}
          className="flex w-full flex-col items-start rounded-xl border border-zinc-200 p-5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            I&apos;m Overwhelmed
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            A fast nervous-system reset. Calm your body and reduce the
            grip of intense emotion.
          </p>
          <span className="mt-3 text-xs text-zinc-400">
            ~4 min guided exercise
          </span>
        </button>

        <button
          onClick={() => router.push("/tools/triggered")}
          className="flex w-full flex-col items-start rounded-xl border border-zinc-200 p-5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            I&apos;m Triggered
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Log a trigger in real time. Understand your pattern and see
            the situation more clearly.
          </p>
          <span className="mt-3 text-xs text-zinc-400">
            7-step guided reflection
          </span>
        </button>
      </div>
    </div>
  );
}
