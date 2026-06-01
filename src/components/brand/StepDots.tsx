type Props = {
  current: number;
  total: number;
};

export function StepDots({ current, total }: Props) {
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
