import { TrendingUp } from "lucide-react";

interface Props {
  entriesThisPeriod: number;
  daysThisPeriod: number;
  topPatternChange: string | null;
  newPatterns: string[];
  disappearedPatterns: string[];
}

export function PeriodSummaryRow({
  entriesThisPeriod,
  daysThisPeriod,
  topPatternChange,
  newPatterns,
  disappearedPatterns,
}: Props) {
  if (entriesThisPeriod < 2) return null;

  let text = `This period: ${entriesThisPeriod} ${
    entriesThisPeriod === 1 ? "entry" : "entries"
  } across ${daysThisPeriod} ${daysThisPeriod === 1 ? "day" : "days"}.`;

  if (topPatternChange) text += ` ${topPatternChange}.`;
  if (newPatterns.length > 0) text += ` New: ${newPatterns.join(", ")}.`;
  if (disappearedPatterns.length > 0)
    text += ` Faded: ${disappearedPatterns.join(", ")}.`;

  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
      <p className="text-sm text-zinc-700">{text}</p>
    </div>
  );
}
