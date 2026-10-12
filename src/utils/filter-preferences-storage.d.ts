export interface FilterPreferences {
  hideNonMatching: boolean;
  ageOn: boolean;
  ageMin: number;
  ageMax: number;
  heightOn: boolean;
  heightMin: number;
  heightMax: number;
  genderVals: ('man' | 'woman')[];
  prefMatcherOn: boolean;
  roleVal: string | null;
  safetyVal: string | null;
  playstyleVal: string | null;
  howManyVal: string;
  whereVal: string | null;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_FILTER_PREFERENCES: Readonly<FilterPreferences>;
export function getFilterPreferencesKey(accountId: string | null | undefined): string | null;
export function loadFilterPreferences(
  storage: KeyValueStorage,
  accountId: string | null | undefined,
  hasAccess: boolean,
): Partial<FilterPreferences> | null;
export function saveFilterPreferences(
  storage: KeyValueStorage,
  accountId: string | null | undefined,
  preferences: FilterPreferences | Record<string, unknown>,
): boolean;
export function removeFilterPreferences(
  storage: KeyValueStorage,
  accountId: string | null | undefined,
): boolean;
