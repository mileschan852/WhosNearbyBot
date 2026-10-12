export type AppModuleId = 'gridFilter' | 'map' | 'starRaffle' | 'flyingMessage';

export interface AppModules {
  gridFilter: boolean;
  map: boolean;
  starRaffle: boolean;
  flyingMessage: boolean;
}

export const DEFAULT_APP_MODULES: Readonly<AppModules>;
export function parseAppModules(value?: unknown): AppModules;
export function getDefaultDiscoveryView(modules: AppModules): 'grid' | 'map' | null;
