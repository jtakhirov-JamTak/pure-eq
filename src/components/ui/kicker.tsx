import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Mono uppercase label — the signature of the Storm system (§3). IBM Plex
 * Mono, ~10px, weight 500, UPPERCASE, letter-spacing 1.3. Used for every
 * section label, step counter, eyebrow, and metric.
 *
 * Default color is ink-soft, not ink-muted: §2 forbids ink-muted on a surface
 * for anything the user must read, and a kicker is a label, not decoration.
 * Pass `className="text-accent-ink"` for the active/accent variant.
 */
export function Kicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-medium uppercase leading-none tracking-[1.3px] text-ink-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}
