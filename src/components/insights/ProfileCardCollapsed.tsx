"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ProfileType } from "@/types";

interface Props {
  primary: ProfileType;
  secondary: ProfileType | null;
  description: {
    strength: string;
    stress: string;
    willHelpMost: string;
  };
  avatarColorClass: string;
}

export function ProfileCardCollapsed({
  primary,
  secondary,
  description,
  avatarColorClass,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const primaryLabel =
    primary.charAt(0).toUpperCase() + primary.slice(1);
  const secondaryLabel = secondary
    ? secondary.charAt(0).toUpperCase() + secondary.slice(1)
    : null;

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColorClass}`}
        >
          {primary.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Baseline
          </p>
          <p className="text-sm text-zinc-800">
            {primaryLabel}
            {secondaryLabel ? ` with ${secondaryLabel} tendencies` : ""}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-zinc-200 px-4 py-3">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">
                Strength
              </p>
              <p className="mt-0.5 text-sm text-zinc-700">
                {description.strength}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">
                Under stress
              </p>
              <p className="mt-0.5 text-sm text-zinc-700">
                {description.stress}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">
                What will help most
              </p>
              <p className="mt-0.5 text-sm text-zinc-700">
                {description.willHelpMost}
              </p>
            </div>
          </div>
          <Link
            href="/onboarding?retake=1"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Retake Communication Profile
          </Link>
        </div>
      ) : null}
    </div>
  );
}
