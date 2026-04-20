import { ArrowUp, ArrowDown, Minus, Sparkle, Check } from "lucide-react";
import { DIRECTION_STYLES, type TagDirection } from "@/lib/insights-visual";
import type { PatternVerdict } from "@/lib/insights";

interface Props {
  priorCount: number;
  currentCount: number;
  verdict: PatternVerdict;
  direction: TagDirection;
}

export function EvolutionDelta({
  priorCount,
  currentCount,
  verdict,
  direction,
}: Props) {
  const style = DIRECTION_STYLES[direction];

  if (verdict === "new") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
        <Sparkle className="h-3 w-3" />
        New this period
      </span>
    );
  }

  if (verdict === "gone") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
        <Check className="h-3 w-3" />
        No longer appearing
      </span>
    );
  }

  if (verdict === "steady") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
        <Minus className="h-3 w-3" />
        Steady
      </span>
    );
  }

  if (verdict === "dormant") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
        <Minus className="h-3 w-3" />
        No recent activity
      </span>
    );
  }

  // Float inputs (e.g. ComparatorCard's gap values) need formatting; integer
  // inputs (PatternCard's counts) render as-is. Detecting at render time keeps
  // both call sites simple.
  const fmt = (n: number): string =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);

  if (verdict === "increasing") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs ${style.evolutionUpColor}`}
      >
        <ArrowUp className="h-3 w-3" />
        {fmt(priorCount)} → {fmt(currentCount)}
      </span>
    );
  }

  // decreasing
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${style.evolutionDownColor}`}
    >
      <ArrowDown className="h-3 w-3" />
      {fmt(priorCount)} → {fmt(currentCount)}
    </span>
  );
}
