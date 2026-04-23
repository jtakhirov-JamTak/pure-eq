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
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="rounded-card-sm bg-surface p-5 shadow-card">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.8px] text-ink-muted">
        Intensity
      </p>

      <div className="relative mb-5 h-[10px]">
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
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Intensity"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          style={{ touchAction: "manipulation" }}
        />
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-ink-muted">
          {leftLabel}
        </span>
        <span
          className="font-display text-[38px] leading-none text-ink tabular-nums"
          style={{ letterSpacing: "-1px" }}
        >
          {value}
          <span className="text-[18px] text-ink-muted"> / {max}</span>
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
