export function filterProfilesByMatchVisibility(profiles, hideNonMatching, passesFilter) {
  return hideNonMatching ? profiles.filter(passesFilter) : profiles;
}
