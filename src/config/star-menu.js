export const DEFAULT_STAR_MENU_ITEMS = Object.freeze([
  Object.freeze({
    id: 'busta',
    label: 'Busta',
    icon: 'busta',
    url: 'https://t.me/bustagift_xbot/app?startapp=pal1231127407',
  }),
  Object.freeze({
    id: 'tonflip',
    label: 'TonFlip',
    icon: 'tonflip',
    url: 'https://app.tonflip.tg?r=mbab62ov',
  }),
  Object.freeze({
    id: 'photify',
    label: 'Photify',
    icon: 'photify',
    url: 'https://t.me/PhotifyAIOfficialBot?start=referral_1231127407',
  }),
]);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

export function parseStarMenuItems(value, entryId = 'unknown') {
  const items = value === undefined
    ? DEFAULT_STAR_MENU_ITEMS
    : value;

  if (!Array.isArray(items) || items.length > 3) {
    throw new Error(`The star menu for entry "${entryId}" must contain at most three items.`);
  }

  const seenIds = new Set();
  return items.map((item, index) => {
    if (
      !isRecord(item)
      || typeof item.id !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(item.id)
      || typeof item.label !== 'string'
      || !item.label.trim()
      || item.label.trim().length > 32
      || hasControlCharacters(item.label)
      || typeof item.icon !== 'string'
      || !item.icon.trim()
      || Array.from(item.icon.trim()).length > 16
      || hasControlCharacters(item.icon)
      || !isSafeHttpsUrl(item.url)
    ) {
      throw new Error(`The star menu item ${index + 1} for entry "${entryId}" is invalid.`);
    }

    const id = item.id.trim();
    const normalizedId = id.toLowerCase();
    if (seenIds.has(normalizedId)) {
      throw new Error(`The star menu for entry "${entryId}" contains duplicate item IDs.`);
    }
    seenIds.add(normalizedId);

    return {
      id,
      label: item.label.trim(),
      icon: item.icon.trim(),
      url: item.url,
    };
  });
}
