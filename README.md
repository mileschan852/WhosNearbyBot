# Who's Nearby GUI

Public React/TypeScript source for the Who's Nearby Telegram Mini App interface.

## Scope

This repository's current branch contains the GUI, entry configuration, replaceable UI modules, and frontend feature guide. The Cloudflare Worker implementation, Supabase migrations, and backend tests are maintained separately in the private `dating-app-backend` repository.

The public repository's earlier commits and existing forks are not rewritten by this split and may still contain copies of the old backend source.

## GUI customization

- `src/config/entries.ts` configures the presentation and profile defaults for the two Telegram entry modes.
- `src/modules/` contains replaceable profile completion, nearby grid, map, and bottom navigation modules.
- `src/index.css` contains the app's visual styles.

These are the supported customization points. They change the interface, not the production database, raffle rules, prize pool, or server permissions. Because this source is public, a person can still edit their own fork; that does not give the fork access to production secrets or change production data. The backend continues to enforce authentication and access rules.

See [GUI modules and entry configuration](docs/gui-modules.md) for the module contracts and [the feature guide](docs/feature-summary.md) for screenshots and feature descriptions.

## Client/server boundary

The browser sends Telegram-authenticated requests to the existing Worker API. The API endpoint is an application constant, not an entry or GUI setting. Do not add Supabase service credentials or server-only business rules to this repository.

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```
