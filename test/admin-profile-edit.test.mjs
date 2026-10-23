import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const profileFormSource = readFileSync(
  new URL("../src/modules/profile-completion/ProfileCompletionModule.tsx", import.meta.url),
  "utf8",
);

test("profile-card admin action opens a modal and reads the target through the Worker", () => {
  assert.match(appSource, /data-testid="admin-edit-profile"/);
  assert.match(appSource, /workerPost\('\/api\/admin\/profile',\s*\{\s*action: 'get'/);
  assert.match(appSource, /data-testid="dialog-admin-profile-edit"/);
  assert.match(appSource, /aria-modal="true"/);
  assert.match(appSource, /profile\?\.id === targetId/);
});

test("admin edits send only editable profile fields and keep identity locked", () => {
  const fieldMapStart = appSource.indexOf('const ADMIN_EDIT_PROFILE_FIELD_MAP');
  const fieldMapEnd = appSource.indexOf('type ProfileCompletionMissingFields', fieldMapStart);
  assert.notEqual(fieldMapStart, -1);
  assert.notEqual(fieldMapEnd, -1);
  const fieldMap = appSource.slice(fieldMapStart, fieldMapEnd);
  assert.doesNotMatch(fieldMap, /\b(?:gender|seeking)\s*:/);
  assert.match(appSource, /action: 'update'[\s\S]*?profile: updates/);
  assert.match(appSource, /lockIdentityFields/);
  assert.match(profileFormSource, /disabled=\{identityFieldsLocked\}/);
});

test("the all-user action is labeled Gift update info and keeps the one-time offer flow", () => {
  assert.match(appSource, /giftUpdateInfoButton: 'Gift update info'/);
  assert.match(appSource, /data-testid="admin-gift-update-info-all"/);
  assert.match(appSource, /onClick=\{handleGiftUpdateInfoToAll\}/);
  assert.match(appSource, /workerPost\('\/api\/reset-all'\)/);
  assert.match(appSource, /birth date\/age/);
});
