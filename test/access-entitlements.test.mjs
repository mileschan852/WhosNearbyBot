import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS_RECHECK_INTERVAL_MS,
  ACCESS_RECHECK_MAX_ATTEMPTS,
  ACCESS_RECHECK_TIMEOUT_MS,
  canRetryPendingPaymentCheck,
  clearPendingAccessRecheck,
  createPendingAccessRecheck,
  getMinimumFilterSubscriptionExpiry,
  getMinimumPaidEntitlementExpiry,
  getPaidEntitlementOutcome,
  getActiveAccessState,
  hasFilterOptionAccess,
  hasUnresolvedPaidPurchase,
  isPaidEntitlementActive,
  isPaidEntitlementConfirmed,
  isPendingAccessConfirmed,
  loadPendingAccessRecheck,
  PENDING_ACCESS_RECHECK_STORAGE_KEY,
  savePendingAccessRecheck,
  shouldContinueAccessRechecks,
  shouldNotifyFilterAccessEnded,
  shouldNotifyFilterAccessRestored,
} from '../src/utils/access-entitlements.js';
import {
  DEFAULT_FILTER_PREFERENCES,
  getFilterPreferencesKey,
  loadFilterPreferences,
  saveFilterPreferences,
} from '../src/utils/filter-preferences-storage.js';

const now = Date.parse('2026-10-11T00:00:00.000Z');

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('temporary VIP and filter access expire exactly at their cutoff', () => {
  const access = getActiveAccessState({
    now,
    vipExpiry: now,
    filterSubUntil: now,
  });

  assert.equal(access.temporaryVipActive, false);
  assert.equal(access.filterSubscriptionActive, false);
  assert.equal(access.paidUnlocked, false);
  assert.equal(access.filterAccessActive, false);
});

test('an active filter subscription enables filters without granting VIP features', () => {
  const access = getActiveAccessState({
    now,
    filterSubUntil: now + 60_000,
  });

  assert.equal(access.filterSubscriptionActive, true);
  assert.equal(access.paidUnlocked, false);
  assert.equal(access.filterAccessActive, true);
});

test('VIP, global VIP, and admin continue to unlock filters after a filter subscription ends', () => {
  assert.equal(getActiveAccessState({ now, vipExpiry: now + 60_000 }).filterAccessActive, true);
  assert.equal(getActiveAccessState({ now, globalVipUntil: now + 60_000 }).filterAccessActive, true);
  assert.equal(getActiveAccessState({ now, isAdmin: true }).filterAccessActive, true);
});

test('Telegram Premium unlocks only Hide non-matching users without app filter access', () => {
  const telegramPremiumOnly = { filterAccessActive: false, telegramPremium: true };

  assert.equal(hasFilterOptionAccess('hideNonMatching', telegramPremiumOnly), true);
  assert.equal(hasFilterOptionAccess('age', telegramPremiumOnly), false);
  assert.equal(hasFilterOptionAccess('height', telegramPremiumOnly), false);
  assert.equal(hasFilterOptionAccess('prefMatcher', telegramPremiumOnly), false);
  assert.equal(hasFilterOptionAccess('hideNonMatching', { filterAccessActive: false }), false);
  assert.equal(hasFilterOptionAccess('age', { filterAccessActive: true }), true);
});

test('a permanent VIP role remains active independently of a separate expiring VIP grant', () => {
  const access = getActiveAccessState({
    now,
    isVipRole: true,
    vipExpiry: now - 60_000,
  });

  assert.equal(access.paidUnlocked, true);
  assert.equal(access.filterAccessActive, true);
});

test('filter access expiry notices only fire on an active-to-inactive transition for the same account', () => {
  const activeAccount = { accountId: 'tg_101', active: true };
  const expiredAccount = { accountId: 'tg_101', active: false };

  assert.equal(shouldNotifyFilterAccessEnded(activeAccount, expiredAccount), true);
  assert.equal(
    shouldNotifyFilterAccessEnded(expiredAccount, expiredAccount),
    false,
    'the same expiry does not trigger a repeated notice',
  );
  assert.equal(
    shouldNotifyFilterAccessEnded({ accountId: null, active: false }, expiredAccount),
    false,
    'first load without active access is not an expiry event',
  );
  assert.equal(
    shouldNotifyFilterAccessEnded(activeAccount, { accountId: 'tg_202', active: false }),
    false,
    'a different account does not inherit the prior account’s expiry notice',
  );
  assert.equal(
    shouldNotifyFilterAccessEnded(activeAccount, { accountId: 'tg_101', active: true }),
    false,
  );
});

