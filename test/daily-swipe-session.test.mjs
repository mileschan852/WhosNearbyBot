import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDailySwipeProgress,
  getDailySwipeDateKey,
  loadDailySwipeProgress,
  saveDailySwipeProgress,
} from '../src/utils/daily-swipe-session.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('daily swipe resets at the Hong Kong calendar day boundary', () => {
  assert.equal(getDailySwipeDateKey(new Date('2026-11-18T15:59:59.000Z')), '2026-11-18');
  assert.equal(getDailySwipeDateKey(new Date('2026-11-18T16:00:00.000Z')), '2026-11-19');
});

test('daily swipe progress is isolated by account and persists seen profile IDs', () => {
  const storage = memoryStorage();
  const progress = createDailySwipeProgress('2026-11-19', ['tg_1', 'tg_2', 'tg_1']);
  assert.deepEqual(progress, {
    dateKey: '2026-11-19',
    seenIds: ['tg_1', 'tg_2'],
    completed: false,
  });
  assert.equal(saveDailySwipeProgress(storage, 'tg_viewer', progress), true);
  assert.deepEqual(loadDailySwipeProgress(storage, 'tg_viewer', '2026-11-19'), progress);
  assert.deepEqual(loadDailySwipeProgress(storage, 'tg_other', '2026-11-19'), {
    dateKey: '2026-11-19',
    seenIds: [],
    completed: false,
  });
});

test('daily swipe starts fresh on a new Hong Kong day and preserves completion for that day', () => {
  const storage = memoryStorage();
  saveDailySwipeProgress(storage, 'tg_viewer', createDailySwipeProgress('2026-11-19', ['tg_1'], true));
  assert.deepEqual(loadDailySwipeProgress(storage, 'tg_viewer', '2026-11-20'), {
    dateKey: '2026-11-20',
    seenIds: [],
    completed: false,
  });
  assert.deepEqual(loadDailySwipeProgress(storage, 'tg_viewer', '2026-11-19'), {
    dateKey: '2026-11-19',
    seenIds: ['tg_1'],
    completed: true,
  });
});

test('daily swipe progress fails safely when storage is unavailable', () => {
  assert.equal(saveDailySwipeProgress(null, 'tg_viewer', createDailySwipeProgress('2026-11-19')), false);
});
