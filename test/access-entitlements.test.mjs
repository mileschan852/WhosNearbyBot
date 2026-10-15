import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import { resolveAppEntry } from '../src/config/resolve-app-entry.js';
import {
  ACCESS_RECHECK_INTERVAL_MS,
  ACCESS_RECHECK_MAX_ATTEMPTS,
  ACCESS_RECHECK_TIMEOUT_MS,
  canRetryPendingPaymentCheck,
  checkPendingAccessProfile,
  clearPendingAccessRecheck,
  createPendingAccessRecheck,
  getAccessRecheckRetryDelayMs,
  getMinimumFilterSubscriptionExpiry,
  getMinimumPaidEntitlementExpiry,
  getPaidEntitlementOutcome,
  getActiveAccessState,
  getPendingAccessRecheckPhase,
  hasFilterOptionAccess,
  hasUnresolvedPaidPurchase,
  isPaidEntitlementActive,
  isPaidEntitlementConfirmed,
  isPendingAccessConfirmed,
  loadPendingAccessRecheck,
  PENDING_ACCESS_RECHECK_STORAGE_KEY,
  savePendingAccessRecheck,
  selectMostRecentPendingAccessRecheck,
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
const appRuntimeConfig = JSON.parse(
  readFileSync(new URL('../public/config.json', import.meta.url), 'utf8'),
);
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

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

function appSourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, `expected App.tsx to contain ${startMarker}`);
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, `expected App.tsx to contain ${endMarker}`);
  return appSource.slice(start, end).trim();
}

function compileAppPaymentHandlers(environment) {
  // Execute the real App.tsx handlers with only their browser and service dependencies mocked.
  const source = [
    appSourceBetween(
      'const persistPendingAccessRecheck = async (',
      '\n  const clearPendingAccessRecheck',
    ),
    appSourceBetween(
      'const clearPendingAccessRecheck = (expected?: PendingAccessRecheck | null) => {',
      '\n  const hasPendingPaymentVerification',
    ),
    appSourceBetween(
      'const hasPendingPaymentVerification = (',
      '\n  const formatAdminFailure',
    ),
    appSourceBetween(
      'const startInvoice = (invoiceLink: string): Promise<string> => {',
      '\n  const startPurchase',
    ),
    appSourceBetween(
      'const startPurchase = async (type: string) => {',
      '\n  const handleBuyRaffleTicket',
    ),
    appSourceBetween(
      'const verifyFilterSubscription = async (',
      '\n  const handleRenewFilterAccess',
    ),
    appSourceBetween(
      'const handleRenewFilterAccess = async (',
      '\n  const FILTER_SUB_KEY',
    ),
    appSourceBetween(
      'const applyOwnProfile = (profile: any) => {',
      '\n  applyOwnProfileRef.current = applyOwnProfile;',
    ),
    'applyOwnProfileRef.current = applyOwnProfile;',
    appSourceBetween(
      'const confirmPendingAccess = (marker: PendingAccessRecheck, profile: UserProfile) => {',
      '\n  confirmPendingAccessRef.current = confirmPendingAccess;',
    ),
    'confirmPendingAccessRef.current = confirmPendingAccess;',
    appSourceBetween(
      'const waitForPaidProfile = async (',
      '\n  useEffect(() => {',
    ),
    appSourceBetween(
      'const retryPendingPaymentCheck = async () => {',
      '\n  const loadFilterPrefs',
    ),
    appSourceBetween(
      'const handleRenewInvisibility = async (allowActiveRenewal = false) => {',
      '\n  const handleToggleGrid',
    ),
    appSourceBetween(
      'const handleRenewHideAge = async (allowActiveRenewal = false) => {',
      '\n  const handleHideAgeToggle',
    ),
    `this.__appPaymentHandlers = {
      startPurchase,
      verifyFilterSubscription,
      handleRenewFilterAccess,
      handleRenewInvisibility,
      handleRenewHideAge,
      retryPendingPaymentCheck,
      hasPendingPaymentVerification,
    };`,
  ].join('\n');

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  runInNewContext(transpiled, environment);
  return environment.__appPaymentHandlers;
}

