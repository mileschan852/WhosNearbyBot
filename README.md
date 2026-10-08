# Who's Nearby GUI

Public React/TypeScript source for the Who's Nearby Telegram Mini App interface.

## Who's Nearby is the base template

Use this repository as the default base template for new Who's Nearby-style interfaces. It is the canonical source for the shared GUI modules, styles, default entry configuration, and the stable assets consumed by HKMO Date.

HKMO Date is a separate launch shell: it keeps its own domain, Telegram entry config, wallet manifest, and small loader in `mileschan852/HKMODate`; it loads the shared GUI published by this repository. Make shared interface and module changes here. Make HKMO Date-specific entry/profile changes in that repository's `docs/config.json`.

## Scope

This repository is the shared GUI template and production host for Who's Nearby. The Cloudflare Worker implementation, Supabase migrations, and backend tests are maintained separately in the private `dating-app-backend` repository.

The public repository's earlier commits and existing forks are not rewritten by this split and may still contain copies of the old backend source.

## GUI customization

- `public/config.json` configures the Who's Nearby host's entry modes and profile-completion defaults.
- `src/config/entries.ts` validates runtime configuration and resolves Telegram start parameters to configured entries.
- `src/modules/` contains replaceable profile completion, nearby grid, map, and bottom navigation modules.
- `src/index.css` contains the app's visual styles.

Both sites load `config.json` from their own origin. The HKMO Date Pages site uses its own config and a small loader, then loads the stable shared GUI assets from this repository. This keeps both Telegram URLs and their entry-specific setup while publishing shared UI changes once.

The supported customization points change the interface, not the production database, raffle rules, prize pool, or server permissions. This source is public, so anyone can edit a fork; a fork does not receive production credentials or access to production data. The backend enforces authentication and access rules.

Read [Configuration reference](docs/configuration.md) for every supported config field, [GUI modules](docs/gui-modules.md) for module boundaries, and [the feature guide](docs/feature-summary.md) for screenshots and feature descriptions.

## Client/server boundary

The browser sends Telegram-authenticated requests to the existing Worker API. The API endpoint is an application constant, not an entry or GUI setting. Do not add Supabase service credentials or server-only business rules to this repository. Only public presentation settings belong in either site's `config.json`.

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```
