export const DEFAULT_HOW_MANY_FILTER = 'DoesntMatter';

export const HOW_MANY_FILTER_OPTIONS = Object.freeze([
  DEFAULT_HOW_MANY_FILTER,
  '1on1',
  'group',
]);

const normalizeChoice = (value) => {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === '1on1') return '1on1';
  if (normalized === 'group' || normalized === 'groups') return 'group';
  return null;
};

export const normalizeHowManyFilterValue = (value) =>
  normalizeChoice(value) || DEFAULT_HOW_MANY_FILTER;

export const nextHowManyFilterValue = (value) => {
  const current = normalizeHowManyFilterValue(value);
  const currentIndex = HOW_MANY_FILTER_OPTIONS.indexOf(current);
  return HOW_MANY_FILTER_OPTIONS[(currentIndex + 1) % HOW_MANY_FILTER_OPTIONS.length];
};

export const matchesHowManyFilter = (filterValue, userPreference) => {
  const filter = normalizeHowManyFilterValue(filterValue);
  if (filter === DEFAULT_HOW_MANY_FILTER) return true;
  return normalizeChoice(userPreference) === filter;
};
