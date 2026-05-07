import { describe, it, expect } from "vitest";
import { pageCanAdvance, type PageDef } from "@/lib/coach/page-flow";

describe("pageCanAdvance", () => {
  it("returns true when every visible Q has a non-empty value", () => {
    const page: PageDef = {
      pageKey: "p1",
      qs: [
        { key: "a", title: "", prompt: null, kind: "textarea" },
        { key: "b", title: "", prompt: null, kind: "textarea" },
      ],
    };
    expect(pageCanAdvance(page, { a: "x", b: "y" })).toBe(true);
  });

  it("returns false when any visible Q is missing or whitespace-only", () => {
    const page: PageDef = {
      pageKey: "p1",
      qs: [
        { key: "a", title: "", prompt: null, kind: "textarea" },
        { key: "b", title: "", prompt: null, kind: "textarea" },
      ],
    };
    expect(pageCanAdvance(page, { a: "x" })).toBe(false);
    expect(pageCanAdvance(page, { a: "x", b: "" })).toBe(false);
    expect(pageCanAdvance(page, { a: "x", b: "  \n" })).toBe(false);
  });

  it("ignores Qs hidden by conditional", () => {
    const page: PageDef = {
      pageKey: "p1",
      qs: [
        { key: "chip", title: "", prompt: null, kind: "select" },
        {
          key: "extra",
          title: "",
          prompt: null,
          kind: "textarea",
          conditional: (s) => s.chip === "needs_extra",
        },
      ],
    };
    // chip says it doesn't need the extra Q → page advances even with extra unset.
    expect(pageCanAdvance(page, { chip: "no_extra" })).toBe(true);
    // chip says it does need the extra Q → page blocks until extra fills.
    expect(pageCanAdvance(page, { chip: "needs_extra" })).toBe(false);
    expect(pageCanAdvance(page, { chip: "needs_extra", extra: "filled" })).toBe(true);
  });

  it("validates object-shaped Q values (timing combo, calibration block)", () => {
    const page: PageDef = {
      pageKey: "p1",
      qs: [
        { key: "timing", title: "", prompt: null, kind: "timing_combo" },
      ],
    };
    expect(pageCanAdvance(page, { timing: { when: "tonight", isNowThatMoment: false } })).toBe(true);
    expect(pageCanAdvance(page, { timing: { when: "", isNowThatMoment: false } })).toBe(false);
    expect(pageCanAdvance(page, { timing: {} })).toBe(false);
  });

  it("rejects null and empty arrays", () => {
    const page: PageDef = {
      pageKey: "p1",
      qs: [{ key: "tags", title: "", prompt: null, kind: "select" }],
    };
    expect(pageCanAdvance(page, { tags: null })).toBe(false);
    expect(pageCanAdvance(page, { tags: [] })).toBe(false);
    expect(pageCanAdvance(page, { tags: ["x"] })).toBe(true);
  });
});
