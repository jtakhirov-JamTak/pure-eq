import type { ReflectionOutput } from "@/lib/ai/schemas";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";

// Formats "2026-04-20" or ISO timestamp into "Apr 20, 2026".
function formatDate(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  reflection: ReflectionOutput;
  generatedAt: string; // ISO
}

export function ReflectionCard({ reflection, generatedAt }: Props) {
  // Refusal shape — surface the model's message as a low-key card.
  if (reflection.mode === "refusal") {
    return (
      <Card className="mt-4 p-5">
        <Kicker>Your weekly reflection</Kicker>
        <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink-soft">
          {reflection.message_to_user}
        </p>
        <p className="mt-3 text-[11px] font-medium text-ink-muted">
          Checked on {formatDate(generatedAt)}
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>Your weekly reflection</Kicker>
        {/* Prominent byline — if the writer ever silently breaks, a stale
            date is the user-visible canary (migration-0018 defense). */}
        <p className="text-[11px] font-medium text-ink-muted">
          Generated {formatDate(generatedAt)}
        </p>
      </div>

      <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink">
        {reflection.summary}
      </p>

      <div className="mt-4 space-y-5">
        {reflection.observations.map((obs, i) => (
          <div key={i} className="border-t border-hairline pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[14px] font-semibold leading-[1.3] text-ink">
                {obs.theme}
              </p>
              <span
                className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ${
                  obs.confidence === "clear"
                    ? "bg-accent text-accent-text"
                    : "bg-surface-tint text-ink-soft"
                }`}
              >
                {obs.confidence}
              </span>
            </div>

            <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink-soft">
              {obs.observation}
            </p>

            <div className="mt-3 space-y-2">
              {obs.evidence.map((ev, j) => (
                <blockquote
                  key={j}
                  className="border-l-2 border-accent pl-3 text-[12px] italic leading-[1.5] text-ink-soft"
                >
                  &ldquo;{ev.quote}&rdquo;
                  <span className="ml-2 not-italic text-[11px] font-medium text-ink-muted">
                    — {formatDate(ev.source_date)}
                  </span>
                </blockquote>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
