type Props = {
  size?: number;
};

export function Wordmark({ size = 17 }: Props) {
  const base = {
    fontWeight: 700 as const,
    fontSize: size * 1.15,
    letterSpacing: "-0.4px",
    lineHeight: 1,
  };
  return (
    <span className="font-brand leading-none">
      <span style={{ ...base, color: "var(--color-brand)" }}>Speak</span>
      <span
        style={{
          ...base,
          color: "#FFFFFF",
          fontStyle: "italic",
          textShadow:
            "0 1px 0 rgba(14,39,72,0.22), 0 2px 6px rgba(14,39,72,0.18)",
        }}
      >
        Easy
      </span>
    </span>
  );
}
