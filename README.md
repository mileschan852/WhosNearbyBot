# WhosNearbyBot

A Telegram Mini App for finding nearby Telegram users — React + TypeScript SPA with a Cloudflare Worker backend and Supabase (PostgreSQL).

## Architecture

### Frontend (React SPA)
- **Stack:** React 19, TypeScript, Vite, Leaflet/react-leaflet
- **Deployed to:** GitHub Pages (via CI)
- **Config:** Production uses the Worker URL configured in the frontend source. `VITE_PAYMENT_WORKER_URL` is only for local development; no Supabase credentials are injected into or bundled with the browser app.

### Backend (Cloudflare Worker)
- **URL:** `https://whosnearbybot.mileschan852.workers.dev`
- **Worker:** `worker.js` — Telegram-authenticated profile and nearby APIs, invoice creation, payment webhooks, and admin actions.
- **Cloudflare bindings/secrets (configure outside the repository; never commit values):**
  - `BOT_A_TOKEN` — Telegram bot token for @HKMODate_bot / gaymode.
  - `BOT_B_TOKEN` — Telegram bot token for @WhosNearbyBot / default mode.
  - `SUPABASE_URL` — Supabase project URL
  - `SUPABASE_SERVICE_KEY` — server-only Supabase service-role key. Required for profile, payment, and nearby operations.
  - `TELEGRAM_WEBHOOK_SECRET` — Telegram webhook `secret_token`, checked on every payment update.
  - `TELEGRAM_BOT_TOKEN` — temporary legacy fallback for deployments that have not switched to the two bot bindings.

### Database (Supabase PostgreSQL)
- Migrations live in `supabase/migrations/` (run them in order in the Supabase SQL Editor):
  - `001_initial_schema.sql` — profiles, transactions, purchases, and initial RLS policies.
  - `002_age_enforcement_and_nearby.sql` — server-side age enforcement and Haversine nearby search.
  - `003_private_notes_and_filter_sub.sql` — private notes and filter subscriptions.
  - `004_rls_hardening.sql` and `005_webhook_secret.sql` — row-level security and webhook verification.
  - `006_app_roles.sql` and `007_app_settings.sql` — persistent admin/VIP roles and app-wide settings.
  - `008_privacy_and_payment_hardening.sql` — private profile/payment data, restricted RPC access, and atomic payment fulfillment.
  - `009_flying_messages.sql`, `010_monthly_raffle.sql`, and `011_raffle_ticket_shortfall.sql` — flying messages and monthly raffle behavior.
  - `012_seed_secondary_admin.sql` — moves the legacy secondary-admin permission into `app_roles`.

The Worker verifies Telegram `initData` and derives the caller ID and admin status itself. The browser does not read or write profile rows. Nearby results contain derived age, coarse coordinates and rounded distance, never raw birth dates or exact coordinates.

### Admin and VIP roles

Managed admin/VIP entries are stored in Supabase `public.app_roles`, not in browser state or a source-code list. The admin menu loads the list from the Worker and sends changes to authenticated Worker endpoints; the Worker writes with its server-only Supabase service key. Telegram usernames are normalized to lowercase without `@`.

The project owner remains an immutable admin. Other admin privileges, including the migrated secondary admin, come from `app_roles`. A `vip` role unlocks paid features indefinitely; time-limited VIP entitlements are separate profile data, and the global VIP window is stored in `app_settings`.

See [Admin and VIP roles in Supabase](docs/admin-vip-supabase.md) for the schema, migration order, and verification steps. No data reset is required to apply these migrations.

## Men-Only Entry (gaymode)

The app supports a `startapp=gaymode` parameter that locks the user's gender to "man" and seeking to "men". This is used by @HKMODate_bot as a dedicated men-only entry point: `https://t.me/HKMODate_bot/app?startapp=gaymode`.

### Two Entry Points

| Entry | Bot | Link | Behavior |
|-------|-----|------|----------|
| Default (botB) | @WhosNearbyBot | standard web app link | gender/seeking freely selectable |
| Gay mode (botA) | @HKMODate_bot | `https://t.me/HKMODate_bot/app?startapp=gaymode` | gender locked to "man", seeking locked to "men" (selectors disabled) |

The chat menu button on @HKMODate_bot ("Open App") opens the Mini App; the app itself detects the entry via `start_param` (`gaymode` → botA, otherwise botB). The chat button label links to @HKMOChat in gaymode and @WhosNearby in default mode.

## Features

- 📍 Grid of nearby Telegram users sorted by distance (server-side Haversine)
- 🗺️ Map view with Leaflet (free OpenStreetMap tiles, no API key)
- 👤 Profile cards with age, zodiac sign, height, weight, distance, last seen
- 🔗 Click any user to open a DM via Telegram
- ⚡ Preference tag matching (role, safety, playstyle, group size, location)
- 🎛️ Filter menu (preference tags) — subscription-gated via Telegram Stars
- 🔒 Server-side age verification (18+), hide age toggle, invisible mode — via Stars payments
- 🎟️ Monthly raffle — 100 Stars per ticket; ticket purchase requires a Telegram username
- ✨ Flying messages and login announcements
- 🛡️ Admin/VIP management backed by Supabase, with persistent roles across sessions
- 🌙 Dark theme

See the [feature guide](docs/feature-summary.md) for screenshots and explanations of the main app features.

## Telegram Stars Payments

| Feature | Price | Type |
|---------|-------|------|
| Hide Age (30 days) | 1000 XTR | `hide_age` |
| Invisible Mode (30 days) | 3000 XTR | `invisible` |
| Edit Profile Pass | 1000 XTR | `edit_profile` |
| Filter Subscription (30 days) | 1000 XTR | `change_filter` |
| Change Profile & Preferences | 1000 XTR | `change_preference` |
| Monthly raffle ticket | 100 XTR | `raffle_ticket` |

**Payment flow:** The authenticated frontend requests `POST /create-invoice` → opens the returned link with `Telegram.WebApp.openInvoice()` → Telegram sends a secret-token-protected webhook → the Worker validates the invoice and calls `apply_payment`. The database records the receipt and grants its entitlement atomically; duplicate charge IDs do not grant it twice.

Configure both bots to send payment updates to the Worker webhook and set the same `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. Apply migration 008 only after confirming the Worker has the `SUPABASE_SERVICE_KEY` binding; do not apply it before the Worker is ready to serve the private APIs.

## Development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # Build for production
```

Copy `.env.example` to `.env` and fill in the values before building.
