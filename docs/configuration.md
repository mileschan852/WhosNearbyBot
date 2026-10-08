# Runtime configuration reference

Who's Nearby is the default base template and the source of truth for the shared GUI. Start new GUI work from `mileschan852/WhosNearbyBot`. HKMO Date keeps a separate launch URL and a site-specific config; its loader fetches the GUI assets built and published here.

## Which file to edit

| Site | Config file | What it controls |
| --- | --- | --- |
| Who's Nearby (base template and default entry) | `public/config.json` | The default Who's Nearby route and any additional routes hosted on this site. |
| HKMO Date | `docs/config.json` in `mileschan852/HKMODate` | HKMO Date's own route, profile defaults, and wallet manifest URL. |

Edit the config served from the same site as the launch page. Do not edit generated files under `dist/`. Shared interface code and styles belong in this repository; site-specific launch/profile defaults belong in that site's config.

## Route selection

The config is a JSON object with `version: 1`, a `defaultEntryId`, and an `entries` object. A request resolves to an entry in this order:

1. A matching Telegram Mini App start parameter in `startParamEntries`.
2. A matching URL query parameter/value in `queryEntries`.
3. `defaultEntryId`.

`defaultStartParam` supplies a fallback start parameter when Telegram does not provide one. It must map to an entry in `startParamEntries` to select a non-default route.

## Supported fields

### Top-level fields

| Field | Required | Type / accepted values | Meaning |
| --- | --- | --- | --- |
| `version` | Yes | Number; currently `1` | Config schema version. The runtime rejects other versions. |
| `defaultEntryId` | Yes | String matching an `entries` key | Entry used when no route mapping matches. |
| `defaultStartParam` | No | String | Fallback Telegram start parameter when launch data has no start parameter. |
| `tonConnectManifestUrl` | Yes | Absolute HTTPS URL | Public TON Connect manifest for this site. |
| `startParamEntries` | No | Object of start-param strings to entry IDs | Maps Telegram `startapp` values to entries. Each target must exist in `entries`. |
| `queryEntries` | No | Object: query parameter → value → entry ID | Maps URL query strings such as `?mode=gay` to entries. Each target must exist in `entries`. |
| `entries` | Yes | Object keyed by entry ID | Entry definitions. Each key must equal that entry's `id`. |

Unknown custom fields are not a customization mechanism. Add behavior in the shared app/module source instead.

### Entry fields

| Field | Required | Type / accepted values | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | String equal to the entry's object key | Stable identifier used by route mappings. |
| `label` | Yes | Non-empty string | Display name for this entry. |
| `botKey` | Yes | `botA` or `botB` | Internal bot identity alias recognized by the existing Worker. It is not a bot username or token. Keep the alias assigned to that entrance by the backend. Current production values are `botB` for Who's Nearby and `botA` for HKMO Date. |
| `chatUrl` | Yes | Absolute HTTPS URL | Public chat destination stored with the entry. It is currently validated but not used by the GUI to construct profile chat links. |
| `useConfiguredLabelForHeader` | No | Boolean; defaults to `false` | When `true`, the grid header uses `label`; otherwise it uses the translated generic “Who's Nearby” header. |
| `profileSetup` | Yes | Object described below | Defaults and presentation for the profile-completion screen. |

### `profileSetup` fields

| Field | Required | Type / accepted values | Meaning |
| --- | --- | --- | --- |
| `titleKey` | Yes | Existing translation key | Profile setup title. The current key is `completeProfile`. |
| `warningKey` | Yes | Existing translation key | Profile setup warning. The current key is `profileWarning`. To introduce a new key, add it to the app's translation dictionaries; an arbitrary string is not translated automatically. |
| `defaultGender` | Yes | `man`, `woman`, or `non-binary` | Initial gender for a profile with no saved gender. |
| `defaultSeeking` | Yes | `men`, `women`, or `everyone` | Initial seeking preference for a profile with no saved preference. |
| `lockIdentity` | Yes | Boolean | Disables the gender and seeking selectors in this entry's UI. This is presentation only, not authorization or a server-side rule. |
| `sectionOrder` | Yes | Array containing valid section IDs | Preferred order for `birthdate`, `identity`, `measurements`, `preferences`, and `mode`. The GUI deduplicates entries and appends omitted sections, so this setting reorders sections but does not hide them. |

Saved profile gender and seeking values take precedence over these defaults. The `lockIdentity` flag does not rewrite saved values or enforce access rules; enforcement belongs in the Worker.

## Current Who's Nearby config

This is the complete two-entry configuration currently served by the base template:

```json
{
  "version": 1,
  "defaultEntryId": "nearby",
  "tonConnectManifestUrl": "https://mileschan852.github.io/WhosNearbyBot/tonconnect-manifest.json",
  "startParamEntries": {
    "gaymode": "hkmo-date"
  },
  "queryEntries": {
    "mode": {
      "gay": "hkmo-date"
    }
  },
  "entries": {
    "nearby": {
      "id": "nearby",
      "label": "Who's Nearby",
      "botKey": "botB",
      "chatUrl": "https://t.me/whosnearby",
      "useConfiguredLabelForHeader": false,
      "profileSetup": {
        "titleKey": "completeProfile",
        "warningKey": "profileWarning",
        "defaultGender": "man",
        "defaultSeeking": "women",
        "lockIdentity": false,
        "sectionOrder": ["birthdate", "identity", "measurements", "preferences", "mode"]
      }
    },
    "hkmo-date": {
      "id": "hkmo-date",
      "label": "HKMO Date",
      "botKey": "botA",
      "chatUrl": "https://t.me/hkmochat",
      "useConfiguredLabelForHeader": true,
      "profileSetup": {
        "titleKey": "completeProfile",
        "warningKey": "profileWarning",
        "defaultGender": "man",
        "defaultSeeking": "men",
        "lockIdentity": true,
        "sectionOrder": ["birthdate", "identity", "measurements", "preferences", "mode"]
      }
    }
  }
}
```

For a single-entry HKMO Date shell, see that repo's [configuration guide](https://github.com/mileschan852/HKMODate/blob/main/docs/configuration.md).

## Editing and publishing

1. Edit `public/config.json` for the Who's Nearby site or `docs/config.json` in HKMO Date for that site.
2. Keep the file valid JSON (no comments or trailing commas), and make sure every route target matches an entry ID.
3. Keep `botKey` aligned with the existing backend mapping. Do not put bot tokens, API credentials, Supabase URLs/keys, or backend rules in public config.
4. Push the change to `main`. Who's Nearby's Pages workflow builds the shared GUI and stable asset wrappers automatically. HKMO Date publishes from `main/docs`; it does not have a second GUI build.
5. Shared GUI source, replaceable modules, and styles are changed in Who's Nearby. HKMO Date loads those published assets and may take up to 10 minutes to refresh a cached shared asset.

The runtime fetches `config.json` from the launch site's own origin without using the browser cache. A missing or invalid config displays a visible load error; it should not be left as an unhandled blank screen.

## Security boundary

These settings are public presentation and entry defaults. They cannot change the production database, payment or raffle rules, prizes, authentication, or server permissions. Never place service-role keys, bot tokens, or other secrets in either public repository. The private backend is the authority for authentication, eligibility, payments, and data access.