test('filter access restoration notices fire after filter subscription or VIP access activates', () => {
  const inactiveAccount = { accountId: 'tg_101', active: false };
  const filterSubscriptionActive = getActiveAccessState({
    now,
    filterSubUntil: now + 60_000,
  }).filterAccessActive;
  const vipActive = getActiveAccessState({
    now,
    vipExpiry: now + 60_000,
  }).filterAccessActive;

  assert.equal(shouldNotifyFilterAccessRestored(inactiveAccount, {
    accountId: 'tg_101',
    active: filterSubscriptionActive,
  }), true, 'a confirmed filter subscription should restore access');
  assert.equal(shouldNotifyFilterAccessRestored(inactiveAccount, {
    accountId: 'tg_101',
    active: vipActive,
  }), true, 'a confirmed VIP entitlement should restore filter access');
  assert.equal(
    shouldNotifyFilterAccessRestored({ accountId: null, active: false }, {
      accountId: 'tg_101',
      active: true,
    }),
    false,
    'initial access on login is not a renewal event',
  );
  assert.equal(
    shouldNotifyFilterAccessRestored(inactiveAccount, {
      accountId: 'tg_202',
      active: true,
    }),
    false,
    'a different account does not inherit the prior account’s access event',
  );
  assert.equal(
    shouldNotifyFilterAccessRestored(
      { accountId: 'tg_101', active: true },
      { accountId: 'tg_101', active: true },
    ),
    false,
    'unchanged active access does not show another confirmation',
  );
});

test('a paid invoice stays pending until the backend profile confirms the filter subscription', () => {
  const minimumExpiry = now + 29 * 24 * 60 * 60 * 1000;
  const inactiveProfile = {
    filter_sub_expiry: new Date(now - 60_000).toISOString(),
  };

  assert.equal(isPaidEntitlementConfirmed('paid', inactiveProfile, 'filter', minimumExpiry), false);
  assert.equal(getPaidEntitlementOutcome('paid', inactiveProfile, 'filter', minimumExpiry), 'pending');
  assert.equal(
    getActiveAccessState({ now, filterSubUntil: Date.parse(inactiveProfile.filter_sub_expiry) }).filterAccessActive,
    false,
    'a Telegram paid callback does not grant access while the backend profile remains inactive',
  );
});

