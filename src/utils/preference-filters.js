export const FILTER_CYCLE_OPTIONS = Object.freeze({
  role: Object.freeze(['Top', 'VT', 'Versatile', 'VB', 'Bottom', 'Side', 'Off']),
  safety: Object.freeze(['Safe', 'Raw']),
  playstyle: Object.freeze(['Clean', 'Party', 'Party✓']),
  where: Object.freeze(['Host', 'Travel']),
});

export function normalizeGenderFilterValues(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => value === 'man' || value === 'woman'))];
}

export function isHkmoDateMenOnlyFilterLocked(botKey, vipAccessActive) {
  return botKey === 'botA' && vipAccessActive !== true;
}

export function getEffectiveGenderFilterValues(filterValues, botKey, vipAccessActive) {
  return isHkmoDateMenOnlyFilterLocked(botKey, vipAccessActive)
    ? ['man']
    : normalizeGenderFilterValues(filterValues);
}

export function matchesGenderFilter(filterValues, profileGender) {
  const selectedGenders = normalizeGenderFilterValues(filterValues);
  return selectedGenders.length === 0 || selectedGenders.includes(profileGender);
}

export function nextFilterCycleValue(current, options) {
  if (!current) return options[0] ?? null;
  const index = options.indexOf(current);
  return index < 0 || index === options.length - 1 ? null : options[index + 1];
}

export function matchesPlaystyleFilter(filterValue, profileValue) {
  if (!filterValue || filterValue === 'Off') return true;
  if (filterValue === 'Party') return profileValue === 'Party' || profileValue === 'Party✓';
  return filterValue === profileValue;
}
