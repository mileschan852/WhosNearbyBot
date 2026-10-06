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
and row-level security. Migration `013_private_app_roles.sql` removes the
historical public read policy and revokes table- and column-level access from
`PUBLIC`, `anon`, and `authenticated`; the Worker service role retains access.
Usernames are stored in lowercase without a leading `@`.

The frontend loads the list through an admin-authenticated Worker request.
List/add/remove requests require fresh, HMAC-verified Telegram `initData`; the
Worker derives the caller identity from that signed data and accesses Supabase
using its server-only service key. The browser does not receive or use that key.
The Worker returns only the signed-in user's role from the session endpoint.

## Migrations

For a fresh database, apply migration files `001` through `013` in numeric order.
Migration `012_seed_secondary_admin.sql` inserts or promotes the legacy
secondary admin row in an idempotent way.
Migration `013_private_app_roles.sql` removes public role-list access and direct
client grants without changing or deleting any role records.

For an existing deployment where `app_roles` is missing, apply:

1. `006_app_roles.sql`
2. `012_seed_secondary_admin.sql`
3. `013_private_app_roles.sql`

These migrations create the role table if needed, seed its managed admin row,
and restrict role-table access to the Worker. They do not reset profiles,
payments, purchases, app settings, raffle data, role records, or other existing
records. Keep the Worker `SUPABASE_SERVICE_KEY` binding configured for role
reads and mutations.

## Verification

After applying the migrations:

1. Confirm `public.app_roles` exists and has row-level security enabled.
2. Confirm the seeded admin role is present without printing or exporting the
   role list.
3. Confirm direct `anon`/`authenticated` access to `app_roles` is denied.
4. Using an authenticated admin session, confirm the role list loads, add a
   test role, and remove it again; confirm the list refreshes after both
   mutations.
