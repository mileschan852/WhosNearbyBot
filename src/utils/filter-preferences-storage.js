import { DEFAULT_HOW_MANY_FILTER } from './how-many-filter.js';

export const DEFAULT_FILTER_PREFERENCES = Object.freeze({
  hideNonMatching: false,
  ageOn: false,
  ageMin: 18,
  ageMax: 60,
  heightOn: false,
  heightMin: 140,
  heightMax: 200,
  genderVals: Object.freeze([]),
  prefMatcherOn: true,
  roleVal: null,
  safetyVal: null,
  playstyleVal: null,
  howManyVal: DEFAULT_HOW_MANY_FILTER,
  whereVal: null,
});

export function getFilterPreferencesKey(accountId) {
  if (typeof accountId !== 'string' || !accountId.trim()) return null;
  return `whos_nearby_filter_prefs:${accountId}`;
}

export function loadFilterPreferences(storage, accountId, hasAccess) {
  const key = getFilterPreferencesKey(accountId);
  if (!key) return null;
  if (!hasAccess) {
    storage.removeItem(key);
    return { ...DEFAULT_FILTER_PREFERENCES };
  }

  const raw = storage.getItem(key);
  return raw
    ? { ...DEFAULT_FILTER_PREFERENCES, ...JSON.parse(raw) }
    : { ...DEFAULT_FILTER_PREFERENCES };
}

export function saveFilterPreferences(storage, accountId, preferences) {
  const key = getFilterPreferencesKey(accountId);
  if (!key) return false;
  storage.setItem(key, JSON.stringify(preferences));
  return true;
}

export function removeFilterPreferences(storage, accountId) {
  const key = getFilterPreferencesKey(accountId);
  if (!key) return false;
  storage.removeItem(key);
  return true;
}
