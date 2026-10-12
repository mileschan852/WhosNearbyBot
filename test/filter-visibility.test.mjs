import test from 'node:test';
import assert from 'node:assert/strict';

import { filterProfilesByMatchVisibility } from '../src/utils/filter-visibility.js';

const profiles = [
  { id: 'match', matches: true },
  { id: 'greyed-out', matches: false },
];
const passesFilter = (profile) => profile.matches;

test('all profiles stay visible while Hide non-matching users is off', () => {
  assert.deepEqual(filterProfilesByMatchVisibility(profiles, false, passesFilter), profiles);
});

test('Hide non-matching users removes every profile that would be greyed out', () => {
  assert.deepEqual(
    filterProfilesByMatchVisibility(profiles, true, passesFilter),
    [{ id: 'match', matches: true }],
  );
});
