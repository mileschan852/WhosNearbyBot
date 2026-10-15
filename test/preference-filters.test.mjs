import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILTER_CYCLE_OPTIONS,
  getEffectiveGenderFilterValues,
  isHkmoDateMenOnlyFilterLocked,
  matchesGenderFilter,
  matchesPlaystyleFilter,
  nextFilterCycleValue,
  normalizeGenderFilterValues,
} from '../src/utils/preference-filters.js';

test('gender filter defaults to all profiles and can select men or women', () => {
  assert.equal(matchesGenderFilter([], 'man'), true);
  assert.equal(matchesGenderFilter([], 'woman'), true);
  assert.equal(matchesGenderFilter([], 'non-binary'), true);
  assert.equal(matchesGenderFilter(['man'], 'man'), true);
  assert.equal(matchesGenderFilter(['man'], 'woman'), false);
  assert.equal(matchesGenderFilter(['woman'], 'woman'), true);
  assert.equal(matchesGenderFilter(['man', 'woman'], 'non-binary'), false);
});

test('HKMO Date locks non-VIP search to men without overwriting saved filters', () => {
  const savedPreference = ['woman'];
  const effectiveFilter = getEffectiveGenderFilterValues(savedPreference, 'botA', false);

  assert.equal(isHkmoDateMenOnlyFilterLocked('botA', false), true);
  assert.deepEqual(effectiveFilter, ['man']);
  assert.equal(matchesGenderFilter(effectiveFilter, 'man'), true);
  assert.equal(matchesGenderFilter(effectiveFilter, 'woman'), false);
  assert.equal(matchesGenderFilter(effectiveFilter, 'non-binary'), false);
  assert.deepEqual(savedPreference, ['woman']);
});

test('VIP users and users entering through Who’s Nearby keep their saved gender filter', () => {
  const savedPreference = ['woman'];

  assert.equal(isHkmoDateMenOnlyFilterLocked('botA', true), false);
  assert.equal(isHkmoDateMenOnlyFilterLocked('botB', false), false);
  assert.deepEqual(getEffectiveGenderFilterValues(savedPreference, 'botA', true), ['woman']);
  assert.deepEqual(getEffectiveGenderFilterValues(savedPreference, 'botB', false), ['woman']);
});

test('persisted gender filters discard invalid values and duplicates', () => {
  assert.deepEqual(
    normalizeGenderFilterValues(['woman', 'man', 'woman', 'other', null]),
    ['woman', 'man'],
  );
  assert.deepEqual(normalizeGenderFilterValues('man'), []);
});

test('Where cycles Host, Travel, and Anywhere without a duplicate Off value', () => {
  const options = FILTER_CYCLE_OPTIONS.where;
  assert.deepEqual(options, ['Host', 'Travel']);
  assert.equal(nextFilterCycleValue(null, options), 'Host');
  assert.equal(nextFilterCycleValue('Host', options), 'Travel');
  assert.equal(nextFilterCycleValue('Travel', options), null);
  assert.equal(nextFilterCycleValue(null, options), 'Host');
});

test('Safety and playstyle use Depends as their sole no-filter state', () => {
  assert.deepEqual(FILTER_CYCLE_OPTIONS.safety, ['Safe', 'Raw']);
  assert.deepEqual(FILTER_CYCLE_OPTIONS.playstyle, ['Clean', 'Party', 'Party✓']);
  assert.equal(nextFilterCycleValue('Raw', FILTER_CYCLE_OPTIONS.safety), null);
  assert.equal(nextFilterCycleValue('Party✓', FILTER_CYCLE_OPTIONS.playstyle), null);
});

test('Party matches both party profiles while Party with stuff matches Party✓ only', () => {
  assert.equal(matchesPlaystyleFilter('Party', 'Party'), true);
  assert.equal(matchesPlaystyleFilter('Party', 'Party✓'), true);
  assert.equal(matchesPlaystyleFilter('Party✓', 'Party'), false);
  assert.equal(matchesPlaystyleFilter('Party✓', 'Party✓'), true);
  assert.equal(matchesPlaystyleFilter(null, 'No Drugs'), true);
});
