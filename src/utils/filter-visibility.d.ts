export function filterProfilesByMatchVisibility<T>(
  profiles: T[],
  hideNonMatching: boolean,
  passesFilter: (profile: T) => boolean,
): T[];