test('early filter renewal confirmation is anchored to the current subscription expiry', () => {
  const currentExpiry = now + 60 * 24 * 60 * 60 * 1000;
  const minimumExpiry = getMinimumFilterSubscriptionExpiry(now, currentExpiry);
  const unchangedProfile = {
    filter_sub_expiry: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const extendedProfile = {
    filter_sub_expiry: new Date(minimumExpiry).toISOString(),
  };

  assert.equal(minimumExpiry, currentExpiry + 29 * 24 * 60 * 60 * 1000);
  assert.equal(
    getPaidEntitlementOutcome('paid', unchangedProfile, 'filter', minimumExpiry),
    'pending',
    'a payment date later than today is not enough if it does not extend the existing expiry',
  );
  assert.equal(isPaidEntitlementConfirmed('paid', unchangedProfile, 'filter', minimumExpiry), false);
  assert.equal(getPaidEntitlementOutcome('paid', extendedProfile, 'filter', minimumExpiry), 'confirmed');
});

test('Hide Age and Invisibility renewal confirmations are anchored to their current pass expiry', () => {
  const currentExpiry = now + 60 * 24 * 60 * 60 * 1000;
  const minimumExpiry = getMinimumPaidEntitlementExpiry(now, currentExpiry);
  assert.equal(minimumExpiry, currentExpiry + 29 * 24 * 60 * 60 * 1000);

  const renewals = [
    {
      entitlement: 'hideAge',
      activeProfile: {
        hide_age: true,
        hide_age_expiry: new Date(currentExpiry).toISOString(),
      },
      confirmedProfile: {
        hide_age: true,
        hide_age_expiry: new Date(minimumExpiry).toISOString(),
      },
    },
    {
      entitlement: 'invisible',
      activeProfile: {
        grid_visible: false,
        invisible_expiry: new Date(currentExpiry).toISOString(),
      },
      confirmedProfile: {
        grid_visible: false,
        invisible_expiry: new Date(minimumExpiry).toISOString(),
      },
    },
  ];

  for (const renewal of renewals) {
    assert.equal(isPaidEntitlementActive(renewal.activeProfile, renewal.entitlement, now), true);
    assert.equal(
      getPaidEntitlementOutcome('paid', renewal.activeProfile, renewal.entitlement, minimumExpiry),
      'pending',
      `${renewal.entitlement} remains pending until the old expiry is extended`,
    );
    assert.equal(
      getPaidEntitlementOutcome('paid', renewal.confirmedProfile, renewal.entitlement, minimumExpiry),
      'confirmed',
    );
  }
});

test('Hide Age and Invisibility renewal actions require the matching active pass', () => {
  const currentExpiry = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const expired = new Date(now).toISOString();
  assert.equal(isPaidEntitlementActive({
    hide_age: true,
    hide_age_expiry: currentExpiry,
  }, 'hideAge', now), true);
  assert.equal(isPaidEntitlementActive({
    hide_age: false,
    hide_age_expiry: currentExpiry,
  }, 'hideAge', now), false);
  assert.equal(isPaidEntitlementActive({
    hide_age: true,
    hide_age_expiry: expired,
  }, 'hideAge', now), false);
  assert.equal(isPaidEntitlementActive({
    grid_visible: false,
    invisible_expiry: currentExpiry,
  }, 'invisible', now), true);
  assert.equal(isPaidEntitlementActive({
    grid_visible: true,
    invisible_expiry: currentExpiry,
  }, 'invisible', now), false);
  assert.equal(isPaidEntitlementActive({
    grid_visible: false,
    invisible_expiry: expired,
  }, 'invisible', now), false);
});

test('Hide Age stays pending until both the backend flag and expiry confirm the pass', () => {
  const minimumExpiry = now + 29 * 24 * 60 * 60 * 1000;
  const inactiveProfile = {
    hide_age: false,
    hide_age_expiry: new Date(now - 60_000).toISOString(),
  };
  const flagWithoutExtension = {
    hide_age: true,
    hide_age_expiry: new Date(minimumExpiry - 1).toISOString(),
  };
  const expiryWithoutFlag = {
    hide_age: false,
    hide_age_expiry: new Date(minimumExpiry).toISOString(),
  };
  const confirmedProfile = {
    hide_age: true,
    hide_age_expiry: new Date(minimumExpiry).toISOString(),
  };

  for (const profile of [inactiveProfile, flagWithoutExtension, expiryWithoutFlag]) {
    assert.equal(isPaidEntitlementConfirmed('paid', profile, 'hideAge', minimumExpiry), false);
    assert.equal(getPaidEntitlementOutcome('paid', profile, 'hideAge', minimumExpiry), 'pending');
  }
  assert.equal(isPaidEntitlementConfirmed('paid', confirmedProfile, 'hideAge', minimumExpiry), true);
  assert.equal(getPaidEntitlementOutcome('paid', confirmedProfile, 'hideAge', minimumExpiry), 'confirmed');
});

test('Invisibility stays pending until the backend hides the grid and confirms the expiry', () => {
  const minimumExpiry = now + 29 * 24 * 60 * 60 * 1000;
  const inactiveProfile = {
    grid_visible: true,
    invisible_expiry: new Date(now - 60_000).toISOString(),
  };
  const flagWithoutExtension = {
    grid_visible: false,
    invisible_expiry: new Date(minimumExpiry - 1).toISOString(),
  };
  const expiryWithoutFlag = {
    grid_visible: true,
    invisible_expiry: new Date(minimumExpiry).toISOString(),
  };
  const confirmedProfile = {
    grid_visible: false,
    invisible_expiry: new Date(minimumExpiry).toISOString(),
  };

  for (const profile of [inactiveProfile, flagWithoutExtension, expiryWithoutFlag]) {
    assert.equal(isPaidEntitlementConfirmed('paid', profile, 'invisible', minimumExpiry), false);
    assert.equal(getPaidEntitlementOutcome('paid', profile, 'invisible', minimumExpiry), 'pending');
  }
  assert.equal(isPaidEntitlementConfirmed('paid', confirmedProfile, 'invisible', minimumExpiry), true);
  assert.equal(getPaidEntitlementOutcome('paid', confirmedProfile, 'invisible', minimumExpiry), 'confirmed');
});

test('cancelled and unsupported Hide Age and Invisibility renewals cannot confirm access', () => {
  const currentExpiry = now + 60 * 24 * 60 * 60 * 1000;
  const minimumExpiry = getMinimumPaidEntitlementExpiry(now, currentExpiry);
  const profiles = {
    hideAge: {
      hide_age: true,
      hide_age_expiry: new Date(minimumExpiry).toISOString(),
    },
    invisible: {
      grid_visible: false,
      invisible_expiry: new Date(minimumExpiry).toISOString(),
    },
  };

  for (const entitlement of ['hideAge', 'invisible']) {
    for (const status of ['failed', 'cancelled', 'unsupported']) {
      assert.equal(
        isPaidEntitlementConfirmed(status, profiles[entitlement], entitlement, minimumExpiry),
        false,
        `${status} ${entitlement} checkout must not confirm access`,
      );
      assert.equal(
        getPaidEntitlementOutcome(status, profiles[entitlement], entitlement, minimumExpiry),
        status === 'unsupported' ? 'unsupported' : 'cancelled',
      );
    }
  }
});

test('cancelled and unsupported checkouts neither confirm payment nor grant filter access', () => {
  const minimumExpiry = now + 29 * 24 * 60 * 60 * 1000;
  const apparentlyActiveProfile = {
    filter_sub_expiry: new Date(minimumExpiry).toISOString(),
  };

  for (const status of ['failed', 'cancelled', 'unsupported']) {
    assert.equal(
      isPaidEntitlementConfirmed(status, apparentlyActiveProfile, 'filter', minimumExpiry),
      false,
      `${status} must not count as a confirmed purchase`,
    );
    assert.equal(
      getPaidEntitlementOutcome(status, apparentlyActiveProfile, 'filter', minimumExpiry),
      status === 'unsupported' ? 'unsupported' : 'cancelled',
    );
    assert.equal(getActiveAccessState({ now, filterSubUntil: 0 }).filterAccessActive, false);
  }
});

test('confirmed filter and VIP profile updates each show one restoration for the same account', () => {
  const minimumExpiry = now + 29 * 24 * 60 * 60 * 1000;
  const inactiveAccount = { accountId: 'tg_101', active: false };
  const filterProfile = { filter_sub_expiry: new Date(minimumExpiry).toISOString() };
  const vipProfile = { vip_expiry: new Date(minimumExpiry).toISOString() };

  assert.equal(
    getPaidEntitlementOutcome('paid', filterProfile, 'filter', minimumExpiry),
    'confirmed',
  );
  const filterAccess = getActiveAccessState({
    now,
    filterSubUntil: Date.parse(filterProfile.filter_sub_expiry),
  });
  const filterRestored = { accountId: 'tg_101', active: filterAccess.filterAccessActive };
  assert.equal(shouldNotifyFilterAccessRestored(inactiveAccount, filterRestored), true);
  assert.equal(shouldNotifyFilterAccessRestored(filterRestored, filterRestored), false);

  assert.equal(
    getPaidEntitlementOutcome('paid', vipProfile, 'vip', minimumExpiry),
    'confirmed',
  );
  const vipAccess = getActiveAccessState({
    now,
    vipExpiry: vipProfile.vip_expiry,
  });
  const vipRestored = { accountId: 'tg_101', active: vipAccess.filterAccessActive };
  assert.equal(shouldNotifyFilterAccessRestored(inactiveAccount, vipRestored), true);
  assert.equal(shouldNotifyFilterAccessRestored(vipRestored, vipRestored), false);
});

test('delayed access rechecks stop at the attempt limit or two-minute timeout', () => {
  const startedAt = now;
  assert.equal(ACCESS_RECHECK_INTERVAL_MS, 10_000);
  assert.equal(ACCESS_RECHECK_MAX_ATTEMPTS, 12);
  assert.equal(ACCESS_RECHECK_TIMEOUT_MS, 120_000);
  assert.equal(shouldContinueAccessRechecks(0, startedAt, startedAt), true);
  assert.equal(shouldContinueAccessRechecks(11, startedAt, startedAt + 119_999), true);
  assert.equal(shouldContinueAccessRechecks(12, startedAt, startedAt + 119_999), false);
  assert.equal(shouldContinueAccessRechecks(11, startedAt, startedAt + 120_000), false);
  assert.equal(shouldContinueAccessRechecks(0, startedAt, startedAt - 1), false);
});

test('paid access markers persist after automatic timeout and account changes', () => {
  const storage = createStorage();
  const marker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'hideAge',
    startedAt: now,
    minimumExpiry: now + 29 * 24 * 60 * 60 * 1000,
  }, now);

  assert.ok(marker);
  assert.equal(marker.paymentStatus, 'paid');
  assert.equal(savePendingAccessRecheck(storage, marker, now), true);
  assert.deepEqual(loadPendingAccessRecheck(storage, 'tg_101', now + 60_000), marker);
  assert.equal(canRetryPendingPaymentCheck(marker, 'tg_101', now + 60_000), false);
  assert.equal(loadPendingAccessRecheck(storage, 'tg_202', now + 60_000), null);
  assert.deepEqual(loadPendingAccessRecheck(storage, null, now + 60_000), marker);
  assert.equal(canRetryPendingPaymentCheck(marker, 'tg_202', now + ACCESS_RECHECK_TIMEOUT_MS), false);
  assert.notEqual(storage.getItem(PENDING_ACCESS_RECHECK_STORAGE_KEY), null);

  assert.equal(savePendingAccessRecheck(storage, marker, now), true);
  assert.deepEqual(
    loadPendingAccessRecheck(storage, 'tg_101', now + ACCESS_RECHECK_TIMEOUT_MS),
    marker,
  );
  assert.equal(
    canRetryPendingPaymentCheck(marker, 'tg_101', now + ACCESS_RECHECK_TIMEOUT_MS),
    true,
  );
  const restarted = createPendingAccessRecheck({
    accountId: marker.accountId,
    entitlement: marker.entitlement,
    startedAt: now + ACCESS_RECHECK_TIMEOUT_MS,
    createdAt: marker.createdAt,
    minimumExpiry: marker.minimumExpiry,
  }, now + ACCESS_RECHECK_TIMEOUT_MS);
  assert.ok(restarted);
  assert.equal(restarted.createdAt, marker.createdAt);
  assert.equal(
    canRetryPendingPaymentCheck(restarted, 'tg_101', now + ACCESS_RECHECK_TIMEOUT_MS),
    false,
  );
  assert.equal(
    canRetryPendingPaymentCheck({ ...marker, paymentStatus: 'pending' }, 'tg_101', now + ACCESS_RECHECK_TIMEOUT_MS),
    false,
  );
  const weekLater = now + 8 * 24 * 60 * 60_000;
  const persisted = loadPendingAccessRecheck(storage, 'tg_101', weekLater);
  assert.deepEqual(persisted, marker);
  assert.equal(hasUnresolvedPaidPurchase(persisted, weekLater), true);
  assert.notEqual(storage.getItem(PENDING_ACCESS_RECHECK_STORAGE_KEY), null);
});

