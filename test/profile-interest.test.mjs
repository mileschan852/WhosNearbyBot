import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const gridSource = readFileSync(
  new URL("../src/modules/nearby-grid/NearbyGridModule.tsx", import.meta.url),
  "utf8",
);
const swipeSource = readFileSync(
  new URL("../src/modules/nearby-grid/DailySwipeModule.tsx", import.meta.url),
  "utf8",
);

test("the profile-card heart sends the signed-in user's interest and consumes the cooldown response", () => {
  assert.match(appSource, /workerPostRef\.current\('\/api\/profile-interest\/send'/);
  assert.match(appSource, /recipientId:\s*targetUser\.id/);
  assert.match(appSource, /interest_cooldown_until:\s*cooldownUntil/);
  assert.match(appSource, /data-testid=\{`button-send-interest-\$\{activeProfile\.id\}`\}/);
  assert.match(appSource, /activeInterestCoolingDown/);
  assert.match(appSource, /formatProfileInterestCountdown/);
  assert.match(appSource, /activeInterestButtonText/);
  assert.match(appSource, /profileInterestCopy\.send.*activeInterestCountdown/);
});

test("the profile-card heart and mail actions share one responsive row", () => {
  const actionsStart = appSource.indexOf('data-testid={`profile-actions-${activeProfile.id}`}');
  const actionsEnd = appSource.indexOf('data-testid={`status-interest-${activeProfile.id}`}', actionsStart);
  assert.notEqual(actionsStart, -1);
  assert.notEqual(actionsEnd, -1);
  const actions = appSource.slice(actionsStart, actionsEnd);
  assert.match(actions, /button-send-interest-/);
  assert.match(actions, /button-message-profile-/);
  assert.ok(actions.includes('<rect x="3" y="5" width="18" height="14" rx="2" />'));
  assert.match(actions, /flex: '1 1 0'/);
});

test("admin-only profile controls retain Admin Edit without gender override", () => {
  const start = appSource.indexOf('data-testid="admin-profile-actions"');
  assert.notEqual(start, -1);
  const end = appSource.indexOf('data-testid={`profile-actions-${activeProfile.id}`}', start);
  assert.notEqual(end, -1);
  const actions = appSource.slice(start, end);
  assert.ok(actions.includes("left: '14px'"));
  assert.ok(actions.includes("flexDirection: 'row'"));
  assert.ok(actions.includes('data-testid="admin-edit-profile"'));
  assert.ok(!actions.includes('data-testid="admin-force-reset-profile"'));
  assert.ok(!actions.includes('admin-force-swap-sex'));
  assert.doesNotMatch(appSource, /handleForceSwapSex|\/api\/force-swap-sex/);
  assert.doesNotMatch(appSource, /gender-change-history|genderChangeHistory/);
});

test("Traditional Chinese uses the requested heart-button wording", () => {
  assert.match(appSource, /'zh-TW': \{\s*send: '摟屌'/);
});

test("incoming interest appears as an accessible heart badge at the top-left of the grid photo", () => {
  assert.match(gridSource, /user\.interest_received === true/);
  assert.match(gridSource, /aria-label=\{interestLabel\}/);
  assert.match(gridSource, /top: '4px', left: '4px'/);
  assert.match(gridSource, /data-testid=\{`interest-badge-\$\{user\.id\}`\}/);
});

test("the nearby grid refreshes while the Mini App is active so other users see new signals", () => {
  assert.match(appSource, /const NEARBY_REFRESH_INTERVAL_MS = 15 \* 60_000/);
  assert.match(appSource, /window\.setInterval\(refreshNearby, NEARBY_REFRESH_INTERVAL_MS\)/);
  assert.match(appSource, /document\.addEventListener\('visibilitychange', refreshNearby\)/);
});

test("Known is a private self-review, with persistent navigation lock only after confirming a meeting", () => {
  assert.match(appSource, /user\.known_review_state_known === true/);
  assert.match(appSource, /user\.known_reviewed !== true/);
  assert.doesNotMatch(appSource, /workerPostRef\.current\('\/api\/known\/request'/);
  assert.match(appSource, /\/api\/known\/review\/respond/);
  assert.match(appSource, /\/api\/known\/review\/pending/);
  assert.doesNotMatch(appSource, /workerPostRef\.current\('\/api\/known\/pending'/);
  assert.match(appSource, /\/api\/known\/respond/);
  const knownHandlerStart = appSource.indexOf('const handleStartKnownReview =');
  const knownHandlerEnd = appSource.indexOf('const markKnownSelfReviewComplete =', knownHandlerStart);
  assert.notEqual(knownHandlerStart, -1);
  assert.notEqual(knownHandlerEnd, -1);
  assert.doesNotMatch(appSource.slice(knownHandlerStart, knownHandlerEnd), /checkFilterPass/);
  assert.doesNotMatch(appSource.slice(knownHandlerStart, knownHandlerEnd), /workerPostRef/);
  assert.match(appSource, /data-testid="known-self-review-met-yes"/);
  assert.match(appSource, /data-testid="known-self-review-met-no"/);
  assert.match(appSource, /data-testid="known-self-review-recommend"/);
  assert.match(appSource, /data-testid="known-self-review-not-recommend"/);
  assert.match(appSource, /data-testid=\{`button-known-profile-\$\{activeProfile\.id\}`\}/);
  assert.match(appSource, /data-testid=\{`known-profile-actions-\$\{activeProfile\.id\}`\}/);
  assert.match(appSource, /knownProfileAction: 'I haven’t met this person'/);
  const knownActionsStart = appSource.indexOf('data-testid={`known-profile-actions-${activeProfile.id}`}');
  const knownActionsEnd = appSource.indexOf('data-testid={`status-known-${activeProfile.id}`}', knownActionsStart);
  assert.notEqual(knownActionsStart, -1);
  assert.notEqual(knownActionsEnd, -1);
  assert.doesNotMatch(appSource.slice(knownActionsStart, knownActionsEnd), /passesFilterForActive/);
  assert.match(appSource, /knownPromptDismissedIdRef\.current = pendingKnownRequest\.requestId/);
  assert.match(appSource, /knownSelfReviewRequiresLock = knownSelfReview\?\.status === 'awaiting_recommendation'/);
  assert.match(appSource, /knownRequestRequiresLock =\s*knownRequestCheckFailed \|\|\s*knownSelfReviewRequiresLock/);
  assert.match(appSource, /known-request-blocking-dialog/);
  assert.match(appSource, /aria-modal=\{knownRequestRequiresLock \? 'true' : 'false'\}/);
  assert.match(appSource, /data-testid="known-request-later"/);
  assert.match(appSource, /setPendingKnownRequest\(\{ \.\.\.pending, status: 'awaiting_recommendation' \}\)/);
  assert.match(appSource, /Saved privately\. The other person was not notified\./);
  assert.match(swipeSource, /data-testid="daily-swipe-known"/);
  assert.match(swipeSource, /advance\('known'\)/);
  assert.match(swipeSource, /daily-swipe-karma/);
  assert.match(appSource, /const appendSwipeDirectionToPrivateNote[\s\S]*?savePrivateNote\(targetId, nextNote\)/);
});

test("Map requests coordinates on demand and closes cards for stale pins", () => {
  assert.match(appSource, /includeMapCoordinates = view === 'map'/);
  assert.match(appSource, /workerPost\('\/api\/nearby', \{ mapRequest: includeMapCoordinates \}\)/);
  assert.match(appSource, /await fetchUsersData\(nextVal\)/);
  assert.match(appSource, /await fetchUsersData\(false\)/);
  assert.match(appSource, /fetchUsersDataRef\.current\?\.\(true\)/);
  assert.match(appSource, /if \(!refreshed \|\| typeof refreshed\.lat !== 'number' \|\| typeof refreshed\.lng !== 'number'\)/);
});
