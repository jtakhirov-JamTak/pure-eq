import { MapPin, Users, ArrowRight } from "lucide-react";
import { InsightIcon } from "./InsightIcon";
import {
  ACCENT_BORDER,
  DIRECTION_STYLES,
  FIELD_TYPOGRAPHY,
} from "@/lib/insights-visual";
import type { TagCopy, PatternSnapshot } from "@/lib/insights";
import type { ObservationTag } from "@/types";

interface Props {
  copy: TagCopy;
  distinctEntries: number;
  distinctDays: number;
  evolution: PatternSnapshot["evolution"];
  counterObservations: Array<{
    tag: ObservationTag;
    count: number;
    copy: TagCopy;
  }>;
  comparatorLine: string | null;
  shiftLine: string;
}

export function MainPatternBox({
  copy,
  distinctEntries,
  distinctDays,
  counterObservations,
  comparatorLine,
  shiftLine,
}: Props) {
  const style = DIRECTION_STYLES[copy.direction];
  const accentBorder = ACCENT_BORDER[copy.direction];

  return (
    <div
      className={`mt-4 rounded-card-sm border-l-4 ${style.border} ${style.bg} p-5 shadow-card`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InsightIcon type="pattern" className="h-5 w-5 text-ink-soft" />
          <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-ink-soft">
            Your main pattern
          </span>
        </div>
        <span
          className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${style.badge}`}
        >
          {style.badgeText}
        </span>
      </div>

      <p className={`mt-3 ${FIELD_TYPOGRAPHY.pattern}`}>{copy.pattern}</p>

      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className={FIELD_TYPOGRAPHY.showsUpWhen}>
            <span className="text-ink-muted">Shows up when </span>
            {copy.showsUpWhen.charAt(0).toLowerCase() +
              copy.showsUpWhen.slice(1)}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className={FIELD_TYPOGRAPHY.eqImpact}>
            <span className="text-ink-muted">EQ impact: </span>
            {copy.eqImpact}
          </p>
        </div>
      </div>

      {comparatorLine ? (
        <p className="mt-3 font-display text-[14px] italic leading-[1.4] text-ink-soft">
          {comparatorLine}
        </p>
      ) : null}

      <div className={`mt-3 border-l-2 ${accentBorder} pl-3`}>
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className={FIELD_TYPOGRAPHY.tryInstead}>
            <span className="text-ink-muted">Try instead: </span>
            {copy.tryInstead}
          </p>
        </div>
      </div>

      {counterObservations.length > 0 ? (
        <p className="mt-3 text-[12px] font-medium text-ink-soft">
          Also showing up:{" "}
          {counterObservations
            .slice(0, 2)
            .map((c) => c.copy.pattern.replace(/\.$/, ""))
            .join("; ")}
          .
        </p>
      ) : null}

      <div className="mt-4 border-t border-hair pt-3">
        {shiftLine ? (
          <p className="text-[12px] font-medium text-ink-soft">{shiftLine}</p>
        ) : null}
        <p className={`${FIELD_TYPOGRAPHY.proof} ${shiftLine ? "mt-1" : ""}`}>
          Seen in {distinctEntries}{" "}
          {distinctEntries === 1 ? "entry" : "entries"}, across {distinctDays}{" "}
          {distinctDays === 1 ? "day" : "days"}.
        </p>
      </div>
    </div>
  );
}