test('paid Hide Age and Invisibility purchases stay blocked until delayed profile confirmation', () => {
  const cases = [
    {
      entitlement: 'hideAge',
      oldProfile: { hide_age: true, hide_age_expiry: new Date(now + 5 * 24 * 60 * 60_000).toISOString() },
      confirmedProfile: { hide_age: true, hide_age_expiry: new Date(now + 29 * 24 * 60 * 60_000).toISOString() },
    },
    {
      entitlement: 'invisible',
      oldProfile: { grid_visible: false, invisible_expiry: new Date(now + 5 * 24 * 60 * 60_000).toISOString() },
      confirmedProfile: { grid_visible: false, invisible_expiry: new Date(now + 29 * 24 * 60 * 60_000).toISOString() },
    },
  ];

  for (const { entitlement, oldProfile, confirmedProfile } of cases) {
    const storage = createStorage();
    const minimumExpiry = now + 29 * 24 * 60 * 60_000;
    const marker = createPendingAccessRecheck({
      accountId: 'tg_101',
      entitlement,
      startedAt: now,
      minimumExpiry,
    }, now);
    assert.ok(marker);
    assert.equal(savePendingAccessRecheck(storage, marker, now), true);

    const delayedProfile = { id: 'tg_101', ...oldProfile };
    assert.equal(getPaidEntitlementOutcome('paid', delayedProfile, entitlement, minimumExpiry), 'pending');

    const afterAutomaticRetries = now + ACCESS_RECHECK_TIMEOUT_MS + 1;
    const persisted = loadPendingAccessRecheck(storage, 'tg_101', afterAutomaticRetries);
    assert.ok(persisted);
    assert.equal(hasUnresolvedPaidPurchase(persisted, afterAutomaticRetries), true);
    assert.equal(canRetryPendingPaymentCheck(persisted, 'tg_101', afterAutomaticRetries), true);

    assert.equal(isPendingAccessConfirmed(
      persisted,
      { id: 'tg_101', ...confirmedProfile },
      afterAutomaticRetries,
    ), true);
    assert.equal(clearPendingAccessRecheck(storage, persisted), true);
    assert.equal(hasUnresolvedPaidPurchase(
      loadPendingAccessRecheck(storage, null, afterAutomaticRetries),
      afterAutomaticRetries,
    ), false);
  }
});

