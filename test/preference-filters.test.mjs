import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILTER_CYCLE_OPTIONS,
  getEffectiveGenderFilterValues,
  isHkmoDateMenOnlyFilterLocked,
  matchesDefaultSeekingGender,
  matchesEntryGenderAccess,
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

test('unpaid Who’s Nearby users only see the sex in their seeking preference', () => {
  assert.equal(matchesDefaultSeekingGender('women', 'woman'), true);
  assert.equal(matchesDefaultSeekingGender('women', 'man'), false);
  assert.equal(matchesDefaultSeekingGender('men', 'man'), true);
  assert.equal(matchesDefaultSeekingGender('men', 'woman'), false);
  assert.equal(matchesDefaultSeekingGender('everyone', 'man'), true);
  assert.equal(matchesDefaultSeekingGender('everyone', 'woman'), true);

  assert.equal(matchesEntryGenderAccess('botB', false, false, 'women', 'woman'), true);
  assert.equal(matchesEntryGenderAccess('botB', false, false, 'women', 'man'), false);
  assert.equal(matchesEntryGenderAccess('botB', false, false, 'men', 'man'), true);
  assert.equal(matchesEntryGenderAccess('botB', false, false, 'everyone', 'woman'), true);
});

test('paid Who’s Nearby filters can override seeking defaults while HKMO Date keeps its men-only lock', () => {
  assert.equal(matchesEntryGenderAccess('botB', true, false, 'women', 'man'), true);
  assert.equal(matchesEntryGenderAccess('botA', false, false, 'women', 'man'), true);
  assert.equal(matchesEntryGenderAccess('botA', false, false, 'women', 'woman'), false);
  assert.equal(matchesEntryGenderAccess('botA', true, true, 'men', 'woman'), true);
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
