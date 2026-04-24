// Static SVG sun for the onboarding result screen. Warm amber matches the
// /coach hub BYS hero gradient (#FFD166). Halo via a duplicate blurred
// circle behind the core; no animation.

type Props = {
  size?: number;
};

export function SunBadge({ size = 80 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="sun-gloss" cx="0.35" cy="0.35">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx="40"
        cy="40"
        r="30"
        fill="#FFD166"
        opacity="0.35"
        style={{ filter: "blur(6px)" }}
      />
      <circle cx="40" cy="40" r="22" fill="#FFD166" />
      <circle cx="40" cy="40" r="22" fill="url(#sun-gloss)" opacity="0.3" />
    </svg>
  );
}
