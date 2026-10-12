import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSharedRenewalClaim,
  createFilterRenewalConfirmationReporter,
  trackEvent,
} from '../src/utils/analytics.js';
import { createPendingAccessRecheck } from '../src/utils/access-entitlements.js';

const dayMs = 24 * 60 * 60 * 1000;

function makeFilterRenewalMarker({
  accountId = 'tg_101',
  location = 'filter_expiry_notice',
  now = Date.now(),
  minimumExpiry = now + 29 * dayMs,
} = {}) {
  return createPendingAccessRecheck({
    accountId,
    entitlement: 'filter',
    startedAt: now,
    minimumExpiry,
    location,
    allowActiveRenewal: true,
  }, now);
}

function createLocalTestClaim() {
  const claims = new Set();
  return async (key) => {
    if (claims.has(key)) return false;
    claims.add(key);
    return true;
  };
}

function createFakeLockManager() {
  const tails = new Map();
  return {
    request(name, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      return previous.then(callback).finally(() => {
        release();
        if (tails.get(name) === tail) tails.delete(name);
      });
    },
  };
}

function createSharedTestStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function withWindow(value, callback) {
  const previous = globalThis.window;
  const hadWindow = Object.hasOwn(globalThis, 'window');
  globalThis.window = value;
  try {
    callback();
  } finally {
    if (hadWindow) globalThis.window = previous;
    else delete globalThis.window;
  }
}

test('trackEvent forwards a named event and bounded dimensions to Umami', () => {
  const calls = [];
  withWindow({
    umami: {
      track: (...args) => calls.push(args),
    },
  }, () => {
    trackEvent('filter_renewal_cta_clicked', { location: 'filter_expiry_notice' });
  });

  assert.deepEqual(calls, [[
    'filter_renewal_cta_clicked',
    { location: 'filter_expiry_notice' },
  ]]);
});

test('trackEvent is a no-op without Umami and swallows analytics errors', () => {
  withWindow(undefined, () => {
    assert.doesNotThrow(() => trackEvent('filter_renewal_confirmed', { location: 'filter_expiry_notice' }));
  });
  withWindow({
    umami: {
      track: () => { throw new Error('analytics unavailable'); },
    },
  }, () => {
    assert.doesNotThrow(() => trackEvent('filter_renewal_confirmed', { location: 'filter_expiry_notice' }));
  });
});

test('an immediately Worker-confirmed filter renewal emits one bounded conversion event', async () => {
  const now = Date.now();
  const marker = makeFilterRenewalMarker({
    now,
    location: 'active_filter_subscription',
  });
  const profile = {
    id: 'tg_101',
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  };
  const events = [];
  const report = createFilterRenewalConfirmationReporter((name, data) => {
    events.push({ name, data });
  }, createLocalTestClaim());

  assert.equal(await report('paid', marker, profile), true);
  assert.equal(await report('paid', marker, profile), false);
  assert.deepEqual(events, [{
    name: 'filter_renewal_confirmed',
    data: { location: 'active_filter_subscription' },
  }]);
});

test('a delayed filter renewal emits once after the matching Worker profile reaches expiry', async () => {
  const now = Date.now();
  const marker = makeFilterRenewalMarker({
    now,
    location: 'filter_expiry_notice',
  });
  const events = [];
  const report = createFilterRenewalConfirmationReporter((name, data) => {
    events.push({ name, data });
  }, createLocalTestClaim());

  assert.equal(await report('paid', marker, {
    id: 'tg_101',
    filter_sub_expiry: new Date(marker.minimumExpiry - 1).toISOString(),
  }), false);
  assert.deepEqual(events, []);

  const confirmedProfile = {
    id: 'tg_101',
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  };
  assert.equal(await report('paid', marker, confirmedProfile), true);
  assert.equal(await report('paid', marker, confirmedProfile), false);
  assert.deepEqual(events, [{
    name: 'filter_renewal_confirmed',
    data: { location: 'filter_expiry_notice' },
  }]);
});

test('two app instances concurrently report one renewal only once without sending account details', async () => {
  const marker = makeFilterRenewalMarker({ accountId: 'tg_private_101' });
  const profile = {
    id: marker.accountId,
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  };
  const events = [];
  const locks = createFakeLockManager();
  const storage = createSharedTestStorage();
  const reportFirstWindow = createFilterRenewalConfirmationReporter(
    (name, data) => events.push({ name, data }),
    createSharedRenewalClaim({ locks, storage }),
  );
  const reportSecondWindow = createFilterRenewalConfirmationReporter(
    (name, data) => events.push({ name, data }),
    createSharedRenewalClaim({ locks, storage }),
  );

  const results = await Promise.all([
    reportFirstWindow('paid', marker, profile),
    reportSecondWindow('paid', marker, profile),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(events, [{
    name: 'filter_renewal_confirmed',
    data: { location: marker.location },
  }]);
  assert.ok([...storage.values.keys()].every((key) => !key.includes(marker.accountId)));
});

test('renewal confirmation fails closed when cross-window coordination is unavailable', async () => {
  const marker = makeFilterRenewalMarker();
  const profile = {
    id: marker.accountId,
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  };
  const events = [];
  const report = createFilterRenewalConfirmationReporter(
    (name, data) => events.push({ name, data }),
    createSharedRenewalClaim({ locks: {}, storage: createSharedTestStorage() }),
  );

  assert.equal(await report('paid', marker, profile), false);
  assert.deepEqual(events, []);
});

test('cancelled or unsupported filter payments cannot emit a confirmed conversion', async () => {
  const now = Date.now();
  const marker = makeFilterRenewalMarker({ now });
  const profile = {
    id: 'tg_101',
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  };
  const events = [];
  const report = createFilterRenewalConfirmationReporter((name, data) => {
    events.push({ name, data });
  }, createLocalTestClaim());

  assert.equal(await report('cancelled', marker, profile), false);
  assert.equal(await report('unsupported', marker, profile), false);
  assert.deepEqual(events, []);
});

test('a changed account or insufficient filter expiry cannot consume the conversion', async () => {
  const now = Date.now();
  const marker = makeFilterRenewalMarker({ now, accountId: 'tg_101' });
  const events = [];
  const report = createFilterRenewalConfirmationReporter((name, data) => {
    events.push({ name, data });
  }, createLocalTestClaim());

  assert.equal(await report('paid', marker, {
    id: 'tg_202',
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  }), false);
  assert.equal(await report('paid', marker, {
    id: 'tg_101',
    filter_sub_expiry: new Date(marker.minimumExpiry - 1).toISOString(),
  }), false);
  assert.deepEqual(events, []);

  assert.equal(await report('paid', marker, {
    id: 'tg_101',
    filter_sub_expiry: new Date(marker.minimumExpiry).toISOString(),
  }), true);
  assert.deepEqual(events, [{
    name: 'filter_renewal_confirmed',
    data: { location: 'filter_expiry_notice' },
  }]);
});
