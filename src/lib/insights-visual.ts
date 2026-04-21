// Visual system for insight surfaces (PatternCard, PeriodSummaryRow, etc).
// Keep Tailwind class strings as literals (no string interpolation) so JIT
// can statically detect and bundle them.

export type TagDirection = "positive" | "negative" | "neutral";

export const DIRECTION_STYLES: Record<
  TagDirection,
  {
    border: string;
    bg: string;
    badge: string;
    badgeText: string;
    evolutionUpColor: string;
    evolutionDownColor: string;
  }
> = {
  negative: {
    border: "border-l-amber-500",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-800",
    badgeText: "Watch",
    evolutionUpColor: "text-amber-600",
    evolutionDownColor: "text-emerald-600",
  },
  positive: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-800",
    badgeText: "Strength",
    evolutionUpColor: "text-emerald-600",
    evolutionDownColor: "text-zinc-500",
  },
  neutral: {
    border: "border-l-sky-500",
    bg: "bg-sky-50",
    badge: "bg-sky-100 text-sky-800",
    badgeText: "Trigger",
    evolutionUpColor: "text-sky-600",
    evolutionDownColor: "text-zinc-500",
  },
};

// Per-field typography for the insight-box five-field layout. pattern is the
// lead; tryInstead gets visual emphasis via font-medium + accent left border
// (border color resolved at render site from direction via ACCENT_BORDER).
export const FIELD_TYPOGRAPHY = {
  pattern: "text-lg font-semibold text-zinc-900",
  showsUpWhen: "text-sm text-zinc-700",
  eqImpact: "text-sm text-zinc-700",
  tryInstead: "text-sm font-medium text-zinc-900",
  proof: "text-xs text-zinc-600",
} as const;

// Accent border used inside the "Try instead" block. One shade lighter than
// DIRECTION_STYLES.border (which is the left edge of the full card) so the
// inner accent reads as a sub-emphasis rather than a second hard edge.
export const ACCENT_BORDER: Record<TagDirection, string> = {
  negative: "border-amber-400",
  positive: "border-emerald-400",
  neutral: "border-sky-400",
};
