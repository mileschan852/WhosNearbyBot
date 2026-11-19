# Configure a Who's Nearby GUI copy

This guide covers the public settings supported by the current GUI. Edit
`public/config.json`, validate the JSON, then run the local checks in the
repository README before deploying.

## What the config can change

The config selects a launch entry and controls presentation:

- Entry ID and display label.
- `botKey` (the registered Worker instance ID) and `profileMode`
  (`nearby` or `hkmodate`).
- Optional `useConfiguredLabelForHeader` to show the configured app name in the
  header.
- Telegram start-parameter and query-string routing between entries.
- Chat destination, TonConnect manifest URL, and up to three external Star-menu
  actions after the fixed raffle ticket.
- The four optional GUI modules: `gridFilter`, `map`, `starRaffle`, and
  `flyingMessage`. Omitted module flags default to enabled.
- Profile-setup defaults, identity lock presentation, and section order.

The current `profileSetup` options are `titleKey`, `warningKey`, `defaultGender`,
`defaultSeeking`, `lockIdentity`, and `sectionOrder`. Section order can include
`birthdate`, `identity`, `measurements`, `preferences`, and `mode`. This config
does not currently define arbitrary profile fields, custom preference tags, or
their labels.

## Production and security boundaries

`public/config.json` is public. It must not contain bot tokens, database
credentials, Worker URLs, payment rules, access grants, or private user data.
The Worker is the authority for Telegram identity, eligibility, filters,
payments, profiles, and server-side access rules. A hidden module or UI lock is
not a security control.

The stock template points to the shared production backend. A public clone does
not receive an isolated database, Worker, bot identity, or raffle. Do not change
the `botKey` to an unregistered ID and assume it will work: an additional bot
must first be registered by the backend owner. Never publish a clone that
pretends to be one of the existing production bots.

## Before publishing a clone

1. Create the copy from the `WhosNearbyBot` template.
2. Change `publish-target.json` to the clone's repository and `main` branch
   before installing dependencies.
3. Keep the existing production entry identity unless the backend owner has
   registered a separate bot instance for the clone.
4. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build`.
5. Enable GitHub Pages with GitHub Actions in the clone and verify its Actions
   deployment and live page.

## Example module settings

```json
{
  "modules": {
    "gridFilter": true,
    "map": false,
    "starRaffle": true,
    "flyingMessage": false
  }
}
```

Disabling a module hides its GUI section only; it does not erase saved data,
cancel server-side activity, or change backend permissions.
