// Pure EQ — page-level progress dots for the multi-Q-per-page Coach flows.
// Mirrors StepDots visually; semantically tracks pages, not Qs. Used by
// CoachPage; still rendered when there's only one page (collapses to a
// single dot, which is a no-op visual but keeps layout stable).

type Props = {
  current: number;
  total: number;
};

export function PageDots({ current, total }: Props) {
  return (
    <div className="flex items-center gap-[5px]" aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const isPastOrCurrent = i <= current;
        const isCurrent = i === current;
        return (
          <div
            key={i}
            className="h-[5px] rounded-[3px] transition-[width,background-color] duration-[400ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
            style={{
              width: isCurrent ? 22 : 5,
              backgroundColor: isPastOrCurrent
                ? "var(--color-accent)"
                : "var(--color-hairline-strong)",
            }}
          />
        );
      })}
    </div>
  );
}
