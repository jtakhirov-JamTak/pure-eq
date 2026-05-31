// Pure EQ domain — coins purchase page (Slice B2). Inside (app) so the layout's
// auth gate + app shell (top bar, bottom tabs) apply. Server-renders the balance
// and the founder-final pack lineup; a client child owns the Buy buttons.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/coins";
import { COIN_PACKS } from "@/lib/payments";
import { CoinsClient } from "./coins-client";

export default async function CoinsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const balance = await getBalance(user.id);
  const { purchase } = await searchParams;

  // Pass only display fields to the client (never the Stripe price-env mapping).
  const packs = COIN_PACKS.map((p) => ({
    key: p.key,
    name: p.name,
    coins: p.coins,
    priceLabel: p.priceLabel,
  }));

  return (
    <CoinsClient
      balance={balance}
      packs={packs}
      purchaseState={
        purchase === "success"
          ? "success"
          : purchase === "cancelled"
            ? "cancelled"
            : null
      }
    />
  );
}
