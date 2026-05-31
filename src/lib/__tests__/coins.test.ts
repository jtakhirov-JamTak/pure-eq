// Coins economy taxonomy + helper-shape tests (Slice B, migration 0043).
//
// The atomic spend/grant logic lives in Postgres (spend_coins / grant_coins),
// so the race-safety + idempotency guarantees are exercised against the live DB
// (verify with /db-check after applying 0043), not here. These tests pin the
// app-side constants that drive pricing + the signup grant so a silent edit to
// a coin cost or the grant amount breaks the build, not production economics.

import { describe, it, expect } from "vitest";
import {
  COIN_COSTS,
  COIN_TXN_REASONS,
  SIGNUP_GRANT_COINS,
  SIGNUP_GRANT_REF_KEY,
} from "@/types";
import { costForTier, generationSpendKey } from "@/lib/coins";

describe("coin cost table — founder-final pricing", () => {
  it("prices Quick at 4 and Deep at 6", () => {
    expect(COIN_COSTS.quick).toBe(4);
    expect(COIN_COSTS.deep).toBe(6);
  });

  it("prices Weekly Insights at 20 and Monthly Report at 80", () => {
    expect(COIN_COSTS.weekly_insights).toBe(20);
    expect(COIN_COSTS.monthly_report).toBe(80);
  });

  it("costForTier maps the AI tier to its coin cost", () => {
    expect(costForTier("quick")).toBe(4);
    expect(costForTier("deep")).toBe(6);
  });
});

describe("generationSpendKey — per-attempt debit key (retry-leak fix)", () => {
  it("scopes the debit to the attempt so retries get a distinct key", () => {
    expect(generationSpendKey("abc", 0)).toBe("abc:gen:0");
    expect(generationSpendKey("abc", 1)).toBe("abc:gen:1");
    // Same entry, different attempt → different key → a genuine retry re-charges
    // instead of colliding with the original debit and generating free.
    expect(generationSpendKey("abc", 0)).not.toBe(generationSpendKey("abc", 1));
  });

  it("is stable for the same entry+attempt so a double-tap collapses to one charge", () => {
    expect(generationSpendKey("xyz", 2)).toBe(generationSpendKey("xyz", 2));
  });
});

describe("signup grant constants", () => {
  it("grants 50 coins on a fixed idempotency ref key", () => {
    expect(SIGNUP_GRANT_COINS).toBe(50);
    expect(SIGNUP_GRANT_REF_KEY).toBe("signup_grant");
  });
});

describe("coin transaction reasons — mirror the DB CHECK in migration 0043", () => {
  it("includes every reason the ledger CHECK allows", () => {
    expect([...COIN_TXN_REASONS]).toEqual([
      "signup_grant",
      "purchase",
      "debit_quick",
      "debit_deep",
      "debit_weekly_insights",
      "debit_monthly_report",
      "refund",
      "admin_adjust",
    ]);
  });
});