test('payment retry confirmation requires the matching account VIP or filter profile entitlement', () => {
  const vipMinimumExpiry = now + 60_000;
  const vipMarker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'vip',
    startedAt: now,
    minimumExpiry: vipMinimumExpiry,
  }, now);
  const vipProfile = {
    id: 'tg_101',
    vip_expiry: new Date(vipMinimumExpiry + 1_000).toISOString(),
  };
  assert.ok(vipMarker);
  assert.equal(isPendingAccessConfirmed(vipMarker, vipProfile, now), true);
  assert.equal(isPendingAccessConfirmed(vipMarker, { ...vipProfile, id: 'tg_202' }, now), false);
  assert.equal(
    isPendingAccessConfirmed(vipMarker, { id: 'tg_101', vip_expiry: new Date(now).toISOString() }, now),
    false,
  );

  const filterMinimumExpiry = now + 29 * 24 * 60 * 60 * 1_000;
  const filterMarker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'filter',
    startedAt: now,
    minimumExpiry: filterMinimumExpiry,
    location: 'filter_option',
    allowActiveRenewal: false,
  }, now);
  assert.ok(filterMarker);
  assert.equal(isPendingAccessConfirmed(filterMarker, {
    id: 'tg_101',
    filter_sub_expiry: new Date(filterMinimumExpiry + 1_000).toISOString(),
  }, now), true);
  assert.equal(isPendingAccessConfirmed(filterMarker, {
    id: 'tg_202',
    filter_sub_expiry: new Date(filterMinimumExpiry + 1_000).toISOString(),
  }, now), false);
});

