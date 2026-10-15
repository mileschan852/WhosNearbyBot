export const FILTER_CYCLE_OPTIONS: {
  readonly role: readonly string[];
  readonly safety: readonly string[];
  readonly playstyle: readonly string[];
  readonly where: readonly string[];
};

export type GenderFilterValue = 'man' | 'woman';

export function normalizeGenderFilterValues(values: unknown): GenderFilterValue[];

export function isHkmoDateMenOnlyFilterLocked(
  botKey: string | null | undefined,
  vipAccessActive: boolean,
): boolean;

export function getEffectiveGenderFilterValues(
  filterValues: readonly GenderFilterValue[] | null | undefined,
  botKey: string | null | undefined,
  vipAccessActive: boolean,
): GenderFilterValue[];

export function matchesGenderFilter(
  filterValues: readonly GenderFilterValue[] | null | undefined,
  profileGender: string | null | undefined,
): boolean;

export function nextFilterCycleValue(
  current: string | null,
  options: readonly string[],
): string | null;

export function matchesPlaystyleFilter(
  filterValue: string | null,
  profileValue: string | null,
): boolean;
