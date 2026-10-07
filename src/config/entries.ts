export type AppEntryId = string;
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
  useConfiguredLabelForHeader?: boolean;
  profileSetup: {
    titleKey: string;
    warningKey: string;
    defaultGender: string;
    defaultSeeking: string;
    lockIdentity: boolean;
    sectionOrder: ProfileSetupSection[];
  };
}

export interface AppRuntimeConfig {
  version: 1;
  defaultEntryId: AppEntryId;
  defaultStartParam?: string;
  tonConnectManifestUrl: string;
  startParamEntries?: Record<string, AppEntryId>;
  queryEntries?: Record<string, Record<string, AppEntryId>>;
  entries: Record<AppEntryId, AppEntryConfig>;
}

export const DEFAULT_PROFILE_SETUP_ORDER: ProfileSetupSection[] = [
  'birthdate',
  'identity',
  'measurements',
  'preferences',
  'mode',
];

const allowedProfileSections = new Set<ProfileSetupSection>([
  'birthdate',
  'identity',
  'measurements',
  'preferences',
  'mode',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseAppRuntimeConfig(value: unknown): AppRuntimeConfig {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.defaultEntryId !== 'string'
    || !isRecord(value.entries)
    || !isHttpsUrl(value.tonConnectManifestUrl)
  ) {
    throw new Error('The app configuration is missing required settings.');
  }

  const entries: Record<AppEntryId, AppEntryConfig> = {};
  for (const [id, rawEntry] of Object.entries(value.entries)) {
    if (!isRecord(rawEntry) || !isRecord(rawEntry.profileSetup)) {
      throw new Error(`The app configuration entry "${id}" is invalid.`);
    }
    const profileSetup = rawEntry.profileSetup;
    const sectionOrder = profileSetup.sectionOrder;
    const chatUrl = rawEntry.chatUrl;
    if (
      rawEntry.id !== id
      || typeof rawEntry.label !== 'string'
      || !rawEntry.label.trim()
      || (rawEntry.botKey !== 'botA' && rawEntry.botKey !== 'botB')
      || !isHttpsUrl(chatUrl)
      || typeof profileSetup.titleKey !== 'string'
      || typeof profileSetup.warningKey !== 'string'
      || typeof profileSetup.defaultGender !== 'string'
      || typeof profileSetup.defaultSeeking !== 'string'
      || typeof profileSetup.lockIdentity !== 'boolean'
      || !Array.isArray(sectionOrder)
      || !sectionOrder.every((section) => allowedProfileSections.has(section as ProfileSetupSection))
      || (rawEntry.useConfiguredLabelForHeader !== undefined
        && typeof rawEntry.useConfiguredLabelForHeader !== 'boolean')
    ) {
      throw new Error(`The app configuration entry "${id}" has invalid values.`);
    }
    entries[id] = rawEntry as unknown as AppEntryConfig;
  }

  if (!entries[value.defaultEntryId]) {
    throw new Error('The app configuration default entry does not exist.');
  }

  let startParamEntries: Record<string, AppEntryId> | undefined;
  if (value.startParamEntries !== undefined) {
    if (!isRecord(value.startParamEntries)) {
      throw new Error('The app configuration start parameter mapping is invalid.');
    }
    startParamEntries = {};
    for (const [parameter, entryId] of Object.entries(value.startParamEntries)) {
      if (typeof entryId !== 'string' || !entries[entryId]) {
        throw new Error('The app configuration contains an entry mapping that does not exist.');
      }
      startParamEntries[parameter] = entryId;
    }
  }

  let queryEntries: Record<string, Record<string, AppEntryId>> | undefined;
  if (value.queryEntries !== undefined) {
    if (!isRecord(value.queryEntries)) {
      throw new Error('The app configuration query mapping is invalid.');
    }
    queryEntries = {};
    for (const [parameter, rawMapping] of Object.entries(value.queryEntries)) {
      if (!isRecord(rawMapping)) {
        throw new Error(`The app configuration query mapping "${parameter}" is invalid.`);
      }
      const mapping: Record<string, AppEntryId> = {};
      for (const [queryValue, entryId] of Object.entries(rawMapping)) {
        if (typeof entryId !== 'string' || !entries[entryId]) {
          throw new Error('The app configuration contains an entry mapping that does not exist.');
        }
        mapping[queryValue] = entryId;
      }
      queryEntries[parameter] = mapping;
    }
  }

  if (value.defaultStartParam !== undefined && typeof value.defaultStartParam !== 'string') {
    throw new Error('The app configuration default start parameter is invalid.');
  }

  return {
    version: 1,
    defaultEntryId: value.defaultEntryId,
    ...(typeof value.defaultStartParam === 'string' ? { defaultStartParam: value.defaultStartParam } : {}),
    tonConnectManifestUrl: value.tonConnectManifestUrl,
    ...(startParamEntries ? { startParamEntries } : {}),
    ...(queryEntries ? { queryEntries } : {}),
    entries,
  };
}

export async function loadAppRuntimeConfig(): Promise<AppRuntimeConfig> {
  const configUrl = new URL('config.json', document.baseURI);
  const response = await fetch(configUrl, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Configuration request failed (${response.status}).`);
  }
  return parseAppRuntimeConfig(await response.json());
}

export function resolveAppEntry(
  config: AppRuntimeConfig,
  startParam?: string | null,
  search = '',
): AppEntryConfig {
  if (startParam) {
    const entryId = config.startParamEntries?.[startParam];
    if (entryId && config.entries[entryId]) return config.entries[entryId];
  }

  const query = new URLSearchParams(search);
  for (const [parameter, values] of Object.entries(config.queryEntries || {})) {
    const value = query.get(parameter);
    const entryId = value ? values[value] : undefined;
    if (entryId && config.entries[entryId]) return config.entries[entryId];
  }

  return config.entries[config.defaultEntryId];
}
