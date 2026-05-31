// Pure EQ domain — coins payments (Slice B2, Stripe one-time checkout).
//
// Server-only. The coin PACK definitions here are the single source of truth for
// how many coins a purchase grants — Stripe only ever knows dollars. The webhook
// reads the pack key out of the checkout session metadata and looks the coin
// amount up in COIN_PACKS, so a tampered amount can never over-credit (Stripe
// metadata is set by us server-side, but we still re-derive coins from the key
// rather than trusting an echoed number).
//
// All purchases are ONE-TIME (mode: 'payment', NOT subscription) — coins never
// expire and there is no recurring billing anywhere (founder-final).
// NEVER import this in a client component.

import Stripe from "stripe";

export type CoinPackKey = "booster" | "starter" | "builder" | "master";

export interface CoinPack {
  key: CoinPackKey;
  name: string;
  /** Coins granted on a successful purchase — server source of truth. */
  coins: number;
  /** Display price (UI only — Stripe holds the authoritative amount). */
  priceLabel: string;
  /** Env var holding this pack's Stripe Price ID. */
  priceEnvKey:
    | "STRIPE_PRICE_BOOSTER"
    | "STRIPE_PRICE_STARTER"
    | "STRIPE_PRICE_BUILDER"
    | "STRIPE_PRICE_MASTER";
}

// Founder-final lineup (created in Stripe 2026-05-30). Keep in sync with memory
// project_coins_framework_final and docs/stripe_setup_walkthrough.md.
export const COIN_PACKS: CoinPack[] = [
  { key: "booster", name: "Booster Pack", coins: 50, priceLabel: "$4.99", priceEnvKey: "STRIPE_PRICE_BOOSTER" },
  { key: "starter", name: "EQ Starter Pack", coins: 250, priceLabel: "$19.99", priceEnvKey: "STRIPE_PRICE_STARTER" },
  { key: "builder", name: "EQ Skill Builder Pack", coins: 750, priceLabel: "$49.99", priceEnvKey: "STRIPE_PRICE_BUILDER" },
  { key: "master", name: "EQ Skill Master Pack", coins: 1500, priceLabel: "$99.99", priceEnvKey: "STRIPE_PRICE_MASTER" },
];

const PACKS_BY_KEY: Record<CoinPackKey, CoinPack> = Object.fromEntries(
  COIN_PACKS.map((p) => [p.key, p]),
) as Record<CoinPackKey, CoinPack>;

/** Pack definition for a key, or null if the key is unknown. */
export function packForKey(key: string): CoinPack | null {
  return (PACKS_BY_KEY as Record<string, CoinPack | undefined>)[key] ?? null;
}

/**
 * Resolve a pack's Stripe Price ID from its env var. Returns null when the env
 * var is unset (misconfiguration) so the caller can 500 rather than create a
 * checkout session against a missing price.
 */
export function priceIdForPack(pack: CoinPack): string | null {
  const v = process.env[pack.priceEnvKey];
  return v && v.length > 0 ? v : null;
}

// Lazy singleton so a missing STRIPE_SECRET_KEY only fails the request that
// needs Stripe, not module load (keeps unrelated routes + the build working
// when the key isn't set locally). Returns null when the key is absent.
let stripeSingleton: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (stripeSingleton) return stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.length === 0) return null;
  // apiVersion omitted on purpose — pin to the SDK's bundled default so an
  // upgrade is a deliberate, single-line change rather than a silently-stale
  // string. The webhook constructEvent + Checkout session shapes we use are
  // stable across recent versions.
  stripeSingleton = new Stripe(key);
  return stripeSingleton;
}