function createConfirmedEntitlementProfile(accountId, entitlement, minimumExpiry) {
  const expiry = new Date(minimumExpiry + 1_000).toISOString();
  const profile = { id: accountId };
  if (entitlement === 'filter') profile.filter_sub_expiry = expiry;
  if (entitlement === 'vip') profile.vip_expiry = expiry;
  if (entitlement === 'hideAge') {
    profile.hide_age = true;
    profile.hide_age_expiry = expiry;
  }
  if (entitlement === 'invisible') {
    profile.grid_visible = false;
    profile.invisible_expiry = expiry;
  }
  if (entitlement === 'editProfile') {
    profile.edit_profile_pass = true;
    profile.edit_profile_expiry = expiry;
  }
  return profile;
}

function createAppPassFlowHarness(entitlement, clock) {
  const accountId = 'tg_101';
  const localStorage = createStorage();
  const calls = [];
  const alerts = [];
  const invoiceStatuses = ['paid', 'cancelled'];
  let backendConfirmsEntitlement = false;
  let workerProfileOverride;
  let invoiceCount = 0;
  let profileCheckCount = 0;
  let nextTimerId = 0;

  const environment = {
    Date,
    console: { error() {}, warn() {} },
    ACCESS_RECHECK_MAX_ATTEMPTS,
    ACCESS_RECHECK_TIMEOUT_MS,
    canRetryPendingPaymentCheck,
    checkPendingAccessProfile,
    clearPendingAccessRecheckStorage: clearPendingAccessRecheck,
    createPendingAccessRecheck,
    getAccessRecheckRetryDelayMs,
    getMinimumPaidEntitlementExpiry,
    getMinimumFilterSubscriptionExpiry,
    getPaidEntitlementOutcome,
    hasUnresolvedPaidPurchase,
    isPaidEntitlementActive,
    isPaidEntitlementConfirmed,
    isPendingAccessConfirmed,
    loadPendingAccessRecheck,
    savePendingAccessRecheck,
    shouldContinueAccessRechecks,
    localStorage,
    FILTER_SUB_KEY: 'test-filter-sub-until',
    FILTER_EARLY_RENEWAL_PROMPT_COPY: { en: 'Renew filter access?' },
    reportFilterRenewalConfirmed: async () => {},
    trackEvent() {},
    lang: 'en',
    raffleClock: clock.now,
    currentUser: { id: accountId },
    currentUserRef: { current: { id: accountId } },
    pendingAccessRecoveryAccountId: accountId,
    pendingAccessRecheckRef: { current: null },
    applyOwnProfileRef: { current: null },
    confirmPendingAccessRef: { current: null },
    workerPostRef: { current: null },
    filterSubUntilRef: { current: 0 },
    paidProfileVerificationInProgressRef: { current: false },
    hideAgePurchaseInProgressRef: { current: false },
    invisiblePurchaseInProgressRef: { current: false },
    filterAccessPurchaseInProgressRef: { current: false },
    accessRecheckAttemptsRef: { current: { key: '', attempts: 0 } },
    hideAge: false,
    hideAgeExpiry: null,
    gridVisible: true,
    invisibleExpiry: null,
    mapVisible: false,
    vipExpiry: null,
    paidUnlocked: false,
    filterAccessActive: false,
    filterSubscriptionActive: false,
    isPaymentRetryRunning: false,
    pendingAccessRecheck: null,
    setPendingAccessRecheck(updater) {
      environment.pendingAccessRecheck = typeof updater === 'function'
        ? updater(environment.pendingAccessRecheck)
        : updater;
    },
    setCurrentUser(updater) {
      environment.currentUser = typeof updater === 'function'
        ? updater(environment.currentUser)
        : updater;
      environment.currentUserRef.current = environment.currentUser;
    },
    setHideAge(value) { environment.hideAge = value; },
    setHideAgeExpiry(value) { environment.hideAgeExpiry = value; },
    setGridVisible(value) { environment.gridVisible = value; },
    setInvisibleExpiry(value) { environment.invisibleExpiry = value; },
    setMapVisible(value) { environment.mapVisible = value; },
    setVipExpiry(value) {
      environment.vipExpiry = value;
      environment.paidUnlocked = Date.parse(value || '') > clock.now;
      environment.filterAccessActive =
        environment.paidUnlocked || environment.filterSubscriptionActive;
    },
    setFilterSubUntil(value) {
      environment.filterSubUntil = value;
      environment.filterSubscriptionActive = value > clock.now;
      environment.filterAccessActive =
        environment.paidUnlocked || environment.filterSubscriptionActive;
    },
    setIsPaymentRetryRunning(value) { environment.isPaymentRetryRunning = value; },
    setIsFilterAccessRenewing() {},
    setIsHideAgeRenewing() {},
    setIsInvisibleRenewing() {},
    setHideAgeNotice() {},
    setInvisibleNotice() {},
    setShowProfileEditModal() {},
    setView() {},
    fetchUsersData: async () => ({}),
    enqueuePendingAccessRecoverySync: (operation) => operation(),
    t: (key) => key,
    alert: (message) => alerts.push(message),
    window: {
      confirm: () => true,
      setTimeout(callback) {
        queueMicrotask(callback);
        nextTimerId += 1;
        return nextTimerId;
      },
      clearTimeout() {},
      Telegram: {
        WebApp: {
          openInvoice(link, callback) {
            calls.push({ path: 'telegram.openInvoice', link });
            callback(invoiceStatuses.shift() ?? 'failed');
          },
        },
      },
    },
  };

  const profileForWorker = () => {
    if (workerProfileOverride !== undefined) return workerProfileOverride;
    const marker = environment.pendingAccessRecheckRef.current ??
      loadPendingAccessRecheck(localStorage, accountId, clock.now);
    const baseProfile = {
      id: accountId,
      hide_age: false,
      hide_age_expiry: null,
      grid_visible: true,
      invisible_expiry: null,
      map_visible: false,
    };
    if (!backendConfirmsEntitlement || !marker) return baseProfile;
    return {
      ...baseProfile,
      ...createConfirmedEntitlementProfile(
        accountId,
        entitlement,
        marker.minimumExpiry,
      ),
    };
  };

  environment.workerPost = async (path, body) => {
    calls.push({ path, body });
    if (path === '/create-invoice') {
      invoiceCount += 1;
      return {
        invoiceLink: `https://t.me/$pass-invoice-${invoiceCount}`,
        purchaseId: `pass-purchase-${invoiceCount}`,
      };
    }
    if (path === '/api/profile/check') {
      profileCheckCount += 1;
      return { profile: profileForWorker() };
    }
    if (path === '/api/access-recovery/save' ||
        path === '/api/access-recovery/clear' ||
        path === '/api/pass-purchase/resolve') {
      return { ok: true };
    }
    throw new Error(`Unexpected mocked Worker endpoint: ${path}`);
  };
  environment.workerPostRef.current = environment.workerPost;
  environment.queuePendingAccessRecoverySave = (marker) =>
    environment.workerPostRef.current('/api/access-recovery/save', { marker });

  const handlers = compileAppPaymentHandlers(environment);
  const handlerName = {
    hideAge: 'handleRenewHideAge',
    invisible: 'handleRenewInvisibility',
    filter: 'handleRenewFilterAccess',
  }[entitlement] ?? null;

  return {
    accountId,
    alerts,
    calls,
    environment,
    handlers,
    handlerName,
    localStorage,
    getInvoiceCount: () => invoiceCount,
    getProfileCheckCount: () => profileCheckCount,
    setBackendConfirmsEntitlement(value) {
      backendConfirmsEntitlement = value;
    },
    setWorkerProfileOverride(profile) {
      workerProfileOverride = profile;
    },
    setPendingMarker(marker) {
      environment.pendingAccessRecheckRef.current = marker;
      environment.pendingAccessRecheck = marker;
      savePendingAccessRecheck(localStorage, marker, clock.now);
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

test('429 and timeout profile checks keep the purchase pending and show a safe retry state', async () => {
  const marker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'hideAge',
    startedAt: now,
    minimumExpiry: now + 29 * 24 * 60 * 60 * 1000,
  }, now);
  assert.ok(marker);

  const rateLimited = Object.assign(new Error('Too many requests'), {
    status: 429,
    retryAfter: 30,
  });
  const timeout = new Error('The server took too long to respond.');
  for (const error of [rateLimited, timeout]) {
    const result = await checkPendingAccessProfile(
      marker,
      async () => { throw error; },
      now + 1_000,
    );
    assert.equal(result.status, 'unavailable');
    assert.equal(result.profile, null);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, error);
    assert.equal(hasUnresolvedPaidPurchase(marker, now + 1_000), true);
    assert.equal(
      getPendingAccessRecheckPhase({ ...marker, attempts: 1 }, 'tg_101', now + 1_000),
      'checking',
      'the notice remains in checking state while the bounded retry window is active',
    );
  }

  assert.equal(getAccessRecheckRetryDelayMs(rateLimited), 30_000);
  assert.equal(getAccessRecheckRetryDelayMs(timeout), 500);
  assert.equal(
    getPendingAccessRecheckPhase(
      { ...marker, attempts: ACCESS_RECHECK_MAX_ATTEMPTS },
      'tg_101',
      now + 1_000,
    ),
    'retry',
    'after automatic retries stop, the notice offers a manual check instead of success',
  );
  assert.equal(
    getAccessRecheckRetryDelayMs({ retryAfter: 500 }),
    ACCESS_RECHECK_TIMEOUT_MS,
    'a long rate-limit delay is bounded by the verification window',
  );
});

