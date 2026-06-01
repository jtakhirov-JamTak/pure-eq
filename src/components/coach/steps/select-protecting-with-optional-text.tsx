// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Review "what was I protecting?" 9-chip selector with optional one-line
// companion text. Stored as `{ chip, text? }`. Companion text is voluntary
// — schema accepts empty/omitted; consumer drops to null at persistence
// boundary if absent.

"use client";

import { useState } from "react";
import { WHAT_PROTECTING_VALUES } from "@/lib/validation";

type WhatProtecting = (typeof WHAT_PROTECTING_VALUES)[number];

const LABELS: Record<WhatProtecting, string> = {
  status: "Status",
  safety: "Safety",
  image: "Image",
  relationship: "The relationship",
  time: "Time",
  boundaries: "Boundaries",
  being_right: "Being right",
  not_feeling_stupid: "Not feeling stupid",
  other: "Other",
};

export type SelectProtectingValue = {
  chip: string;
  text?: string;
};

type Props = {
  value: SelectProtectingValue | undefined;
  onChange: (next: SelectProtectingValue) => void;
};

export function SelectProtectingWithOptionalText({ value, onChange }: Props) {
  const chip = value?.chip ?? "";
  const text = value?.text ?? "";
  // Companion textarea is revealed once a chip is picked — keeps the
  // initial UI scannable, since most users won't add text.
  const [showText, setShowText] = useState(text.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {WHAT_PROTECTING_VALUES.map((c) => {
          const selected = chip === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange({ chip: c, text });
                setShowText(true);
              }}
              className={`flex min-h-11 items-center rounded-pill px-3.5 py-2 text-[13px] font-semibold transition active:scale-[0.99] ${
                selected
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface-tint text-ink"
              }`}
            >
              {LABELS[c]}
            </button>
          );
        })}
      </div>
      {showText && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
            One line on what that was (optional)
          </p>
          <input
            type="text"
            value={text}
            onChange={(e) => onChange({ chip, text: e.target.value })}
            placeholder="A specific phrase or moment, if you want."
            className="block w-full rounded-card-sm border border-hairline p-3 text-base text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}
    </div>
  );
}
