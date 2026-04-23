import { CloudScatter } from "./CloudScatter";

// Centralizes the fixed-position gradient + cloud-scatter pattern used on
// nearly every screen. Canonical gradient stops per variant, so "calm"
// pages don't drift to 35/45/50/55% stop positions across files.
//
// Variants:
//  - `coach-hub` — dramatic sky→brand; used on the Coach landing page
//  - `calm`      — sky-hi → surface-tint → white; most content pages
//  - `warm`      — sky-hi → warm peach → white; Review flow
//  - `tools-hub` — sky-hi → sky-mid; Tools hub + locked variant
//  - `stormy`    — sky-mid → sky-hi → white; Overwhelmed

export type SkyVariant =
  | "coach-hub"
  | "calm"
  | "warm"
  | "tools-hub"
  | "stormy";

const GRADIENTS: Record<SkyVariant, string> = {
  "coach-hub":
    "linear-gradient(180deg, #d6eeff 0%, #a9d9ff 55%, #4fb0ff 100%)",
  calm: "linear-gradient(180deg, #d6eeff 0%, #eef8ff 50%, #ffffff 100%)",
  warm: "linear-gradient(180deg, #d6eeff 0%, #fff1e5 50%, #ffffff 100%)",
  "tools-hub": "linear-gradient(180deg, #d6eeff 0%, #a9d9ff 100%)",
  stormy: "linear-gradient(180deg, #a9d9ff 0%, #d6eeff 50%, #ffffff 100%)",
};

type CloudProps = {
  x: number;
  y: number;
  size: number;
  opacity?: number;
  blur?: number;
};

const CLOUDS: Record<SkyVariant, CloudProps[]> = {
  "coach-hub": [
    { x: -30, y: 90, size: 130, opacity: 0.9 },
    { x: 260, y: 50, size: 90, opacity: 0.85 },
    { x: 60, y: 380, size: 110, opacity: 0.5, blur: 2 },
  ],
  calm: [
    { x: -30, y: 90, size: 110, opacity: 0.7 },
    { x: 270, y: 150, size: 80, opacity: 0.55, blur: 1 },
  ],
  warm: [
    { x: -40, y: 90, size: 130, opacity: 0.85 },
    { x: 270, y: 150, size: 90, opacity: 0.7, blur: 1 },
  ],
  "tools-hub": [
    { x: -40, y: 90, size: 130, opacity: 0.85 },
    { x: 260, y: 140, size: 90, opacity: 0.7 },
    { x: 200, y: 470, size: 110, opacity: 0.55, blur: 1 },
  ],
  stormy: [
    { x: -50, y: 140, size: 160, opacity: 0.8, blur: 0.5 },
    { x: 250, y: 100, size: 100, opacity: 0.7 },
    { x: -40, y: 600, size: 140, opacity: 0.55, blur: 1 },
  ],
};

export function SkyBackground({
  variant = "calm",
}: {
  variant?: SkyVariant;
}) {
  const clouds = CLOUDS[variant];
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: GRADIENTS[variant] }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {clouds.map((c, i) => (
          <CloudScatter key={i} {...c} />
        ))}
      </div>
    </>
  );
}
