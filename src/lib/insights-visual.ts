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
    bg: "bg-surface",
    badge: "bg-amber-100 text-amber-800",
    badgeText: "Watch",
    evolutionUpColor: "text-amber-600",
    evolutionDownColor: "text-emerald-600",
  },
  positive: {
    border: "border-l-emerald-500",
    bg: "bg-surface",
    badge: "bg-emerald-100 text-emerald-800",
    badgeText: "Strength",
    evolutionUpColor: "text-emerald-600",
    evolutionDownColor: "text-ink-muted",
  },
  neutral: {
    border: "border-l-brand",
    bg: "bg-surface",
    badge: "bg-surface-tint text-brand-deep",
    badgeText: "Trigger",
    evolutionUpColor: "text-brand-deep",
    evolutionDownColor: "text-ink-muted",
  },
};

// Per-field typography for the insight-box five-field layout. pattern is the
// lead; tryInstead gets visual emphasis via font-semibold + accent left border
// (border color resolved at render site from direction via ACCENT_BORDER).
export const FIELD_TYPOGRAPHY = {
  pattern: "font-display text-[20px] leading-[1.2] text-ink",
  showsUpWhen: "text-[13px] font-medium text-ink-soft",
  eqImpact: "text-[13px] font-medium text-ink-soft",
  tryInstead: "text-[13px] font-semibold text-ink",
  // Use ink-soft not ink-muted: ink-muted (#8AA0C2) on white at 11px is ~3.4:1,
  // fails WCAG AA for body text. ink-soft (#4A5E82) hits ~7:1.
  proof: "text-[11px] font-semibold uppercase tracking-[0.8px] text-ink-soft",
} as const;

// Accent border used inside the "Try instead" block. One shade lighter than
// DIRECTION_STYLES.border (which is the left edge of the full card) so the
// inner accent reads as a sub-emphasis rather than a second hard edge.
export const ACCENT_BORDER: Record<TagDirection, string> = {
  negative: "border-amber-400",
  positive: "border-emerald-400",
  neutral: "border-brand",
};
