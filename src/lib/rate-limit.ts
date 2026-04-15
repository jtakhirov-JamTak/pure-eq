// Minimal in-memory rate limiter for v0. Per-key sliding window.
//
// Limitations (intentional for v0):
// - In-memory only. Does NOT work across serverless instances — a user
//   routed to two different Next.js workers can exceed the limit.
// - Cleared on every server restart.
// - Not suitable for production traffic at scale.
//
// When any of these become real problems, swap in Upstash Ratelimit or
// a Postgres-backed limiter and keep the same function signature.

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.windowStart + windowMs,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.windowStart + windowMs,
  };
}
