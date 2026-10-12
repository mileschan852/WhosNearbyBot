import test from 'node:test';
import assert from 'node:assert/strict';

import { isInvisibilityExpired, resolveGridVisibility } from '../src/utils/invisibility-expiry.js';

test('an expired invisibility pass restores grid visibility at its exact cutoff', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  assert.equal(isInvisibilityExpired(false, '2026-10-11T12:00:00.000Z', now), true);
  assert.equal(resolveGridVisibility(false, '2026-10-11T12:00:00.000Z', now), true);
});

test('active, missing, or invalid invisibility expiry does not reveal a hidden profile', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  assert.equal(resolveGridVisibility(false, '2026-10-11T12:00:01.000Z', now), false);
  assert.equal(resolveGridVisibility(false, null, now), false);
  assert.equal(resolveGridVisibility(false, 'not-a-date', now), false);
});

test('already visible profiles stay visible regardless of an old invisibility expiry', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  assert.equal(resolveGridVisibility(true, '2026-10-10T12:00:00.000Z', now), true);
});
