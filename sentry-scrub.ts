// Shared Sentry privacy scrubber — imported by instrumentation-client.ts,
// sentry.server.config.ts, and sentry.edge.config.ts.
//
// Pure EQ stores mental-health-adjacent user content (journal text,
// emotions, triggers, person names).
//
// SDK error messages are built from the RESPONSE body, and response bodies
// carry data: a Supabase PostgrestError returns the offending column values
// in .details on conflict ("Key (user_id, name)=(...) already exists"), and
// Sentry writes that straight into exception.values[*].value. That alone
// makes the exception-value scrub load-bearing, not defense-in-depth.
//
// Do NOT weaken this on the theory that a given provider is safe. An earlier
// version of this comment claimed Anthropic's APIError echoes the request
// body / prompt; that is wrong — APIError.makeMessage() reads the response
// error only (verified against @anthropic-ai/sdk@0.89.0). The blanket
// ex.value redaction stays correct anyway, because it covers every provider
// whose error text we do not control.

import type { ErrorEvent, Breadcrumb } from "@sentry/nextjs";

const SCRUB_EXTRA_KEYS = ["input", "payload", "body", "transcript", "text"];
const MAX_QUERY_VALUE_LENGTH = 50;
const REDACTED = "[redacted]";

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // 1. Drop request body entirely.
  if (event.request) {
    delete event.request.data;

    // Trim long query-string values. Sentry's QueryParams type is
    // string | string[][] | Record<string, string>.
    const qs = event.request.query_string;
    if (typeof qs === "string") {
      const params = new URLSearchParams(qs);
      const out = new URLSearchParams();
      params.forEach((value, key) => {
        out.append(
          key,
          value.length > MAX_QUERY_VALUE_LENGTH ? "[redacted:length]" : value,
        );
      });
      event.request.query_string = out.toString();
    } else if (Array.isArray(qs)) {
      event.request.query_string = qs.map(([k, v]): [string, string] => [
        k,
        typeof v === "string" && v.length > MAX_QUERY_VALUE_LENGTH
          ? "[redacted:length]"
          : v,
      ]);
    } else if (qs && typeof qs === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(qs)) {
        const s = String(v);
        out[k] = s.length > MAX_QUERY_VALUE_LENGTH ? "[redacted:length]" : s;
      }
      event.request.query_string = out;
    }
  }

  // 2. Full redact on known-sensitive extra keys.
  if (event.extra) {
    for (const key of SCRUB_EXTRA_KEYS) {
      if (key in event.extra) {
        event.extra[key] = REDACTED;
      }
    }
  }

  // 3. Exception message is the primary PII channel — SDK errors
  //    (Anthropic, OpenAI, Supabase) embed user content into .message.
  //    Keep the class name (type), drop the message. Our own tags carry
  //    the observability signal.
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) {
        ex.value = REDACTED;
      }
    }
  }

  return event;
}

// Drop console breadcrumbs entirely (they stringify raw args, including
// full error objects from console.error(..., err) call patterns). Keep
// fetch/xhr breadcrumbs for URL/status signal but strip any query string
// — user-typed search terms can end up there.
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;

  if (
    (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") &&
    breadcrumb.data
  ) {
    const url = breadcrumb.data.url;
    if (typeof url === "string") {
      const qIdx = url.indexOf("?");
      if (qIdx !== -1) {
        breadcrumb.data.url = url.slice(0, qIdx);
      }
    }
  }

  return breadcrumb;
}
