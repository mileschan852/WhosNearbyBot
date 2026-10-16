# Mobile startup baseline

Measured 2026-10-16 against the current workspace production build and the currently published GitHub Pages routes.

## Scope and limitations

This is a repeatable mobile-Chromium emulation, not a physical Telegram client test. The workspace has no Android emulator/device (`adb` is unavailable) and no usable iOS simulator (`xcrun simctl` reports that the developer root cannot be found). It therefore does not verify Android WebView or iOS WebKit behavior on real phones.

Each run used a fresh Chromium profile, disabled browser cache, a 402 × 874 mobile viewport at device scale factor 2, 4× CPU throttling, and a 400 ms RTT / 500 Kbps down / 150 Kbps up network profile. The Telegram Web App SDK was replaced with a small browser mock. Worker calls were mocked with 400 ms per-response delay; profile data and geolocation were synthetic, and no production API or database was changed. “Grid usable” means the app mounted and rendered a visible profile tile.

Run from this repository:

```sh
pnpm run build
node scripts/benchmark-mobile-startup.mjs
node scripts/benchmark-mobile-startup.mjs --pages
```

The first command sequence measures both runtime-config entries in the current workspace build (`nearby` and `hkmo-date`, using `start_param=gaymode`). `--pages` measures the current public Who’s Nearby and HKMO Date launch paths. The script prints the full request waterfall and fails if the grid does not render or if the current workspace build starts loading the wallet bundle before the grid is usable.

## Workspace build: both GUI configurations

| Configuration | App mounted | First paint | First visible profile tile | Wallet JS request | Admin/map/profile-setup chunks before first screen |
| --- | ---: | ---: | ---: | ---: | --- |
| Who’s Nearby (`nearby`) | 3.70 s | 0.99 s | **5.04 s** | 6.62 s; finished at 8.95 s | 0 |
| HKMO Date (`hkmo-date`) | 3.56 s | 0.91 s | **5.09 s** | 6.80 s; finished at 9.15 s | 0 |

The five-column grid rendered one test profile in both configurations, with no browser exceptions. The initial build made no map, payment-review, VIP-campaign, or profile-setup chunk requests. The wallet chunk began about 1.6–1.7 seconds after the visible tile; its wallet-provider image requests began later still (8.86–9.08 seconds after navigation). The UI can therefore become usable before those deferred wallet assets arrive under this test profile.

| Request from navigation start | Who’s Nearby | HKMO Date runtime entry |
| --- | ---: | ---: |
| HTML document | 0–0.49 s | 0–0.41 s |
| Main GUI JavaScript (138,096 transferred bytes) | 0.53–3.11 s | 0.43–3.01 s |
| Main CSS (1,127 transferred bytes) | 0.53–0.96 s | 0.43–0.88 s |
| `config.json` (971 transferred bytes) | 3.26–3.67 s | 3.14–3.55 s |
| Wallet module (124,355 transferred bytes) | 6.62–8.95 s | 6.80–9.15 s |
| Visible profile tile | **5.04 s** | **5.09 s** |

The current workspace build reports a 465 KB main JavaScript file (139.5 KB gzip) and a 430 KB wallet module (125.8 KB gzip). The map bundle is 191 KB; payment review, VIP campaigns, and profile completion/preview are separate lazy chunks.

## Published GitHub Pages after deployment

Measured 2026-10-16 after the GUI source and Pages workflow were published to `WhosNearbyBot/main` (commit `324585c1c783a278055edf13f250763843da26b2`; [successful Pages run](https://github.com/mileschan852/WhosNearbyBot/actions/runs/38841396942)).

| Launch path | App mounted | First visible profile tile | Wallet JS request | Wallet request after tile | Browser errors |
| --- | ---: | ---: | ---: | --- | --- |
| Who’s Nearby | 4.08 s | **5.40 s** | 6.98 s; response completed at 9.35 s | Yes | 0 |
| HKMO Date shell | 4.60 s | **6.05 s** | 7.70 s; response observed through 12.03 s | Yes | 0 |

Both routes rendered one test profile tile and now load the same shared GUI assets: `index-a8ob-Xb4.js` and `index-WnGiESmE.css`. HKMO Date’s loader marker and wrapper requests resolved to those same versioned assets on the Who’s Nearby host. The main JavaScript transfer was about 139 KB for each route.

The WalletConnect JavaScript request began after the grid was usable on both routes. No external wallet-provider image request began before the first tile (0 of 33 for either route), compared with 32–33 requests before the tile in the previous live build. The browser reported no application errors. The HKMO run’s summary completion flag for the wallet chunk remained false even though its waterfall recorded a successful 200 response ending at 12.03 s; treat that specific completion flag as a harness inconsistency, not a failed GUI request.

| Request from navigation start | Who’s Nearby | HKMO Date shell |
| --- | ---: | ---: |
| HTML | 0–0.75 s | 0–0.43 s |
| Shared build marker and wrappers | — | 0.49–1.36 s |
| Main GUI JavaScript | 0.79–3.42 s | 1.37–3.94 s |
| Main GUI CSS | 0.80–1.24 s | 1.34–1.76 s |
| Entry `config.json` | 3.56–4.06 s | 4.16–4.58 s |
| First profile tile | **5.40 s** | **6.05 s** |
| Wallet module | 6.98–9.35 s | 7.70–12.03 s |

Compared with the preceding live baseline (7.60 s for Who’s Nearby and 7.94 s for HKMO Date), the test grid appeared about 2.20 s (29%) and 1.89 s (24%) earlier, respectively. Each run used a cold browser cache; CDN cache results varied between HIT and MISS, and HKMO reused some shared assets fetched by the preceding Who’s Nearby run. Responses advertised `Cache-Control: max-age=600`.

## Conclusion

The published Pages routes now match the tested workspace bundle and show the initial grid before the wallet chunk, with no admin/map/profile-setup chunks requested on the initial user path. The mobile-Chromium harness uses a mocked Telegram SDK, Worker, profile, and location; it does not verify payments or real Telegram Android/iOS behavior. Physical Telegram Android/iOS startup remains unverified.
