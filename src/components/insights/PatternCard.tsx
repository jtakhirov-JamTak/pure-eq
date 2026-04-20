import { MapPin, Users, ArrowRight } from "lucide-react";
import { InsightIcon } from "./InsightIcon";
import { EvolutionDelta } from "./EvolutionDelta";
import { DIRECTION_STYLES, FIELD_TYPOGRAPHY } from "@/lib/insights-visual";
import type {
  TagCopy,
  PatternSnapshot,
} from "@/lib/insights";
import type { ObservationTag } from "@/types";

interface Props {
  copy: TagCopy;
  distinctEntries: number;
  distinctDays: number;
  evolution: PatternSnapshot["evolution"] | null;
  counterObservations: Array<{
    tag: ObservationTag;
    count: number;
    copy: TagCopy;
  }>;
}

const ACCENT_BORDER: Record<TagCopy["direction"], string> = {
  negative: "border-amber-400",
  positive: "border-emerald-400",
  neutral: "border-sky-400",
};

export function PatternCard({
  copy,
  distinctEntries,
  distinctDays,
  evolution,
  counterObservations,
}: Props) {
  const style = DIRECTION_STYLES[copy.direction];
  const accentBorder = ACCENT_BORDER[copy.direction];

  return (
    <div
      className={`mt-4 rounded-xl border border-zinc-200 border-l-4 ${style.border} ${style.bg} p-5`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InsightIcon type="pattern" className="h-5 w-5 text-zinc-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-600">
            Pattern
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
        >
          {style.badgeText}
        </span>
      </div>

      <p className={`mt-3 ${FIELD_TYPOGRAPHY.pattern}`}>{copy.pattern}</p>

      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className={FIELD_TYPOGRAPHY.showsUpWhen}>
            <span className="text-zinc-500">Shows up when </span>
            {copy.showsUpWhen.charAt(0).toLowerCase() + copy.showsUpWhen.slice(1)}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className={FIELD_TYPOGRAPHY.eqImpact}>
            <span className="text-zinc-500">EQ impact: </span>
            {copy.eqImpact}
          </p>
        </div>
      </div>

      <div className={`mt-3 border-l-2 ${accentBorder} pl-3`}>
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className={FIELD_TYPOGRAPHY.tryInstead}>
            <span className="text-zinc-500">Try instead: </span>
            {copy.tryInstead}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className={`${FIELD_TYPOGRAPHY.proof} min-w-0 flex-1`}>
            Seen in {distinctEntries}{" "}
            {distinctEntries === 1 ? "entry" : "entries"}, across {distinctDays}{" "}
            {distinctDays === 1 ? "day" : "days"}.
          </p>
          {evolution ? (
            <EvolutionDelta
              priorCount={evolution.priorWindow.count}
              currentCount={evolution.currentWindow.count}
              verdict={evolution.verdict}
              direction={copy.direction}
            />
          ) : null}
        </div>

        {counterObservations.length > 0 ? (
          <p className="mt-2 text-xs text-zinc-600">
            Also showing up:{" "}
            {counterObservations
              .slice(0, 2)
              .map((c) => c.copy.pattern.replace(/\.$/, ""))
              .join("; ")}
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