test('pending filter renewal markers retain their renewal-specific verification rule', () => {
  const storage = createStorage();
  const marker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'filter',
    startedAt: now,
    minimumExpiry: now + 60 * 24 * 60 * 60 * 1000,
    location: 'active_filter_subscription',
    allowActiveRenewal: true,
  }, now);

  assert.ok(marker);
  assert.equal(savePendingAccessRecheck(storage, marker, now), true);
  assert.deepEqual(loadPendingAccessRecheck(storage, 'tg_101', now + 1_000), marker);
  assert.equal(createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'filter',
    startedAt: now,
    minimumExpiry: now + 60_000,
    location: 'unknown',
    allowActiveRenewal: true,
  }, now), null);
  assert.equal(clearPendingAccessRecheck(storage), true);
  assert.equal(storage.getItem(PENDING_ACCESS_RECHECK_STORAGE_KEY), null);
});

test('edit-profile access is confirmed only by a live Worker profile entitlement', () => {
  const minimumExpiry = now + 60_000;
  assert.equal(isPaidEntitlementConfirmed('paid', {
    edit_profile_pass: true,
    edit_profile_expiry: new Date(minimumExpiry).toISOString(),
  }, 'editProfile', minimumExpiry), true);
  assert.equal(isPaidEntitlementConfirmed('paid', {
    edit_profile_pass: false,
    edit_profile_expiry: new Date(minimumExpiry).toISOString(),
  }, 'editProfile', minimumExpiry), false);
  assert.equal(isPaidEntitlementConfirmed('paid', {
    edit_profile_pass: true,
    edit_profile_expiry: new Date(now).toISOString(),
  }, 'editProfile', minimumExpiry), false);
});

