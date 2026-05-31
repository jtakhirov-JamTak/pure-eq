# Stripe Setup Walkthrough (Pure EQ — Coins B2)

Plain-language, click-by-click. You can do steps 1, 3, 4, 5 **today in test mode**
with no bank account. The real-bank part (step 2) only has to clear before launch.

When you finish, you'll hand Claude **3 things**: a secret key, a webhook secret,
and 4 price IDs. Claude builds the code from there.

---

## Vocabulary (so the dashboard makes sense)

- **Test mode** — a fake sandbox. Use fake card `4242 4242 4242 4242`, any future
  expiry, any 3-digit CVC. No real money, no bank needed. There's a toggle in the
  top-right of the Stripe dashboard that says "Test mode."
- **Product** — a thing you sell (e.g. "Top-up coin pack").
- **Price** — the dollar amount attached to a Product. We use **one-time** prices.
- **Price ID** — a code like `price_1ABc...` that the app uses to say "charge for
  THIS pack." You'll copy 4 of these.
- **API key** — a password your *server* uses to talk to Stripe (`sk_test_...`).
- **Webhook** — Stripe phoning your app back to say "this person paid."
- **Webhook signing secret** — proof the phone-call is really from Stripe
  (`whsec_...`), so nobody can fake a "they paid" message.

---

## Step 1 — Create the account  ✅ do today

