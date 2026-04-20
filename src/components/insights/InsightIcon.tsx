import { Compass, Scale, Users, TrendingUp } from "lucide-react";

const ICON_MAP = {
  pattern: Compass,
  comparator: Scale,
  person: Users,
  summary: TrendingUp,
} as const;

export function InsightIcon({
  type,
  className,
}: {
  type: "pattern" | "comparator" | "person" | "summary";
  className?: string;
}) {
  const Icon = ICON_MAP[type];
  return <Icon className={className ?? "h-5 w-5"} />;
}
