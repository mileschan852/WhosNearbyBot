export const DEFAULT_APP_MODULES = Object.freeze({
  gridFilter: true,
  map: true,
  starRaffle: true,
  flyingMessage: true,
});

const appModuleIds = Object.freeze(Object.keys(DEFAULT_APP_MODULES));

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAppModules(value) {
  if (value === undefined) return { ...DEFAULT_APP_MODULES };
  if (!isRecord(value)) {
    throw new Error('Module settings must be an object of boolean values.');
  }

  for (const [id, enabled] of Object.entries(value)) {
    if (!appModuleIds.includes(id)) {
      throw new Error(`Unknown app module "${id}".`);
    }
    if (typeof enabled !== 'boolean') {
      throw new Error(`The "${id}" module setting must be true or false.`);
    }
  }

  return { ...DEFAULT_APP_MODULES, ...value };
}

export function getDefaultDiscoveryView(modules) {
  if (modules.gridFilter) return 'grid';
  if (modules.map) return 'map';
  return null;
}
