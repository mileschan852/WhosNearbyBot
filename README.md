# Who's Nearby GUI

Public GUI source and the default template for the Who's Nearby Telegram Mini
App. HKMO Date is a separate launch shell with its own public settings; it
loads the shared interface published here. The Worker, database, and product
rules remain in the private `dating-app-backend` repository.

## Features

See the [feature guide](docs/feature-summary.md) for screenshots and a short
description of the grid, map, filters, privacy controls, purchases, raffle,
flying messages, and admin/VIP tools.

## Start a new GUI

Use **Use this template** to create a clean copy, then edit `public/config.json`
for visible entry settings such as the Chat link, profile defaults, optional
sections, and the three star-menu actions after the fixed raffle ticket. Keep
the existing bot identity setting unchanged. Do not add credentials or
backend rules to public files. Before installing dependencies, change
`publish-target.json` to the new clone's repository so its push guard and Pages
workflow cannot target this production repository.

```bash
npm ci
npm test
npm run lint
npm run build
```

Use Node.js 20.19+ or 22.12+. Install from a Git checkout with `npm ci`; the
prepare step configures the push guard and the explicit `gui-publish` remote.
Run `npm run setup:publish-guard` again after changing the target or remotes.
For a production update, push `main` with `git push gui-publish main`.
The pre-push guard rejects a mismatched repository, an implicit main push,
deletions, and non-fast-forward updates. GitHub Actions independently verifies
that the run targets `WhosNearbyBot/main` before building or deploying Pages.
For a template copy, set the target to its own repository and `main` branch
before installing dependencies. HKMO Date's `docs/config.json` controls its own
launch settings; shared interface changes are made here.

The template changes the code history of new copies, not the access level of
this public source. Existing forks and downloaded copies are separate and are
not removed when this repository is replaced.
