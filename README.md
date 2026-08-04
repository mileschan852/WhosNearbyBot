# WhosNearbyBot

A Telegram Mini App — React + TypeScript SPA with a Cloudflare Worker backend.

**Live worker URL:** `https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/e74bb1b9bf16`

## Telegram Stars Payments

The bot supports Telegram Stars payments for premium features:
- **Hide Age** (30 days) — 1000 XTR
- **Invisible Mode** (30 days) — 3000 XTR
- **Edit Profile Pass** — 1000 XTR

Payments API: `POST /create-invoice` (returns invoice link), `POST /telegram-webhook` (payment confirmation).