1. Go to **https://stripe.com** → "Sign up" (or "Start now").
2. Use your email (jtakhirov@gmail.com) and a strong password.
3. Confirm the email Stripe sends you.
4. You land on the **Dashboard**. Top-right, make sure the **Test mode** toggle is
   ON for everything below. (It's usually on by default for new accounts.)

You do NOT need to finish "Activate your account" / business details to build and
test. Skip any "complete your profile" nags for now.

---

## Step 2 — Business + bank details  ⏳ before launch, NOT now

This is the only slow part (Stripe may verify your identity). It's required only
to switch from test mode to **live mode** (real cards). Do it whenever; it does
not block building. When you're ready: Dashboard → "Activate payments" / "Complete
your profile" → fill in legal name, address, and a payout bank account.

---

## Step 3 — Create the 4 coin packs  ✅ do today (test mode)

In the dashboard left menu: **Product catalog** (older UIs: **Products**).
For EACH row in the table below, click **+ Add product** and fill in:

- **Name** — exactly as shown
- **Price** — the dollar amount
- **Billing** — choose **One time** (NOT "Recurring"). THIS IS THE IMPORTANT ONE.
- Currency — USD
- Leave everything else default; click **Add product** / **Save**.

| Product name           | Price (One time) | Coins it grants |
|------------------------|------------------|-----------------|
| Booster Pack           | $4.99            | 50              |
| EQ Starter Pack        | $19.99           | 250             |
| EQ Skill Builder Pack  | $49.99           | 750             |
| EQ Skill Master Pack   | $99.99           | 1,500           |

> The "coins it grants" number is NOT typed into Stripe — Stripe only knows the
> dollar price. The coin amount lives in your app's code, matched to each Price ID.
> Just make sure you create exactly these 4 prices.

### After creating each product — copy its Price ID
1. Click the product you just made.
2. In the **Pricing** section, find the price row → click the **`...`** menu (or
   the price itself) → **Copy price ID**. It looks like `price_1ABc23...`.
3. Paste it into a scratch note next to the pack name. You'll have 4 of these.

---

## Step 4 — Get your secret API key  ✅ do today

1. Left menu → **Developers** → **API keys** (newer UI: top-right **Developers**
   button → **API keys**).
2. Confirm **Test mode** is on (the keys will start with `sk_test_`).
3. Under **Secret key**, click **Reveal**, then copy it. Starts with `sk_test_...`.

🔒 Treat this like a password. Don't paste it in chat, email, or screenshots.
You'll put it in an environment variable (Claude will tell you exactly where).

---

## Step 5 — Set up the webhook  ⏸️ DO LAST, after B2 code ships

The webhook is Stripe calling your app back after a payment. There are TWO
separate webhook setups, with TWO different secrets, for TWO environments — and
mixing them up is the #1 way to get silent 400 failures. Pick by where you're
testing:

### CRITICAL RULE — secret must match the environment that RECEIVES the events
| Testing against            | How you get the secret                          | Where that secret goes |
|----------------------------|-------------------------------------------------|------------------------|
| **Local** (`npm run dev`)  | Stripe **CLI**: `stripe listen` prints a `whsec_` | **`.env.local`**        |
| **Deployed** (Vercel)      | **Dashboard** webhook endpoint → Signing secret  | **Vercel env vars**     |

A dashboard endpoint points at your Vercel URL, so its events go to the DEPLOYED
app — its secret belongs in **Vercel**, never in `.env.local` (Vercel never reads
`.env.local`). The CLI signs forwarded events with its OWN secret, so local
testing needs the CLI's secret, never the dashboard's. Cross them and every
webhook fails signature verification (400) with a confusing "nothing fired".

### Local first (recommended — do this once B2 is built)
1. Install the Stripe CLI (Claude will walk through this on Windows).
2. Run: `stripe listen --forward-to localhost:3000/api/payments/webhook`
3. Copy the `whsec_...` it prints → paste into **`.env.local`** as
   `STRIPE_WEBHOOK_SECRET`.
4. Keep `stripe listen` running in its own terminal while you test a purchase.

### Deployed (only after local is green)
1. Dashboard → **Developers → Webhooks → + Add endpoint**.
2. **Endpoint URL:** `https://pure-eq.vercel.app/api/payments/webhook`
3. **Events:** tick `checkout.session.completed`. → **Add endpoint**.
4. Reveal the **Signing secret** (`whsec_...`) → paste it into **Vercel → Settings
   → Environment Variables** as `STRIPE_WEBHOOK_SECRET` → **redeploy**.

> Why "do last": the `/api/payments/webhook` route does not exist until Claude
> builds B2. Until then there is nothing for either webhook to talk to, so setting
> a secret now just leaves an unused value sitting around.

---

## Step 6 — Hand the values to Claude

Come back with these (you can paste the Price IDs in chat — they're not secret;
the two `secret` values should go into env vars, so just tell Claude you have them
and Claude will tell you exactly where to put them):

- [ ] Secret API key — `sk_test_...`  (SECRET — `.env.local` + Vercel)
- [ ] Webhook signing secret — `whsec_...`  (SECRET — gotten LAST, after B2; CLI
      secret → `.env.local`, dashboard secret → Vercel; see Step 5 — never cross them)
- [ ] Price ID — Booster Pack ($4.99) — `price_...`
- [ ] Price ID — EQ Starter Pack ($19.99) — `price_...`
- [ ] Price ID — EQ Skill Builder Pack ($49.99) — `price_...`
- [ ] Price ID — EQ Skill Master Pack ($99.99) — `price_...`

Then Claude builds B2: the `/coins` page, the checkout endpoint, and the webhook
that credits coins (with replay protection so nobody is ever double-credited).

---

## Going live later (quick note, not now)

When you're ready for real money:
1. Finish Step 2 (business + bank).
2. Flip the dashboard to **live mode** and redo Steps 3–5 there (live mode has its
   own separate products, keys, and webhook — `sk_live_...`, `whsec_...`).
3. Swap the test env vars on Vercel for the live ones.

The code doesn't change — only the env-var values do.

---

## Collected values (TEST mode) — for B2 build

Founder created the 4 products + prices in Stripe **test mode** 2026-05-30.
Price IDs are NOT secret (Stripe ships them to the browser), so they live here.
The two SECRET values below stay out of the repo — env vars only.

| Pack                  | Price  | Coins | Product ID            | Price ID (test)                  |
|-----------------------|--------|-------|-----------------------|----------------------------------|
| Booster Pack          | $4.99  | 50    | prod_UcCFrWGYKSjmW3   | price_1TcxrLEfKSA4PDixk34k4Ca4   |
| EQ Starter Pack       | $19.99 | 250   | prod_UcCGBNhMVSyVma   | price_1Tcxs1EfKSA4PDix5FD8wbDV   |
| EQ Skill Builder Pack | $49.99 | 750   | prod_UcCHStPbRsBwvg   | price_1TcxsXEfKSA4PDixqc4sUviE   |
| EQ Skill Master Pack  | $99.99 | 1500  | prod_UcCIZKCdkoUiR6   | price_1TcxthEfKSA4PDixjsvM13Dn   |

**Still needed from founder before B2 code can run end-to-end (SECRET — env vars):**
- [ ] `STRIPE_SECRET_KEY` — the `sk_test_...` secret key (Developers → API keys)
- [ ] `STRIPE_WEBHOOK_SECRET` — the `whsec_...` signing secret (Developers →
      Webhooks → the endpoint → Signing secret). The webhook endpoint URL needs
      the live Vercel domain + `/api/payments/webhook`; can be created AFTER the
      route ships if the domain isn't settled.

> These are TEST-mode IDs. Going live = recreate products/prices in live mode and
> swap all 6 values (key, webhook secret, 4 price IDs) for their `_live_` counterparts.
