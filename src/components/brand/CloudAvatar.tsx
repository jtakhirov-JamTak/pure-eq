// Non-animated sibling of BreathingCloud. Used on the onboarding result
// screen where the arrival is the payoff — animating would compete.
// Palette matches BreathingCloud (#FFFFFF body + #D6E8F7 ground shadow).

type Mood = "happy" | "neutral";

type Props = {
  size?: number;
  mood?: Mood;
};

export function CloudAvatar({ size = 96, mood = "happy" }: Props) {
  const width = size;
  const height = Math.round(size * (200 / 240));
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 240 200"
        style={{ filter: "drop-shadow(0 14px 22px rgba(14,39,72,0.18))" }}
        aria-hidden
      >
        <circle cx="60" cy="120" r="46" fill="#FFFFFF" />
        <circle cx="108" cy="80" r="60" fill="#FFFFFF" />
        <circle cx="164" cy="90" r="54" fill="#FFFFFF" />
        <circle cx="196" cy="122" r="40" fill="#FFFFFF" />
        <rect x="50" y="120" width="154" height="52" rx="26" fill="#FFFFFF" />
        <ellipse
          cx="126"
          cy="168"
          rx="82"
          ry="9"
          fill="#D6E8F7"
          opacity="0.6"
        />
        <circle cx="100" cy="100" r="5" fill="#0E2748" />
        <circle cx="146" cy="100" r="5" fill="#0E2748" />
        {mood === "happy" ? (
          <path
            d="M 100 122 Q 123 140 146 122"
            stroke="#0E2748"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          <path
            d="M 100 126 L 146 126"
            stroke="#0E2748"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}
