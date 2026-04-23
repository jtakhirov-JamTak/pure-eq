import { CloudLogo } from "./CloudLogo";

type Props = {
  size?: number;
  showLogo?: boolean;
};

export function Wordmark({ size = 17, showLogo = true }: Props) {
  const textStyle = {
    fontWeight: 700 as const,
    fontSize: size * 1.15,
    color: "#FFFFFF",
    letterSpacing: "-0.4px",
    WebkitTextStroke: `${Math.max(1, size / 14)}px #0E2748`,
    textShadow:
      "0 2px 0 rgba(14,39,72,0.18), 0 4px 10px rgba(14,39,72,0.18)",
    paintOrder: "stroke fill" as const,
    lineHeight: 1,
  };
  return (
    <div className="flex items-center gap-2">
      {showLogo && <CloudLogo size={size * 1.9} hasFace />}
      <span className="font-brand leading-none">
        <span style={textStyle}>Speak</span>
        <span style={{ ...textStyle, fontStyle: "italic" }}>Easy</span>
      </span>
    </div>
  );
}
