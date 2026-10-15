export function resolveAppEntry(config, startParam, search = '') {
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
