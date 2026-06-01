// Storm background (§2). This used to render the light sky-and-clouds gradient
// with a cloud scatter; the redesign replaces that wholesale with the dark
// Storm gradient and removes the cloud motif. The `variant` prop is retained
// (and ignored) so the many existing callers keep compiling and all flip to
// Storm in one change — per-page cleanup happens as each surface is converted.
//
// The gradient itself lives in `--background` (globals.css), the single source
// of truth, painted here as a fixed -z-10 layer.

export type SkyVariant =
  | "coach-hub"
  | "calm"
  | "warm"
  | "tools-hub"
  | "stormy"
  | "result";

export function SkyBackground({
  variant: _variant = "calm",
}: {
  variant?: SkyVariant;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: "var(--background)" }}
    />
  );
}
