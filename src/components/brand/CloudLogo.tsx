type Props = {
  size?: number;
  tone?: "white" | "brand";
  hasFace?: boolean;
  className?: string;
};

export function CloudLogo({
  size = 32,
  tone = "white",
  hasFace = false,
  className,
}: Props) {
  const fills =
    tone === "white"
      ? { body: "#FFFFFF", shade: "#E8F1FB", stroke: "#0E2748" }
      : { body: "#4FB0FF", shade: "#2A86E3", stroke: "#FFFFFF" };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <ellipse cx="34" cy="52" rx="22" ry="3" fill="#0E2748" opacity="0.12" />
      <g>
        <circle cx="18" cy="34" r="12" fill={fills.body} />
        <circle cx="30" cy="26" r="14" fill={fills.body} />
        <circle cx="44" cy="30" r="12" fill={fills.body} />
        <circle cx="50" cy="38" r="9" fill={fills.body} />
        <rect x="14" y="34" width="40" height="12" rx="6" fill={fills.body} />
        <ellipse
          cx="32"
          cy="44"
          rx="22"
          ry="4"
          fill={fills.shade}
          opacity="0.6"
        />
        <circle cx="22" cy="28" r="3" fill="#FFFFFF" opacity="0.9" />
      </g>
      {hasFace && (
        <g fill={fills.stroke}>
          <circle cx="26" cy="32" r="1.6" />
          <circle cx="38" cy="32" r="1.6" />
          <path
            d="M28 37 Q32 40 36 37"
            stroke={fills.stroke}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