test('wrong-account and unconfirmed Worker profiles cannot confirm a paid check', async () => {
  const minimumExpiry = now + 29 * 24 * 60 * 60 * 1000;
  const marker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'hideAge',
    startedAt: now,
    minimumExpiry,
  }, now);
  assert.ok(marker);

  const profiles = [
    {
      id: 'tg_101',
      hide_age: true,
      hide_age_expiry: new Date(minimumExpiry - 1_000).toISOString(),
    },
    {
      id: 'tg_202',
      hide_age: true,
      hide_age_expiry: new Date(minimumExpiry + 1_000).toISOString(),
    },
  ];
  for (const profile of profiles) {
    const result = await checkPendingAccessProfile(
      marker,
      async () => profile,
      now + 1_000,
    );
    assert.equal(result.status, 'pending');
    assert.equal(result.confirmed, false);
    assert.equal(result.profile, profile);
  }
});

test('manual paid-access retry only reads the profile and cannot open another invoice', () => {
  const sliceBetween = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.notEqual(start, -1, `expected to find ${startMarker}`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `expected to find ${endMarker}`);
    return source.slice(start, end);
  };
  const retrySource = sliceBetween(
    appSource,
    'const retryPendingPaymentCheck = async () => {',
    '\n  const loadFilterPrefs',
  );
  const profileCheckSource = sliceBetween(
    appSource,
    'const waitForPaidProfile = async (',
    '\n  useEffect(() => {',
  );

  assert.match(retrySource, /waitForPaidProfile/);
  assert.doesNotMatch(retrySource, /create-invoice|startPurchase|startInvoice|openInvoice/);
  assert.match(profileCheckSource, /checkPendingAccessProfile/);
  assert.match(profileCheckSource, /getAccessRecheckRetryDelayMs/);
  assert.ok(profileCheckSource.includes("workerPost('/api/profile/check')"));
  assert.doesNotMatch(profileCheckSource, /create-invoice|startPurchase|startInvoice|openInvoice/);
});

