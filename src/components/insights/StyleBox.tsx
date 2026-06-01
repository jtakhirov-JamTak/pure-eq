import Link from "next/link";
import type { ProfileType } from "@/types";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";

interface Props {
  primary: ProfileType;
  secondary: ProfileType | null;
  description: {
    strength: string;
    stress: string;
    willHelpMost: string;
  };
  avatarColorClass: string;
}

export function StyleBox({
  primary,
  secondary,
  description,
  avatarColorClass,
}: Props) {
  const primaryLabel = primary.charAt(0).toUpperCase() + primary.slice(1);
  const secondaryLabel = secondary
    ? secondary.charAt(0).toUpperCase() + secondary.slice(1)
    : null;

  return (
    <Card className="mt-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-[15px] text-white ${avatarColorClass}`}
        >
          {primary.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <Kicker>Your style</Kicker>
          <p className="mt-1 text-[14px] font-semibold text-ink">
            {primaryLabel}
            {secondaryLabel ? ` with ${secondaryLabel} tendencies` : ""}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[13px] font-medium leading-[1.5] text-ink-soft">
        {description.strength}
      </p>

      <div className="mt-2 flex justify-end">
        <Link
          href="/onboarding?retake=1"
          className="inline-flex min-h-11 items-center px-2 text-[12px] font-medium text-ink-soft underline active:opacity-70"
        >
          Retake Communication Profile
        </Link>
      </div>
    </Card>
  );
}
