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

function resolveProfileMode(profileModeOrBotKey) {
  if (profileModeOrBotKey === 'hkmodate' || profileModeOrBotKey === 'botA') return 'hkmodate';
  return 'nearby';
}

export function isHkmoDateMenOnlyFilterLocked(profileModeOrBotKey, vipAccessActive) {
  return resolveProfileMode(profileModeOrBotKey) === 'hkmodate' && vipAccessActive !== true;
}

export function getEffectiveGenderFilterValues(filterValues, profileModeOrBotKey, vipAccessActive) {
  return isHkmoDateMenOnlyFilterLocked(profileModeOrBotKey, vipAccessActive)
    ? ['man']
    : normalizeGenderFilterValues(filterValues);
}

export function matchesGenderFilter(filterValues, profileGender) {
  const selectedGenders = normalizeGenderFilterValues(filterValues);
  return selectedGenders.length === 0 || selectedGenders.includes(profileGender);
}

export function matchesDefaultSeekingGender(seeking, profileGender) {
  if (seeking === 'men') return profileGender === 'man';
  if (seeking === 'women') return profileGender === 'woman';
  return true;
}

export function matchesMutualSeekingVisibility(
  viewerGender,
  viewerSeeking,
  profileGender,
  profileSeeking,
  viewerGenderFilterValues = null,
) {
  const validGenders = new Set(['man', 'woman', 'non-binary']);
  const validSeekingValues = new Set(['men', 'women', 'everyone']);
  const normalizedViewerGender = typeof viewerGender === 'string' ? viewerGender.trim().toLowerCase() : '';
  const normalizedProfileGender = typeof profileGender === 'string' ? profileGender.trim().toLowerCase() : '';
  const normalizedViewerSeeking = typeof viewerSeeking === 'string' ? viewerSeeking.trim().toLowerCase() : '';
  const normalizedProfileSeeking = typeof profileSeeking === 'string' ? profileSeeking.trim().toLowerCase() : '';

  if (!validGenders.has(normalizedViewerGender) || !validGenders.has(normalizedProfileGender)) return false;
  if (!validSeekingValues.has(normalizedProfileSeeking)) return false;
  if (!Array.isArray(viewerGenderFilterValues) && !validSeekingValues.has(normalizedViewerSeeking)) return false;

  const viewerCanSeeProfile = Array.isArray(viewerGenderFilterValues)
    ? matchesGenderFilter(viewerGenderFilterValues, normalizedProfileGender)
    : matchesDefaultSeekingGender(normalizedViewerSeeking, normalizedProfileGender);
  const profileCanSeeViewer = matchesDefaultSeekingGender(normalizedProfileSeeking, normalizedViewerGender);
  return viewerCanSeeProfile && profileCanSeeViewer;
}

export function matchesEntryGenderAccess(
  profileModeOrBotKey,
  filterAccessActive,
  vipAccessActive,
  seeking,
  profileGender,
) {
  const profileMode = resolveProfileMode(profileModeOrBotKey);
  if (isHkmoDateMenOnlyFilterLocked(profileMode, vipAccessActive)) {
    return profileGender === 'man';
  }
  if (profileMode === 'nearby' && filterAccessActive !== true) {
    return matchesDefaultSeekingGender(seeking, profileGender);
  }
  return true;
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