test('App Hide Age and Invisibility handlers block new invoices until a Worker profile confirms access', async () => {
  const originalDateNow = Date.now;
  const clock = { now };
  Date.now = () => clock.now;

  try {
    for (const { entitlement, purchaseType } of [
      { entitlement: 'hideAge', purchaseType: 'hide_age' },
      { entitlement: 'invisible', purchaseType: 'invisible' },
    ]) {
      clock.now = now;
      const harness = createAppPassFlowHarness(entitlement, clock);
      const renew = harness.handlers[harness.handlerName];

      await renew(false);
      assert.equal(harness.getInvoiceCount(), 1, `${entitlement}: first invoice opens`);
      assert.equal(
        harness.calls.filter((call) => call.path === 'telegram.openInvoice').length,
        1,
        `${entitlement}: Telegram reports the first invoice as paid`,
      );
      assert.deepEqual(
        harness.calls
          .filter((call) => call.path === '/create-invoice')
          .map((call) => call.body.type),
        [purchaseType],
      );

      const staleMarker = loadPendingAccessRecheck(
        harness.localStorage,
        harness.accountId,
        clock.now,
      );
      assert.ok(staleMarker, `${entitlement}: paid callback persists a pending marker`);
      assert.equal(staleMarker.entitlement, entitlement);
      assert.equal(staleMarker.paymentStatus, 'paid');
      assert.equal(
        harness.getProfileCheckCount(),
        6,
        `${entitlement}: stale Worker profiles remain unconfirmed through automatic checks`,
      );

      await renew(false);
      assert.equal(
        harness.getInvoiceCount(),
        1,
        `${entitlement}: another attempt cannot create a second invoice while access is pending`,
      );
      assert.ok(harness.alerts.includes('paymentProcessing'));

      clock.now = staleMarker.startedAt + ACCESS_RECHECK_TIMEOUT_MS + 1;
      const timedOutMarker = loadPendingAccessRecheck(
        harness.localStorage,
        harness.accountId,
        clock.now,
      );
      assert.ok(timedOutMarker, `${entitlement}: pending status survives the automatic retry window`);
      assert.equal(
        getPendingAccessRecheckPhase(timedOutMarker, harness.accountId, clock.now),
        'retry',
        `${entitlement}: manual status check remains available after automatic checks stop`,
      );
      assert.equal(canRetryPendingPaymentCheck(timedOutMarker, harness.accountId, clock.now), true);
      assert.equal(harness.handlers.hasPendingPaymentVerification(), true);

      harness.setBackendConfirmsEntitlement(true);
      await harness.handlers.retryPendingPaymentCheck();
      assert.equal(
        harness.getProfileCheckCount(),
        7,
        `${entitlement}: the manual status check reads the Worker profile`,
      );
      assert.equal(
        loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now),
        null,
        `${entitlement}: matching Worker entitlement clears the pending marker`,
      );
      assert.equal(harness.handlers.hasPendingPaymentVerification(), false);
      if (entitlement === 'hideAge') {
        assert.equal(harness.environment.hideAge, true);
        assert.ok(Date.parse(harness.environment.hideAgeExpiry) > clock.now);
      } else {
        assert.equal(harness.environment.gridVisible, false);
        assert.ok(Date.parse(harness.environment.invisibleExpiry) > clock.now);
      }

      await renew(true);
      assert.equal(
        harness.getInvoiceCount(),
        2,
        `${entitlement}: a new renewal can create an invoice after confirmation`,
      );
      assert.deepEqual(
        harness.calls
          .filter((call) => call.path === '/create-invoice')
          .map((call) => call.body.type),
        [purchaseType, purchaseType],
      );
    }
  } finally {
    Date.now = originalDateNow;
  }
});

