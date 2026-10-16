import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const gridSource = readFileSync(
  new URL("../src/modules/nearby-grid/NearbyGridModule.tsx", import.meta.url),
  "utf8",
);

test("the profile-card heart sends the signed-in user's interest and consumes the cooldown response", () => {
  assert.match(appSource, /workerPostRef\.current\('\/api\/profile-interest\/send'/);
  assert.match(appSource, /recipientId:\s*targetUser\.id/);
  assert.match(appSource, /interest_cooldown_until:\s*cooldownUntil/);
  assert.match(appSource, /data-testid=\{`button-send-interest-\$\{activeProfile\.id\}`\}/);
  assert.match(appSource, /activeInterestCoolingDown/);
});

test("incoming interest appears as an accessible heart badge at the top-left of the grid photo", () => {
  assert.match(gridSource, /user\.interest_received === true/);
  assert.match(gridSource, /aria-label=\{interestLabel\}/);
  assert.match(gridSource, /top: '4px', left: '4px'/);
  assert.match(gridSource, /data-testid=\{`interest-badge-\$\{user\.id\}`\}/);
});

test("the nearby grid refreshes while the Mini App is active so other users see new signals", () => {
  assert.match(appSource, /window\.setInterval\(refreshNearby, 60_000\)/);
  assert.match(appSource, /document\.addEventListener\('visibilitychange', refreshNearby\)/);
});
