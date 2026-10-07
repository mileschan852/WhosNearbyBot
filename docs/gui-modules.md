# GUI modules and entry configuration

The GUI is separated from the authenticated Worker API. Both Telegram entrances continue to use the same profile table and the same `/api/profile` contract; this customization layer changes presentation and defaults, not database ownership or prize rules.

## Entry configuration

Edit `src/config/entries.ts` to configure the existing entry modes:

- `nearby` is the standard @WhosNearbyBot entrance.
- `hkmo-date` is the `startapp=gaymode` / `?mode=gay` entrance for @HKMODate_bot.
- Each entry has its own bot key, chat destination, profile defaults, identity-control presentation, title/warning translation keys, and profile section order.

The profile setup page renders the required sections for the selected profile type. `sectionOrder` can reorder sections, but required sections are appended if omitted so the form continues to collect the values expected by the existing API. Existing saved profile values take precedence over entry defaults.

The `lockIdentity` option disables the gender and seeking selectors in that entry's UI. It is a presentation setting, not an authorization rule. Do not use a client-side setting as a security or eligibility check; any rule that must be enforced for every client belongs in the Worker.

## Replaceable UI modules

The default module exports are collected in `src/modules/index.ts`:

| Module | Source | Responsibility |
| --- | --- | --- |
| Profile completion | `src/modules/profile-completion/ProfileCompletionModule.tsx` | Renders the profile form using entry-specific configuration and controlled values. |
| Nearby grid | `src/modules/nearby-grid/NearbyGridModule.tsx` | Renders nearby user tiles; filtering and profile selection are supplied by the app. |
| Map | `src/modules/map/NearbyMapModule.tsx` | Map presentation, backed by the existing map component. |
| Bottom navigation | `src/modules/navigation/BottomNavigationModule.tsx` | Grid, chat, wallet, and map navigation presentation. |

To replace a module, keep its exported prop contract or update the import in `src/modules/index.ts` and the corresponding call site in `src/App.tsx`. Keep API requests, Telegram authentication, payment handling, role checks, profile validation, and state updates in the application/Worker layer rather than in a presentation module.

## Public GUI/private backend boundary

The current branch contains the GUI only. The Worker implementation, Supabase migrations, and backend tests are maintained in the private `dating-app-backend` repository. The browser sends Telegram-authenticated requests to the existing Worker API; its endpoint is an application constant rather than a GUI module setting. Supabase service credentials and server-side prize rules must remain in the Worker.

The supported customization surface is the entry configuration and replaceable UI modules above. Those changes do not alter the production database, raffle rules, prize pool, or server permissions. Since the GUI source is public, this cannot prevent someone from editing their own fork; a fork does not inherit production secrets or gain access to production data. Older public commits and existing forks are not rewritten by this split and may still contain old backend source.
