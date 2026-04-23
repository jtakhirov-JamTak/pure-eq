type Props = {
  x: number;
  y: number;
  size?: number;
  opacity?: number;
  blur?: number;
};

export function CloudScatter({
  x,
  y,
  size = 80,
  opacity = 0.85,
  blur = 0,
}: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: y,
        left: x,
        width: size,
        height: size * 0.65,
        opacity,
        filter: blur ? `blur(${blur}px)` : "none",
        pointerEvents: "none",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 65">
        <circle cx="22" cy="38" r="18" fill="#FFFFFF" />
        <circle cx="45" cy="28" r="22" fill="#FFFFFF" />
        <circle cx="70" cy="32" r="18" fill="#FFFFFF" />
        <circle cx="82" cy="42" r="14" fill="#FFFFFF" />
        <rect x="18" y="38" width="68" height="18" rx="9" fill="#FFFFFF" />
      </svg>
    </div>
  );
}
