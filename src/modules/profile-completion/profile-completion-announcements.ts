export type ProfilePreferenceCycleKey = 'role' | 'safety' | 'playstyle' | 'howMany' | 'where';

export function runProfilePreferenceCycleAnnouncement(
  preference: ProfilePreferenceCycleKey,
  cycle: () => string | null,
  t: (key: string) => string,
  whereLabel: string,
): string {
  const nextValue = cycle();
  switch (preference) {
    case 'role':
      return `${t('rolePreference')}: ${nextValue === null ? '' : t(nextValue)}`;
    case 'safety':
      return `${t('safetyPreference')}: ${nextValue === null ? '' : t(nextValue)}`;
    case 'playstyle':
      return `${t('playstylePreference')}: ${nextValue === null ? '' : t(nextValue)}`;
    case 'howMany':
      return `${t('groupSize')}: ${nextValue === null ? '' : t(`${nextValue}_setup`)}`;
    case 'where':
      return `${whereLabel}: ${nextValue === null ? t('Anywhere') : t(nextValue)}`;
  }
}
