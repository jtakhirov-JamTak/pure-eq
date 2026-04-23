import type { ReactNode } from "react";

type Props = {
  children?: ReactNode;
};

export function BreathingCloud({ children }: Props) {
  return (
    <div
      className="relative flex h-[200px] w-[240px] items-center justify-center [animation:breathe_14s_ease-in-out_infinite] motion-reduce:animate-none"
      aria-hidden
    >
      <svg
        width="240"
        height="200"
        viewBox="0 0 240 200"
        style={{ filter: "drop-shadow(0 20px 30px rgba(14,39,72,0.20))" }}
      >
        <circle cx="60" cy="120" r="46" fill="#FFFFFF" />
        <circle cx="108" cy="80" r="60" fill="#FFFFFF" />
        <circle cx="164" cy="90" r="54" fill="#FFFFFF" />
        <circle cx="196" cy="122" r="40" fill="#FFFFFF" />
        <rect x="50" y="120" width="154" height="52" rx="26" fill="#FFFFFF" />
        <ellipse cx="126" cy="168" rx="82" ry="9" fill="#D6E8F7" opacity="0.6" />
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-ink">
          {children}
        </div>
      )}
    </div>
  );
}
