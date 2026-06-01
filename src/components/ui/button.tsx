import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Primary action — accent fill, dark accent-text, 56px tall, full-width. One
 * per screen (§1: the accent is a scarce resource). The soft shadow (shadow-cta)
 * is one of the few shadows Storm allows — it marks the floating primary action.
 */
export function PrimaryButton({
  children,
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-[14px] bg-accent text-[15px] font-semibold text-accent-text shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Secondary action — surface fill, ink text, hairline border, ~48px. "Back",
 * "Skip", "Maybe later". Never accent (that's reserved for the one primary).
 */
export function SecondaryButton({
  children,
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(
        "flex h-12 items-center justify-center rounded-[14px] border border-hairline bg-surface text-[14px] font-semibold text-ink transition active:opacity-80 disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