test('App Filter checkout stays pending for stale and mismatched Worker profiles, then allows renewal after confirmation', async () => {
  const originalDateNow = Date.now;
  const clock = { now };
  Date.now = () => clock.now;

  try {
    const harness = createAppPassFlowHarness('filter', clock);
    await harness.handlers.handleRenewFilterAccess('filter_access_prompt');

    assert.equal(harness.getInvoiceCount(), 1, 'the first Filter invoice opens');
    assert.deepEqual(
      harness.calls.filter((call) => call.path === '/create-invoice').map((call) => call.body.type),
      ['change_filter'],
    );
    assert.equal(
      harness.calls.filter((call) => call.path === 'telegram.openInvoice').length,
      1,
      'Telegram reports the original invoice as paid',
    );
    assert.equal(
      harness.getProfileCheckCount(),
      6,
      'the paid callback does not complete while all Worker profiles remain stale',
    );
    let marker = loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now);
    assert.ok(marker);
    assert.equal(marker.entitlement, 'filter');
    assert.equal(harness.environment.filterAccessActive, false);
    assert.equal(harness.environment.filterSubUntil, 0);

    await harness.handlers.handleRenewFilterAccess('filter_access_prompt');
    assert.equal(harness.getInvoiceCount(), 1, 'an unresolved paid check blocks a replacement invoice');
    assert.ok(harness.alerts.includes('paymentProcessing'));

    clock.now = marker.startedAt + ACCESS_RECHECK_TIMEOUT_MS + 1;
    harness.environment.raffleClock = clock.now;
    harness.setWorkerProfileOverride({
      id: 'tg_202',
      filter_sub_expiry: new Date(marker.minimumExpiry + 60_000).toISOString(),
    });
    await harness.handlers.retryPendingPaymentCheck();
    assert.equal(harness.getProfileCheckCount(), 12);
    assert.ok(
      loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now),
      'a valid-looking subscription on another account must not confirm this purchase',
    );
    assert.equal(harness.environment.filterAccessActive, false);
    assert.equal(harness.environment.filterSubUntil, 0);

    marker = loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now);
    clock.now = marker.startedAt + ACCESS_RECHECK_TIMEOUT_MS + 1;
    harness.environment.raffleClock = clock.now;
    harness.setWorkerProfileOverride(undefined);
    harness.setBackendConfirmsEntitlement(true);
    await harness.handlers.retryPendingPaymentCheck();

    assert.equal(
      loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now),
      null,
      'the matching Worker profile clears the pending marker',
    );
    assert.equal(harness.handlers.hasPendingPaymentVerification(), false);
    assert.equal(harness.environment.filterAccessActive, true);
    assert.equal(harness.environment.filterSubscriptionActive, true);
    assert.ok(harness.environment.filterSubUntil > clock.now);

    harness.environment.raffleClock = clock.now;
    await harness.handlers.handleRenewFilterAccess('active_filter_subscription', true);
    assert.equal(harness.getInvoiceCount(), 2, 'a later renewal is permitted after confirmation');
    assert.deepEqual(
      harness.calls.filter((call) => call.path === '/create-invoice').map((call) => call.body.type),
      ['change_filter', 'change_filter'],
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test('App VIP recovery stays pending until the matching Worker profile confirms the entitlement', async () => {
  const originalDateNow = Date.now;
  const clock = { now };
  Date.now = () => clock.now;

  try {
    const harness = createAppPassFlowHarness('vip', clock);
    const minimumExpiry = getMinimumPaidEntitlementExpiry(clock.now, null);
    const oldStart = clock.now - ACCESS_RECHECK_TIMEOUT_MS - 1;
    const marker = createPendingAccessRecheck({
      accountId: harness.accountId,
      entitlement: 'vip',
      startedAt: oldStart,
      createdAt: oldStart,
      minimumExpiry,
    }, clock.now);
    assert.ok(marker);
    harness.setPendingMarker(marker);

    await harness.handlers.retryPendingPaymentCheck();
    assert.equal(harness.getProfileCheckCount(), 6);
    assert.ok(
      loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now),
      'a stale Worker profile leaves VIP pending',
    );
    assert.equal(harness.environment.vipExpiry, null);
    assert.equal(harness.environment.paidUnlocked, false);

    await assert.rejects(
      harness.handlers.startPurchase('vip'),
      /paymentProcessing/,
      'a pending VIP check blocks another invoice before the Worker is called',
    );
    assert.equal(harness.getInvoiceCount(), 0);

    let pendingMarker = loadPendingAccessRecheck(
      harness.localStorage,
      harness.accountId,
      clock.now,
    );
    clock.now = pendingMarker.startedAt + ACCESS_RECHECK_TIMEOUT_MS + 1;
    harness.setWorkerProfileOverride({
      id: 'tg_202',
      vip_expiry: new Date(minimumExpiry + 60_000).toISOString(),
    });
    await harness.handlers.retryPendingPaymentCheck();
    assert.equal(harness.getProfileCheckCount(), 12);
    assert.equal(harness.environment.vipExpiry, null);
    assert.ok(loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now));

    pendingMarker = loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now);
    clock.now = pendingMarker.startedAt + ACCESS_RECHECK_TIMEOUT_MS + 1;
    harness.setWorkerProfileOverride(undefined);
    harness.setBackendConfirmsEntitlement(true);
    await harness.handlers.retryPendingPaymentCheck();

    assert.equal(
      loadPendingAccessRecheck(harness.localStorage, harness.accountId, clock.now),
      null,
      'the matching Worker profile clears the pending VIP marker',
    );
    assert.equal(harness.handlers.hasPendingPaymentVerification(), false);
    assert.ok(Date.parse(harness.environment.vipExpiry) > clock.now);
    assert.equal(harness.environment.paidUnlocked, true);
    assert.equal(harness.getInvoiceCount(), 0, 'VIP recovery itself never creates a new invoice');
  } finally {
    Date.now = originalDateNow;
  }
});

