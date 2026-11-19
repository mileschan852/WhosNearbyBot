# Who's Nearby feature guide

This guide summarizes the app features and the Supabase-backed admin/VIP update.

> **Screenshot note:** Images below are illustrative UI screens rendered with fictional sample data. They are not captures of signed-in production sessions and contain no real user or admin details.

For a paginated visual version, see [feature-summary.html](feature-summary.html) or the downloadable [PDF](feature-summary.pdf).

## 1. Nearby grid

Browse nearby profiles in a card grid. Cards show derived age, rounded distance, activity, and interests; exact coordinates are not shown.

![Illustrative nearby profile grid](screenshots/nearby-grid.png)

## 2. Map view

Switch to an approximate map view to browse nearby profiles without exposing exact locations.

![Illustrative approximate map of nearby profiles](screenshots/map-view.png)

## 3. Map parties and cruising spots

Map users can host a time-limited party or suggest a cruising spot. Party details
are shown only to eligible matching viewers; the host's posting fee is separate
from any join cost shown in the details. A suggested spot becomes permanent
after distinct confirmations and otherwise expires.

![Illustrative map with nearby profiles and activity markers](screenshots/map-view.png)

## 4. Profile cards and Telegram chat

Review profile details and open a person's Telegram chat from their profile.

![Illustrative profile card and Telegram chat action](screenshots/profile-chat.png)

## 5. Interest signals

Send an interest signal from a profile card. Each viewer can send one to the
same recipient every 24 hours; the recipient sees an indicator and receives a
bot notification.

![Illustrative profile card with an interest action](screenshots/profile-chat.png)

## 6. Preference filters

Refine discovery with preferences such as role, safety, playstyle, group size, and location. Paid filter access is available through an eligible subscription or VIP status.

![Illustrative preference filter settings](screenshots/preference-filters.png)

## 7. Privacy and age controls

Eligible accounts can hide age or use invisible mode. Invisible users stay hidden from Map, while still being able to view other users there. The 18+ gate is enforced on the server; nearby results use derived ages and rounded distances.

![Illustrative privacy and age settings](screenshots/privacy-controls.png)

## 8. Telegram Stars purchases

Optional entitlements use Telegram Stars invoices. The Worker validates payment updates and records each charge idempotently. Check the live app menu for current prices.

![Illustrative Telegram Stars purchase options](screenshots/stars-purchases.png)

## 9. Monthly raffle

Tickets cost 100 Stars and require a Telegram username. The draw is at 8:00 PM Hong Kong time on the first day of each month. Four prizes are drawn: one month of VIP, filter unlock, invisible mode, and hide age. If fewer than four tickets are sold, one player receives VIP; if no tickets are sold, the prizes do not carry over. Winners are announced in four separate flying messages on login.

![Illustrative monthly raffle ticket and prize list](screenshots/monthly-raffle.png)

## 10. Flying messages

Short community messages animate across the app. Raffle results use four separate flying messages on login.

![Illustrative flying message](screenshots/flying-messages.png)

## 11. Admin and VIP management

Managed roles are stored in Supabase `public.app_roles`. The admin menu reads the list from the Worker; authenticated admin changes persist across sessions. The owner remains protected, and VIP does not grant admin access.

![Illustrative Supabase-backed admin and VIP list](screenshots/admin-vip-management.png)

Admin and VIP roles are validated and managed by the private backend; the
public GUI does not store role credentials or grant server access.
