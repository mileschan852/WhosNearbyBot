# WhosNearbyBot

A Telegram Mini App for finding nearby Telegram users — React + TypeScript SPA with a Cloudflare Worker backend.

## Architecture

### Frontend (React SPA)
- **Stack:** React 19, TypeScript, Vite, Tailwind CSS, Leaflet/react-leaflet
- **Deployed to:** GitHub Pages (via CI) or served alongside the worker
- **Config:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYMENT_WORKER_URL` set at build time

### Backend (Cloudflare Worker)
- **URL:** `https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/287f310dcfbf`
- **Payment Worker:** `worker.js` — handles Telegram Stars invoice creation and payment webhooks
- **Secrets (set via `wrangler secret`):**
  - `TELEGRAM_BOT_TOKEN` — bot token for @WhosNearbyBot
  - `SUPABASE_URL` — Supabase project URL
  - `SUPABASE_ANON_KEY` — Supabase anon key

### Database (Supabase PostgreSQL)
- **Table:** `profiles` — stores user profiles, preferences, and subscription flags
- Schema: `id`, `name`, `username`, `avatar`, `lat`, `lng`, `last_seen`, `gender`, `seeking`, `dob`, `height`, `weight`, `role_pref`, `safety_pref`, `playstyle_pref`, `where_pref`, `how_many_pref`, `non_man_mode`, `is_underage`, `hide_age`, `grid_visible`, `map_visible`, subscription expiry fields

## Men-Only Entry (gaymode)

The app supports a `startapp=gaymode` parameter that locks the user's gender to "man" and seeking to "men". This is used by @HKMO_D_Bot as a dedicated men-only entry point. The app is deployed at https://mileschan852.github.io/WhosNearbyBot/ and the locked entry uses `https://t.me/HKMO_D_Bot/app?startapp=gaymode`.

## Features

- 📍 Grid of nearby Telegram users sorted by distance
- 🗺️ Map view with Leaflet (CartoDB Dark Matter tiles)
- 👤 Profile cards with age, zodiac sign, height, weight, distance, last seen
- 🔗 Click any user to open a DM via Telegram
- ⚡ Preference tag matching (role, safety, playstyle, group size, location)
- 🎛️ Filter menu (age range, preference tags) — subscription-gated via Telegram Stars
- 🔒 Age verification (18+), hide age toggle, invisible mode — all via Stars payments
- 🌙 Dark theme with Telegram theme integration

## Telegram Stars Payments

The bot supports Telegram Stars payments for premium features:

| Feature | Price | Endpoint |
|---------|-------|----------|
| Hide Age (30 days) | 1000 XTR | `POST /create-invoice` (type: `hide_age`) |
| Invisible Mode (30 days) | 3000 XTR | `POST /create-invoice` (type: `invisible`) |
| Edit Profile Pass | 1000 XTR | `POST /create-invoice` (type: `edit_profile`) |
| Filter Subscription (30 days) | 1000 XTR | `POST /create-invoice` (type: `filter_sub`) |

**Payment flow:** Frontend calls `POST /create-invoice` → gets invoice link → opens via `Telegram.WebApp.openInvoice()` → Telegram sends webhook to `POST /telegram-webhook` → profile updated in Supabase.

## Development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # Build for production
```

Set env vars in `.env`:
```
VITE_SUPABASE_URL=https://fngcjkclxxodjaiqkfkm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_PAYMENT_WORKER_URL=https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/287f310dcfbf
```