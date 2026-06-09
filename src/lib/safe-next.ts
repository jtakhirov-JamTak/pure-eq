/**
 * Validate a post-auth redirect target to prevent open redirects.
 *
 * Returns `next` only when it is a safe SAME-SITE absolute path:
 *  - starts with "/" but NOT "//" (a protocol-relative URL points at another
 *    host),
 *  - contains no backslashes (older browsers / URL normalizers fold
 *    "/\evil.com" or "/\\evil.com" into a host change, bypassing the "//" gate),
 *  - contains no ASCII control chars (embedded CR/LF/tab can bypass header
 *    parsers or log-injection filters).
 *
 * Anything else falls back to `fallback` (default "/onboarding"). Used for any
 * server-returned redirect derived from a `next` query param.
 */
export function safeNextPath(next: string, fallback = "/onboarding"): string {
  return next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    !/[\x00-\x1f]/.test(next)
    ? next
    : fallback;
}
