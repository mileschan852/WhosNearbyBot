const STORAGE_PREFIX = 'whos_nearby_daily_swipe_v2_';

export function getDailySwipeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function createDailySwipeProgress(dateKey, seenIds = [], completed = false) {
  const uniqueIds = [...new Set(
    Array.isArray(seenIds)
      ? seenIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)
      : [],
  )];
  return { dateKey, seenIds: uniqueIds, completed: completed === true };
}

export function loadDailySwipeProgress(storage, accountId, dateKey) {
  const empty = createDailySwipeProgress(dateKey);
  if (!storage || !accountId) return empty;

  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${encodeURIComponent(accountId)}`);
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    if (saved?.dateKey !== dateKey) return empty;
    return createDailySwipeProgress(dateKey, saved.seenIds, saved.completed);
  } catch {
    return empty;
  }
}

export function saveDailySwipeProgress(storage, accountId, progress) {
  if (!storage || !accountId || !progress?.dateKey) return false;

  try {
    storage.setItem(
      `${STORAGE_PREFIX}${encodeURIComponent(accountId)}`,
      JSON.stringify(createDailySwipeProgress(
        progress.dateKey,
        progress.seenIds,
        progress.completed,
      )),
    );
    return true;
  } catch {
    return false;
  }
}
