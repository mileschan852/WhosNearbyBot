import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { matchesEntryGenderAccess, matchesMutualSeekingVisibility } from '../src/utils/preference-filters.js';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

function sourceBlock(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, 'missing source marker');
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'missing source end marker');
  return appSource.slice(start, end);
}

test('Who’s Nearby requires both profiles to allow visibility and fails closed on unknown values', () => {
  const cases = [
    ['woman', 'everyone', 'man', 'men', false],
    ['woman', 'everyone', 'man', 'everyone', true],
    ['man', 'women', 'woman', 'men', true],
    ['man', 'women', 'woman', 'women', false],
    ['woman', 'women', 'man', 'women', true, ['man']],
    ['woman', 'women', 'man', 'men', false, ['man']],
    ['woman', 'unknown', 'man', 'everyone', false],
    ['woman', 'everyone', 'man', 'unknown', false],
    ['unknown', 'everyone', 'man', 'everyone', false],
  ];
  for (const [viewerGender, viewerSeeking, profileGender, profileSeeking, expected, paidFilter] of cases) {
    assert.equal(matchesMutualSeekingVisibility(viewerGender, viewerSeeking, profileGender, profileSeeking, paidFilter ?? null), expected);
  }
});

test('HKMO Date keeps unpaid search men-only and does not narrow VIP access', () => {
  assert.equal(matchesEntryGenderAccess('botA', false, false, 'everyone', 'man'), true);
  assert.equal(matchesEntryGenderAccess('botA', false, false, 'everyone', 'woman'), false);
  assert.equal(matchesEntryGenderAccess('botA', false, true, 'men', 'woman'), true);
});

test('grid, map, and in-app chat share the same app eligibility guard', () => {
  const accessGuard = sourceBlock('const passesMandatoryGenderAccess = (user: UserProfile) => {', 'const checkFilterPass = (user: UserProfile) => {');
  assert.match(accessGuard, /if \(botKey === 'botB'\) \{\s*return matchesMutualSeekingVisibility\(/);
  assert.match(accessGuard, /user\.seeking/);
  assert.match(accessGuard, /return matchesEntryGenderAccess\(/);
  const chatHandler = sourceBlock('const handleStartChat = (targetUser: UserProfile) => {', 'const currentUserIsM2M =');
  assert.match(chatHandler, /if \(!checkFilterPass\(targetUser\)\) return;/);
  assert.match(appSource, /onClick=\{\(\) => handleStartChat\(activeProfile\)\}/);
  const discovery = sourceBlock('const genderEligibleUsers = users.filter(passesMandatoryGenderAccess);', 'const hasDiscoveryModule');
  assert.match(discovery, /passesMandatoryGenderAccess\(user\)/);
  assert.match(discovery, /filterProfilesByMatchVisibility\(\s*genderEligibleUsers/);
});