test('filter settings restore per Telegram account while VIP or filter access is active', () => {
  const storage = createStorage();
  const firstAccount = 'tg_101';
  const secondAccount = 'tg_202';
  const firstPreferences = { ...DEFAULT_FILTER_PREFERENCES, hideNonMatching: true, ageMin: 25 };
  const secondPreferences = { ...DEFAULT_FILTER_PREFERENCES, heightOn: true, heightMin: 170 };
  const vipAccess = getActiveAccessState({ now, vipExpiry: now + 60_000 });
  const filterAccess = getActiveAccessState({ now, filterSubUntil: now + 60_000 });

  assert.equal(vipAccess.filterAccessActive, true);
  assert.equal(filterAccess.filterAccessActive, true);
  assert.equal(saveFilterPreferences(storage, firstAccount, firstPreferences), true);
  assert.equal(saveFilterPreferences(storage, secondAccount, secondPreferences), true);

  // Reading again simulates the same account returning after an app reload.
  assert.deepEqual(
    loadFilterPreferences(storage, firstAccount, vipAccess.filterAccessActive),
    firstPreferences,
  );
  assert.deepEqual(
    loadFilterPreferences(storage, secondAccount, filterAccess.filterAccessActive),
    secondPreferences,
  );
  assert.notEqual(getFilterPreferencesKey(firstAccount), getFilterPreferencesKey(secondAccount));
});

test('expired access removes only that account’s saved filters and restores defaults', () => {
  const storage = createStorage();
  const firstAccount = 'tg_101';
  const secondAccount = 'tg_202';
  const firstPreferences = { ...DEFAULT_FILTER_PREFERENCES, hideNonMatching: true };
  const secondPreferences = { ...DEFAULT_FILTER_PREFERENCES, ageOn: true, ageMin: 30 };
  saveFilterPreferences(storage, firstAccount, firstPreferences);
  saveFilterPreferences(storage, secondAccount, secondPreferences);

  const expiredAccess = getActiveAccessState({ now, vipExpiry: now });
  const stillActiveAccess = getActiveAccessState({ now, filterSubUntil: now + 60_000 });
  const resetFirstAccount = loadFilterPreferences(storage, firstAccount, expiredAccess.filterAccessActive);

  assert.equal(expiredAccess.filterAccessActive, false);
  assert.deepEqual(resetFirstAccount, DEFAULT_FILTER_PREFERENCES);
  assert.equal(storage.getItem(getFilterPreferencesKey(firstAccount)), null);
  assert.deepEqual(
    loadFilterPreferences(storage, secondAccount, stillActiveAccess.filterAccessActive),
    secondPreferences,
  );
});

test('filter preferences are never stored under an anonymous shared key', () => {
  const storage = createStorage();
  assert.equal(getFilterPreferencesKey(null), null);
  assert.equal(saveFilterPreferences(storage, null, DEFAULT_FILTER_PREFERENCES), false);
});
