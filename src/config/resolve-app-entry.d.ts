import type { AppEntryConfig, AppRuntimeConfig } from './entries';

export function resolveAppEntry(
  config: AppRuntimeConfig,
  startParam?: string | null,
  search?: string,
): AppEntryConfig;
