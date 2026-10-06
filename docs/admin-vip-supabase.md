# Admin and VIP roles in Supabase

The managed admin/VIP list is stored in `public.app_roles`. Supabase is the
source of truth across browser reloads, Telegram sessions, and both bot entry
points.

## Role behavior

- `admin` grants access to admin tools and does not depend on browser-local
  state.
- `vip` unlocks paid features indefinitely but does not grant admin powers.
- Temporary VIP entitlements are separate from `app_roles`; they remain in
  profile entitlement data. Global VIP duration is stored in `app_settings`.
- The project owner remains an immutable admin and is pinned in the manager UI.
  The legacy secondary admin is stored as an `admin` row by migration 012.

## Storage and access

`006_app_roles.sql` creates `app_roles` with a normalized username primary key,
a constrained `admin`/`vip` role, a creation timestamp, username normalization,
row-level security, and the role-list read policy. Usernames are stored in
lowercase without a leading `@`.

The frontend loads the list through the Worker. Add/remove requests require
fresh, HMAC-verified Telegram `initData`; the Worker derives the caller identity
from that signed data and writes using its server-only Supabase service key.
The browser does not receive or use the service key.

The list endpoint is currently readable by clients so they can derive role
entitlements. Mutations remain admin-only and are checked by the Worker.

## Migrations

For a fresh database, apply migration files `001` through `012` in numeric order.
Migration `012_seed_secondary_admin.sql` inserts or promotes the legacy
secondary admin row in an idempotent way.

For an existing deployment where `app_roles` is missing, apply:

1. `006_app_roles.sql`
2. `012_seed_secondary_admin.sql`

These migrations create only the missing role table and seed its managed admin
row. They do not reset profiles, payments, purchases, app settings, raffle data,
or other existing records. Keep the Worker `SUPABASE_SERVICE_KEY` binding
configured for role mutations.

## Verification

After applying the migrations:

1. Confirm `public.app_roles` exists and has row-level security enabled.
2. Confirm the seeded admin role is present without printing or exporting the
   role list.
3. Confirm `GET /api/roles` returns HTTP 200.
4. Using an authenticated admin session, add a test role and remove it again;
   confirm the list refreshes after both mutations.
