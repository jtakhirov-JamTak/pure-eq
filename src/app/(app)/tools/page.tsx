"use client";

import { useState } from "react";

export default function ToolsPage() {
  const [activeFlow, setActiveFlow] = useState<
    "overwhelmed" | "triggered" | null
  >(null);

  // Overwhelmed flow — not yet implemented, show intro
  if (activeFlow === "overwhelmed") {
    return (
      <div className="px-5 pt-8">
        <h2 className="text-xl font-bold text-zinc-900">I&apos;m Overwhelmed</h2>
        <p className="mt-2 text-sm text-zinc-500">
          This is a short regulation exercise to help you calm your body
          and reduce the grip of intense emotion.
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          You will move through 5 steps: Feel, Label, Validate, Regulate, Move.
        </p>
        <div className="mt-8 rounded-xl border border-zinc-100 bg-zinc-50 p-6 text-center">
          <p className="text-sm text-zinc-400">
            Full flow coming in v0.1.
          </p>
        </div>
        <button
          onClick={() => setActiveFlow(null)}
          className="mt-6 text-sm text-zinc-400 underline"
        >
          Back to Tools
        </button>
      </div>
    );
  }

  if (activeFlow === "triggered") {
    return (
      <div className="px-5 pt-8">
        <h2 className="text-xl font-bold text-zinc-900">I&apos;m Triggered</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Use this tool to log a trigger in real time so you can understand
          your pattern, calm down, and see the situation more clearly.
        </p>
        <div className="mt-8 rounded-xl border border-zinc-100 bg-zinc-50 p-6 text-center">
          <p className="text-sm text-zinc-400">
            Full flow coming in v0.3.
          </p>
        </div>
        <button
          onClick={() => setActiveFlow(null)}
          className="mt-6 text-sm text-zinc-400 underline"
        >
          Back to Tools
        </button>
      </div>
    );
  }

  // Default — tool selection
  return (
    <div className="px-5 pt-8">
      <h2 className="text-xl font-bold text-zinc-900">Tools</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Use these when you need help in the moment.
      </p>

      <div className="mt-8 space-y-4">
        <button
          onClick={() => setActiveFlow("overwhelmed")}
          className="flex w-full flex-col items-start rounded-xl border border-zinc-200 p-5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            I&apos;m Overwhelmed
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            A fast nervous-system reset. Calm your body and reduce the
            grip of intense emotion.
          </p>
        </button>

        <button
          onClick={() => setActiveFlow("triggered")}
          className="flex w-full flex-col items-start rounded-xl border border-zinc-200 p-5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            I&apos;m Triggered
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Log a trigger in real time. Understand your pattern and see
            the situation more clearly.
          </p>
        </button>
      </div>
    </div>
  );
}
