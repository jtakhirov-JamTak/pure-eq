// Open-redirect validator for the post-auth `next` param. Pins the exact set of
// bypass vectors the gate rejects — a regression here turns the auth callback
// into an open redirect (phishing handoff after a real login).

import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath — allows safe same-site paths", () => {
  it("passes a plain absolute path through unchanged", () => {
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
    expect(safeNextPath("/coach/review")).toBe("/coach/review");
  });

  it("preserves query strings and fragments on an internal path", () => {
    expect(safeNextPath("/coach/review?threadId=abc#top")).toBe(
      "/coach/review?threadId=abc#top",
    );
  });
});

describe("safeNextPath — rejects open-redirect vectors → fallback", () => {
  it("rejects a protocol-relative //host", () => {
    expect(safeNextPath("//evil.com")).toBe("/onboarding");
    expect(safeNextPath("//evil.com/path")).toBe("/onboarding");
  });

  it("rejects a backslash-folded /\\host (browser normalizes to a host change)", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/onboarding"); // "/\evil.com"
    expect(safeNextPath("/\\\\evil.com")).toBe("/onboarding"); // "/\\evil.com"
    expect(safeNextPath("/path\\sub")).toBe("/onboarding");
  });

  it("rejects an absolute URL (does not start with /)", () => {
    expect(safeNextPath("https://evil.com")).toBe("/onboarding");
    expect(safeNextPath("http://evil.com")).toBe("/onboarding");
  });

  it("rejects a scheme-like or relative value not starting with /", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/onboarding");
    expect(safeNextPath("onboarding")).toBe("/onboarding");
    expect(safeNextPath("")).toBe("/onboarding");
  });

  it("rejects embedded control chars (CR/LF/tab/null)", () => {
    expect(safeNextPath("/x" + String.fromCharCode(10) + "y")).toBe("/onboarding"); // \n
    expect(safeNextPath("/x" + String.fromCharCode(13) + "y")).toBe("/onboarding"); // \r
    expect(safeNextPath("/x" + String.fromCharCode(9) + "y")).toBe("/onboarding"); // \t
    expect(safeNextPath("/x" + String.fromCharCode(0) + "y")).toBe("/onboarding"); // \0
  });
});

describe("safeNextPath — custom fallback", () => {
  it("returns the provided fallback when the input is unsafe", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });

  it("does not use the fallback when the input is safe", () => {
    expect(safeNextPath("/coach", "/login")).toBe("/coach");
  });
});
