"use client";

export const BODY_REGIONS = [
  "Chest",
  "Throat",
  "Stomach",
  "Head",
  "Shoulders",
] as const;

export type BodyRegion = (typeof BODY_REGIONS)[number];

type SinglePoint = { kind: "single"; cx: number; cy: number; r: number; haloR?: number };
type DoublePoint = {
  kind: "double";
  points: [{ cx: number; cy: number; r: number }, { cx: number; cy: number; r: number }];
};

type Hotspot = (SinglePoint | DoublePoint) & {
  tone: "warm" | "brand";
};

const HOTSPOTS: Record<BodyRegion, Hotspot> = {
  Chest: { kind: "single", cx: 65, cy: 78, r: 16, haloR: 22, tone: "warm" },
  Throat: { kind: "single", cx: 65, cy: 48, r: 8, tone: "brand" },
  Stomach: { kind: "single", cx: 65, cy: 105, r: 12, haloR: 18, tone: "brand" },
  Head: { kind: "single", cx: 65, cy: 26, r: 10, haloR: 14, tone: "warm" },
  Shoulders: {
    kind: "double",
    points: [
      { cx: 42, cy: 58, r: 7 },
      { cx: 88, cy: 58, r: 7 },
    ],
    tone: "brand",
  },
};

type Props = {
  selected: BodyRegion | null;
  onChange: (next: BodyRegion | null) => void;
};

export function BodySilhouette({ selected, onChange }: Props) {
  return (
    <div className="flex rounded-card bg-surface p-5 shadow-card">
      <svg
        width="130"
        height="220"
        viewBox="0 0 130 220"
        className="shrink-0"
        aria-hidden
      >
        <path
          d="M65 8 c10 0 16 8 16 18 c0 10 -6 18 -16 18 c-10 0 -16 -8 -16 -18 c0 -10 6 -18 16 -18 z"
          fill="var(--color-surface-tint)"
        />
        <path
          d="M40 50 q25 -8 50 0 l8 70 q-33 10 -66 0 z"
          fill="var(--color-surface-tint)"
        />
        <rect
          x="45"
          y="118"
          width="40"
          height="90"
          rx="12"
          fill="var(--color-surface-tint)"
        />
        {selected && (() => {
          const h = HOTSPOTS[selected];
          const color =
            h.tone === "warm" ? "var(--color-warm)" : "var(--color-brand)";
          if (h.kind === "single") {
            return (
              <g>
                {h.haloR && (
                  <circle cx={h.cx} cy={h.cy} r={h.haloR} fill={color} opacity={0.25} />
                )}
                <circle cx={h.cx} cy={h.cy} r={h.r} fill={color} opacity={0.85} />
              </g>
            );
          }
          return (
            <g>
              {h.points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.cx} cy={p.cy} r={p.r + 5} fill={color} opacity={0.25} />
                  <circle cx={p.cx} cy={p.cy} r={p.r} fill={color} opacity={0.85} />
                </g>
              ))}
            </g>
          );
        })()}
      </svg>
      <div className="flex flex-1 flex-col justify-center pl-3.5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.8px] text-ink-soft">
          Tap where
        </p>
        {BODY_REGIONS.map((region) => {
          const on = selected === region;
          const tone = HOTSPOTS[region].tone;
          const dotColor = on
            ? tone === "warm"
              ? "var(--color-warm)"
              : "var(--color-brand)"
            : "var(--color-hair)";
          return (
            <button
              key={region}
              type="button"
              onClick={() => onChange(on ? null : region)}
              className={`flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] transition ${
                on
                  ? "font-bold text-ink"
                  : "font-medium text-ink-soft active:opacity-70"
              }`}
              style={
                on
                  ? {
                      backgroundColor: `color-mix(in oklab, ${tone === "warm" ? "var(--color-warm)" : "var(--color-brand)"} 14%, transparent)`,
                    }
                  : undefined
              }
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: dotColor }}
              />
              {region}
            </button>
          );
        })}
      </div>
    </div>
  );
}
