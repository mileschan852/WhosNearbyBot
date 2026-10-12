export type HowManyFilterValue = 'DoesntMatter' | '1on1' | 'group';

export const DEFAULT_HOW_MANY_FILTER: HowManyFilterValue;
export const HOW_MANY_FILTER_OPTIONS: readonly HowManyFilterValue[];

export function normalizeHowManyFilterValue(
  value: string | null | undefined,
): HowManyFilterValue;
export function nextHowManyFilterValue(
  value: string | null | undefined,
): HowManyFilterValue;
export function matchesHowManyFilter(
  filterValue: string | null | undefined,
  userPreference: string | null | undefined,
): boolean;