test('reopened payment status names its feature, stays account-scoped, and switches after timeout', () => {
  const marker = createPendingAccessRecheck({
    accountId: 'tg_101',
    entitlement: 'hideAge',
    startedAt: now,
    minimumExpiry: now + 29 * 24 * 60 * 60 * 1000,
  }, now);

  assert.ok(marker);
  assert.equal(getPendingAccessRecheckPhase(marker, 'tg_101', now + 30_000), 'checking');
  assert.equal(getPendingAccessRecheckPhase(marker, 'tg_202', now + 30_000), null);
  assert.equal(getPendingAccessRecheckPhase(marker, null, now + 30_000), null);
  assert.equal(
    getPendingAccessRecheckPhase(marker, 'tg_101', now + ACCESS_RECHECK_TIMEOUT_MS),
    'retry',
    'the active checking state ends when the automatic verification window expires',
  );
  assert.equal(
    getPendingAccessRecheckPhase({ ...marker, attempts: ACCESS_RECHECK_MAX_ATTEMPTS }, 'tg_101', now + 30_000),
    'retry',
    'reaching the retry limit also ends the active checking state',
  );

  assert.equal(getPaidEntitlementOutcome('cancelled', null, 'hideAge', marker.minimumExpiry), 'cancelled');
  assert.equal(getPendingAccessRecheckPhase(null, 'tg_101', now), null);

  const storage = createStorage();
  assert.equal(savePendingAccessRecheck(storage, marker, now), true);
  assert.equal(isPendingAccessConfirmed(marker, {
    id: 'tg_101',
    hide_age: true,
    hide_age_expiry: new Date(marker.minimumExpiry).toISOString(),
  }, now), true);
  assert.equal(clearPendingAccessRecheck(storage, marker), true);
  assert.equal(
    getPendingAccessRecheckPhase(
      loadPendingAccessRecheck(storage, 'tg_101', now),
      'tg_101',
      now,
    ),
    null,
    'a confirmed purchase clears its visible verification status',
  );
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

test('server recovery restores a cleared marker without accepting another account or older state', () => {
  const accountId = 'tg_101';
  const storage = createStorage();
  const recovered = createPendingAccessRecheck({
    accountId,
    entitlement: 'hideAge',
    startedAt: now - 5_000,
    createdAt: now - 5_000,
    minimumExpiry: now + 29 * 24 * 60 * 60 * 1000,
  }, now);

  assert.ok(recovered);
  assert.equal(loadPendingAccessRecheck(storage, accountId, now), null);
  assert.equal(
    selectMostRecentPendingAccessRecheck(null, recovered, accountId, now),
    recovered,
    'the authenticated server record restores a marker after browser storage is empty',
  );
  assert.equal(
    selectMostRecentPendingAccessRecheck(null, recovered, 'tg_202', now),
    null,
    'a recovered marker is not selected for a different account',
  );

  const newerLocal = createPendingAccessRecheck({
    accountId,
    entitlement: 'invisible',
    startedAt: now - 1_000,
    createdAt: now - 1_000,
    minimumExpiry: now + 29 * 24 * 60 * 60 * 1000,
  }, now);
  assert.ok(newerLocal);
  assert.equal(
    selectMostRecentPendingAccessRecheck(newerLocal, recovered, accountId, now),
    newerLocal,
    'a newer local retry is not replaced by an older server snapshot',
  );
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

test('reopened payment recovery confirms the correct account from both configured bot entries', () => {
  const day = 24 * 60 * 60 * 1000;
  const entries = [
    {
      entry: resolveAppEntry(appRuntimeConfig),
      expectedEntryId: 'nearby',
      expectedBotKey: 'botB',
      accountId: 'tg_654321',
    },
    {
      entry: resolveAppEntry(appRuntimeConfig, 'gaymode'),
      expectedEntryId: 'hkmo-date',
      expectedBotKey: 'botA',
      accountId: 'tg_654322',
    },
  ];
  assert.equal(resolveAppEntry(appRuntimeConfig, null, '?mode=gay').botKey, 'botA');

  for (const { entry, expectedEntryId, expectedBotKey, accountId } of entries) {
    assert.equal(entry.id, expectedEntryId);
    assert.equal(entry.botKey, expectedBotKey);

    for (const entitlement of ['filter', 'vip', 'hideAge', 'invisible', 'editProfile']) {
      const storage = createStorage();
      const minimumExpiry = now + 29 * day;
      const marker = createPendingAccessRecheck({
        accountId,
        entitlement,
        startedAt: now,
        minimumExpiry,
        ...(entitlement === 'filter'
          ? { location: 'filter_option', allowActiveRenewal: false }
          : {}),
      }, now + 1_000);

      assert.ok(marker, `${expectedEntryId} ${entitlement} marker should be valid`);
      assert.equal(savePendingAccessRecheck(storage, marker, now + 1_000), true);

      // A fresh app session loads the same localStorage marker for this account.
      const reopenedMarker = loadPendingAccessRecheck(storage, accountId, now + 2_000);
      assert.deepEqual(reopenedMarker, marker);
      assert.equal(
        getPendingAccessRecheckPhase(reopenedMarker, accountId, now + 2_000),
        'checking',
      );

      const otherAccountId = accountId === 'tg_654321' ? 'tg_654322' : 'tg_654321';
      const otherProfile = createConfirmedEntitlementProfile(
        otherAccountId,
        entitlement,
        minimumExpiry,
      );
      assert.equal(loadPendingAccessRecheck(storage, otherAccountId, now + 2_000), null);
      assert.equal(getPendingAccessRecheckPhase(reopenedMarker, otherAccountId, now + 2_000), null);
      assert.equal(isPendingAccessConfirmed(reopenedMarker, otherProfile, now + 2_000), false);

      const confirmedProfile = createConfirmedEntitlementProfile(
        accountId,
        entitlement,
        minimumExpiry,
      );
      assert.equal(
        getPaidEntitlementOutcome('paid', confirmedProfile, entitlement, minimumExpiry),
        'confirmed',
        `${expectedEntryId} ${entitlement} should reach the successful state only after its profile field is confirmed`,
      );
      assert.equal(
        isPendingAccessConfirmed(reopenedMarker, confirmedProfile, now + 2_000),
        true,
      );

      if (entitlement === 'filter' || entitlement === 'vip') {
        const access = getActiveAccessState({
          now: now + 2_000,
          vipExpiry: confirmedProfile.vip_expiry,
          filterSubUntil: confirmedProfile.filter_sub_expiry,
        });
        assert.equal(access.filterAccessActive, true);
        assert.equal(access.paidUnlocked, entitlement === 'vip');
      } else {
        assert.equal(
          isPaidEntitlementActive(confirmedProfile, entitlement, now + 2_000),
          true,
          `${expectedEntryId} ${entitlement} should be active after confirmed profile recovery`,
        );
      }

      assert.equal(clearPendingAccessRecheck(storage, reopenedMarker), true);
      assert.equal(loadPendingAccessRecheck(storage, accountId, now + 2_000), null);
      assert.equal(getPendingAccessRecheckPhase(null, accountId, now + 2_000), null);
    }
  }
});
