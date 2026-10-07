export type AppEntryId = 'nearby' | 'hkmo-date';
export type AppBotKey = 'botA' | 'botB';

export type ProfileSetupSection =
  | 'birthdate'
  | 'identity'
  | 'measurements'
  | 'preferences'
  | 'mode';

export interface AppEntryConfig {
  id: AppEntryId;
  label: string;
  botKey: AppBotKey;
  chatUrl: string;
  profileSetup: {
    titleKey: string;
    warningKey: string;
    defaultGender: string;
    defaultSeeking: string;
    lockIdentity: boolean;
    sectionOrder: ProfileSetupSection[];
  };
}

export const DEFAULT_PROFILE_SETUP_ORDER: ProfileSetupSection[] = [
  'birthdate',
  'identity',
  'measurements',
  'preferences',
  'mode',
];

export const APP_ENTRIES: Record<AppEntryId, AppEntryConfig> = {
  nearby: {
    id: 'nearby',
    label: "Who's Nearby",
    botKey: 'botB',
    chatUrl: 'https://t.me/whosnearby',
    profileSetup: {
      titleKey: 'completeProfile',
      warningKey: 'profileWarning',
      defaultGender: 'man',
      defaultSeeking: 'women',
      lockIdentity: false,
      sectionOrder: [...DEFAULT_PROFILE_SETUP_ORDER],
    },
  },
  'hkmo-date': {
    id: 'hkmo-date',
    label: 'HKMO Date',
    botKey: 'botA',
    chatUrl: 'https://t.me/hkmochat',
    profileSetup: {
      titleKey: 'completeProfile',
      warningKey: 'profileWarning',
      defaultGender: 'man',
      defaultSeeking: 'men',
      lockIdentity: true,
      sectionOrder: [...DEFAULT_PROFILE_SETUP_ORDER],
    },
  },
};

export function resolveAppEntry(
  startParam?: string | null,
  search = '',
): AppEntryConfig {
  if (startParam === 'gaymode') return APP_ENTRIES['hkmo-date'];
  if (new URLSearchParams(search).get('mode') === 'gay') {
    return APP_ENTRIES['hkmo-date'];
  }
  return APP_ENTRIES.nearby;
}
