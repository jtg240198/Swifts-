# Bonus Ball — setup guide

This adds a self-serve £5/week bonus ball subscription to the site, plus a
private `owner.html` page to see who has which number and log each week's
Irish Lottery bonus ball result.

## 1. Add these files to your repo

Copy into `jtg240198/Swifts-`:
- `index.html` → replaces your current one (already has the picker + all the
  other changes from before wired in)
- `owner.html` → new file, repo root
- `netlify/functions/` → new folder, with all 7 `.js` files inside
- `netlify/functions/lib/auth.js` → keep the `lib` subfolder
- `netlify.toml` → new file, repo root
- `package.json` → new file, repo root (Netlify installs these automatically
  on deploy — you don't need to run anything locally)

## 2. Supabase — the database

1. Go to supabase.com → your existing project (the one Tactiq uses is fine,
   or create a new project if you'd rather keep this separate).
2. **SQL Editor → New query** → paste in the contents of `supabase/schema.sql`
   → Run. This creates the `bonus_numbers` table (pre-filled 1–59) and the
   `bonus_draws` table.
3. **Project Settings → API** → copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `service_role` key (NOT the `anon` key — this one bypasses the lock we
     put on the tables, so it must stay private) → this is
     `SUPABASE_SERVICE_ROLE_KEY`

## 3. Stripe — the payment

1. In Stripe Dashboard → **Product catalog** → **Add product**:
   - Name: "St James' Swifts Bonus Ball"
   - Pricing: £5.00, **Recurring**, **Weekly**
   - Save → copy the **Price ID** (starts `price_...`) → this is
     `STRIPE_BONUS_BALL_PRICE_ID`
2. **Developers → API keys** → copy the **Secret key** (starts `sk_live_...`
   once you're out of test mode) → this is `STRIPE_SECRET_KEY`
3. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://st-james-swifts-fc.netlify.app/.netlify/functions/stripe-webhook`
   - Events to send: `checkout.session.completed`, `customer.subscription.deleted`,
     `customer.subscription.updated`
   - Save → copy the **Signing secret** (starts `whsec_...`) → this is
     `STRIPE_WEBHOOK_SECRET`

Start in **test mode** first (toggle top-right in Stripe) and use a test
card (4242 4242 4242 4242, any future date/CVC) to try the full flow before
switching to live keys.

## 4. Netlify — environment variables

Site settings → **Environment variables** → add:

| Key | Value |
|---|---|
| `SUPABASE_URL` | from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2 |
| `STRIPE_SECRET_KEY` | from step 3 |
| `STRIPE_WEBHOOK_SECRET` | from step 3 |
| `STRIPE_BONUS_BALL_PRICE_ID` | from step 3 |
| `OWNER_PASSWORD` | a password only you know, for `owner.html` |
| `OWNER_TOKEN_SECRET` | any long random string (e.g. generate one at randomkeygen.com) |
| `SITE_URL` | `https://st-james-swifts-fc.netlify.app` |

Redeploy after adding these (Netlify → Deploys → Trigger deploy).

## 5. Using it

- **Public side**: the "Bonus Ball" picker sits under Events & Fundraising.
  Numbers show as free / pending (mid-checkout) / taken. Click a free number,
  fill in name + email, pay — Stripe confirms, the webhook marks it taken.
- **Owner side**: go to `yoursite.com/owner.html`, log in with
  `OWNER_PASSWORD`. Every Saturday, enter the date and that week's Irish
  Lottery bonus ball number — it tells you who won (if anyone currently
  holds that number) and you can mark the prize as paid once you've sent it.
- If someone cancels or a payment fails permanently, Stripe tells the
  webhook and their number automatically frees up again — no manual
  tidying needed.

## Notes / limits worth knowing
- A number someone starts checking out on is held for 15 minutes; if they
  abandon it, it becomes claimable again automatically.
- The winning number is whatever the **owner types in** each week — nothing
  fetches the Irish Lottery result automatically, since that would need a
  separate paid data feed. You enter it by hand once it's drawn.
- `owner.html` is a single shared password, not per-person logins — fine for
  one admin, but if you ever want separate logins for other committee
  members later, that's a bigger change (real user accounts via Supabase Auth).
