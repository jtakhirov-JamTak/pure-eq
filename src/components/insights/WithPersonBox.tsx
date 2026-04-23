import { MapPin, Users, ArrowRight } from "lucide-react";
import { InsightIcon } from "./InsightIcon";
import {
  ACCENT_BORDER,
  DIRECTION_STYLES,
  FIELD_TYPOGRAPHY,
} from "@/lib/insights-visual";
import type { TagCopy } from "@/lib/insights";

interface Props {
  displayName: string;
  copy: TagCopy | null;
  positiveCopy: TagCopy | null;
  distinctEntries: number;
  distinctDays: number;
}

function lowercaseFirst(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function resolvePatternLine(copy: TagCopy, displayName: string): string {
  if (copy.patternPerson) {
    return copy.patternPerson.replace(/\{name\}/g, displayName);
  }
  return `With ${displayName}, ${lowercaseFirst(copy.pattern)}`;
}

export function WithPersonBox({
  displayName,
  copy,
  positiveCopy,
  distinctEntries,
  distinctDays,
}: Props) {
  const primary = copy ?? positiveCopy;
  if (!primary) return null;

  const style = DIRECTION_STYLES[primary.direction];
  const accentBorder = ACCENT_BORDER[primary.direction];

  const patternLine = resolvePatternLine(primary, displayName);

  return (
    <div
      className={`mt-4 rounded-card-sm border-l-4 ${style.border} ${style.bg} p-5 shadow-card`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <InsightIcon
            type="person"
            className="h-5 w-5 shrink-0 text-ink-soft"
          />
          <span className="truncate text-[11px] font-bold uppercase tracking-[1.2px] text-ink-soft">
            With {displayName}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${style.badge}`}
        >
          {style.badgeText}
        </span>
      </div>

      <p className={`mt-3 ${FIELD_TYPOGRAPHY.pattern}`}>{patternLine}</p>

      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className={FIELD_TYPOGRAPHY.showsUpWhen}>
            <span className="text-ink-muted">Shows up when </span>
            {lowercaseFirst(primary.showsUpWhen)}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className={FIELD_TYPOGRAPHY.eqImpact}>
            <span className="text-ink-muted">EQ impact: </span>
            {primary.eqImpact}
          </p>
        </div>
      </div>

      <div className={`mt-3 border-l-2 ${accentBorder} pl-3`}>
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className={FIELD_TYPOGRAPHY.tryInstead}>
            <span className="text-ink-muted">Try instead: </span>
            {primary.tryInstead}
          </p>
        </div>
      </div>

      {copy && positiveCopy ? (
        <p className="mt-3 text-[12px] font-medium text-ink-soft">
          Also: {lowercaseFirst(positiveCopy.pattern.replace(/\.$/, ""))}.
        </p>
      ) : null}

      <div className="mt-4 border-t border-hair pt-3">
        <p className={FIELD_TYPOGRAPHY.proof}>
          {distinctEntries} {distinctEntries === 1 ? "entry" : "entries"} across{" "}
          {distinctDays} {distinctDays === 1 ? "day" : "days"}.
        </p>
      </div>
    </div>
  );
}
