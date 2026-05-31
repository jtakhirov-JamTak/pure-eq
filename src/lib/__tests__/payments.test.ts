// Coins payments — pack/price mapping tests (Slice B2).
//
// The Stripe checkout + webhook wiring is exercised against Stripe's test mode
// (see docs/stripe_setup_walkthrough.md), not here. These tests pin the
// server-authoritative pack table — the coin amounts a purchase grants and the
// price→env mapping — so a silent edit to a coin count or a key breaks the
// build, not production economics. The webhook reads coins from THIS table, not
// from an echoed Stripe amount, so these numbers are load-bearing.

import { describe, it, expect, afterEach } from "vitest";
import {
  COIN_PACKS,
  packForKey,
  priceIdForPack,
  type CoinPackKey,
} from "@/lib/payments";

describe("COIN_PACKS — founder-final lineup (2026-05-30)", () => {
  it("has exactly the four packs at the locked prices + coin counts", () => {
    const summary = COIN_PACKS.map((p) => [p.key, p.priceLabel, p.coins]);
    expect(summary).toEqual([
      ["booster", "$4.99", 50],
      ["starter", "$19.99", 250],
      ["builder", "$49.99", 750],
      ["master", "$99.99", 1500],
    ]);
  });

  it("maps each pack to a distinct Stripe price env var", () => {
    const envKeys = COIN_PACKS.map((p) => p.priceEnvKey);
    expect(new Set(envKeys).size).toBe(COIN_PACKS.length);
  });
});

describe("packForKey", () => {
  it("resolves every known key", () => {
    (["booster", "starter", "builder", "master"] as CoinPackKey[]).forEach((k) => {
      expect(packForKey(k)?.key).toBe(k);
    });
  });

  it("returns null for an unknown key (never a silent default)", () => {
    expect(packForKey("enterprise")).toBeNull();
    expect(packForKey("")).toBeNull();
  });
});

describe("priceIdForPack", () => {
  const booster = packForKey("booster")!;
  afterEach(() => {
    delete process.env.STRIPE_PRICE_BOOSTER;
  });

  it("returns the env price id when set", () => {
    process.env.STRIPE_PRICE_BOOSTER = "price_test_123";
    expect(priceIdForPack(booster)).toBe("price_test_123");
  });

  it("returns null when the env var is unset (caller 503s rather than charge a missing price)", () => {
    delete process.env.STRIPE_PRICE_BOOSTER;
    expect(priceIdForPack(booster)).toBeNull();
  });

  it("treats an empty env var as unset", () => {
    process.env.STRIPE_PRICE_BOOSTER = "";
    expect(priceIdForPack(booster)).toBeNull();
  });
});
