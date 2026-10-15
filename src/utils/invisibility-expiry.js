export function isInvisibilityExpired(gridVisible, invisibleExpiry, now = Date.now()) {
  if (gridVisible !== false || typeof invisibleExpiry !== 'string') return false;
  const expiresAt = Date.parse(invisibleExpiry);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function resolveGridVisibility(gridVisible, invisibleExpiry, now = Date.now()) {
  return gridVisible !== false || isInvisibilityExpired(gridVisible, invisibleExpiry, now);
}

export function resolveMapVisibility(mapVisible, gridVisible, invisibleExpiry, now = Date.now()) {
  return mapVisible === true && resolveGridVisibility(gridVisible, invisibleExpiry, now);
}
