# WhosNearbyBot

A Telegram Mini App — React + TypeScript SPA with a Cloudflare Worker backend.

**Backend worker URL:** `https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/287f310dcfbf`

## Features

- 📍 Shows the 100 closest Telegram users sorted by distance
- 👤 Displays user avatars, names, and distance in km
- 🟢 Green dot indicator for users active within the last 15 minutes
- 🔗 Click any user to open a DM via Telegram
- 🌙 Dark theme with Telegram theme integration (tg-theme CSS variables)
- 📱 Mobile responsive

## Telegram Stars Payments

The bot supports Telegram Stars payments for premium features:
- **Hide Age** (30 days) — 1000 XTR
- **Invisible Mode** (30 days) — 3000 XTR
- **Edit Profile Pass** — 1000 XTR

Payments API: `POST /create-invoice` (returns invoice link), `POST /telegram-webhook` (payment confirmation).
