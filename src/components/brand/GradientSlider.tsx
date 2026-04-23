"use client";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** CSS color for the right end of the gradient. Left end is --color-brand. */
  accentColor: string;
  leftLabel?: string;
  rightLabel?: string;
};

export function GradientSlider({
  value,
  onChange,
  min = 1,
  max = 10,
  accentColor,
  leftLabel = "slightly",
  rightLabel = "very",
}: Props) {
  const safeValue = Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : min;
  const pct = max === min ? 0 : ((safeValue - min) / (max - min)) * 100;

  return (
    <div className="rounded-card-sm bg-surface p-5 shadow-card">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.8px] text-ink-soft">
        Intensity
      </p>

      {/* 44px tap strip wraps the 10px visible rail so the input fills a real touch target. */}
      <div className="relative mb-5 h-11 flex items-center">
        <div className="relative h-[10px] w-full">
          <div
            className="absolute inset-0 rounded-[5px]"
            style={{ backgroundColor: "var(--color-surface-tint)" }}
          />
          <div
            className="absolute left-0 top-0 h-full rounded-[5px]"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, var(--color-brand) 0%, ${accentColor} 100%)`,
            }}
          />
          <div
            className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-card"
            style={{
              left: `${pct}%`,
              top: "50%",
              border: `2.5px solid ${accentColor}`,
            }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={safeValue}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          aria-label="Intensity"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          style={{ touchAction: "manipulation" }}
        />
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-ink-soft">
          {leftLabel}
        </span>
        <span
          className="font-display text-[38px] leading-none text-ink tabular-nums"
          style={{ letterSpacing: "-1px" }}
        >
          {safeValue}
          <span className="text-[18px] text-ink-soft"> / {max}</span>
        </span>
        <span
          className="text-[11px] font-bold"
          style={{ color: accentColor }}
        >
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
