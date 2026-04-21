import Link from "next/link";
import type { ProfileType } from "@/types";

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
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColorClass}`}
        >
          {primary.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Your Style
          </p>
          <p className="text-sm text-zinc-800">
            {primaryLabel}
            {secondaryLabel ? ` with ${secondaryLabel} tendencies` : ""}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-700">{description.strength}</p>

      <div className="mt-2 flex justify-end">
        <Link
          href="/onboarding?retake=1"
          className="inline-flex min-h-11 items-center px-2 text-xs text-zinc-600 underline hover:text-zinc-800"
        >
          Retake Communication Profile
        </Link>
      </div>
    </div>
  );
}
