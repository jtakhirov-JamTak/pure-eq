/**
 * CSRF origin check for mutating API routes.
 * Compares the Origin header's host against the Host header.
 * Returns true if they match, false otherwise.
 */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
