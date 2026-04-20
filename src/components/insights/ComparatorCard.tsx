import { MapPin, Users, ArrowRight } from "lucide-react";
import { InsightIcon } from "./InsightIcon";
import { EvolutionDelta } from "./EvolutionDelta";
import { DIRECTION_STYLES, FIELD_TYPOGRAPHY } from "@/lib/insights-visual";
import { COMPARATOR_COPY, type ComparatorSnapshot } from "@/lib/insights";

interface Props {
  reflectionScore: number;
  regulationScore: number;
  reviewCount: number;
  reactiveCount: number;
  distinctDays: number;
  evolution: ComparatorSnapshot["evolution"];
}

export function ComparatorCard({
  reflectionScore,
  regulationScore,
  reviewCount,
  reactiveCount,
  distinctDays,
  evolution,
}: Props) {
  const style = DIRECTION_STYLES.negative;
  const accentBorder = "border-amber-400";

  return (
    <div
      className={`mt-4 rounded-xl border border-zinc-200 border-l-4 ${style.border} ${style.bg} p-5`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InsightIcon type="comparator" className="h-5 w-5 text-zinc-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-600">
            Reflection vs Regulation
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
        >
          {style.badgeText}
        </span>
      </div>

      <p className={`mt-3 ${FIELD_TYPOGRAPHY.pattern}`}>{COMPARATOR_COPY.pattern}</p>

      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className={FIELD_TYPOGRAPHY.showsUpWhen}>
            <span className="text-zinc-500">Shows up when </span>
            {COMPARATOR_COPY.showsUpWhen.charAt(0).toLowerCase() +
              COMPARATOR_COPY.showsUpWhen.slice(1)}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className={FIELD_TYPOGRAPHY.eqImpact}>
            <span className="text-zinc-500">EQ impact: </span>
            {COMPARATOR_COPY.eqImpact}
          </p>
        </div>
      </div>

      <div className={`mt-3 border-l-2 ${accentBorder} pl-3`}>
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className={FIELD_TYPOGRAPHY.tryInstead}>
            <span className="text-zinc-500">Try instead: </span>
            {COMPARATOR_COPY.tryInstead}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className={`${FIELD_TYPOGRAPHY.proof} min-w-0 flex-1`}>
            Reflection {reflectionScore.toFixed(2)} vs regulation{" "}
            {regulationScore.toFixed(2)}. {reviewCount}{" "}
            {reviewCount === 1 ? "review" : "reviews"}, {reactiveCount} reactive{" "}
            {reactiveCount === 1 ? "entry" : "entries"}, {distinctDays}{" "}
            {distinctDays === 1 ? "day" : "days"}.
          </p>
          {evolution ? (
            <EvolutionDelta
              priorCount={evolution.priorGap ?? 0}
              currentCount={evolution.currentGap}
              verdict={evolution.verdict}
              direction="negative"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
