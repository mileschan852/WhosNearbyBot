import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_HOW_MANY_FILTER,
  HOW_MANY_FILTER_OPTIONS,
  matchesHowManyFilter,
  nextHowManyFilterValue,
  normalizeHowManyFilterValue,
} from '../src/utils/how-many-filter.js';

test('How Many filter defaults to DoesntMatter and matches every profile', () => {
  assert.equal(DEFAULT_HOW_MANY_FILTER, 'DoesntMatter');
  assert.equal(matchesHowManyFilter(DEFAULT_HOW_MANY_FILTER, '1on1'), true);
  assert.equal(matchesHowManyFilter(DEFAULT_HOW_MANY_FILTER, 'group'), true);
});

test('How Many filter cycles DoesntMatter, 1-on-1, Groups, then back to DoesntMatter', () => {
  assert.deepEqual(HOW_MANY_FILTER_OPTIONS, ['DoesntMatter', '1on1', 'group']);
  assert.equal(nextHowManyFilterValue('DoesntMatter'), '1on1');
  assert.equal(nextHowManyFilterValue('1on1'), 'group');
  assert.equal(nextHowManyFilterValue('group'), 'DoesntMatter');
});

test('legacy or invalid saved filter values reset to DoesntMatter', () => {
  assert.equal(normalizeHowManyFilterValue('Off'), 'DoesntMatter');
  assert.equal(normalizeHowManyFilterValue(null), 'DoesntMatter');
  assert.equal(normalizeHowManyFilterValue('Groups'), 'group');
});

test('1-on-1 and Groups match only profiles with the corresponding preference', () => {
  assert.equal(matchesHowManyFilter('1on1', '1-on-1'), true);
  assert.equal(matchesHowManyFilter('1on1', 'group'), false);
  assert.equal(matchesHowManyFilter('group', 'Groups'), true);
  assert.equal(matchesHowManyFilter('group', 'DoesntMatter'), false);
});
