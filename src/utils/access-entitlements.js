function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || !value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const ACCESS_RECHECK_INTERVAL_MS = 10_000;
export const ACCESS_RECHECK_MAX_ATTEMPTS = 12;
export const ACCESS_RECHECK_TIMEOUT_MS = 2 * 60_000;
export const PENDING_ACCESS_RECHECK_STORAGE_KEY = 'whos_nearby_pending_access_recheck_v2';
const PAID_PASS_VERIFICATION_MS = 29 * 24 * 60 * 60 * 1000;
const PENDING_ENTITLEMENTS = new Set(['filter', 'vip', 'invisible', 'hideAge', 'editProfile']);
const FILTER_RENEWAL_LOCATIONS = new Set([
  'filter_expiry_notice',
  'filter_access_prompt',
  'filter_option',
  'active_filter_subscription',
]);

function isPendingAccessRecheck(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.version !== 2 || typeof value.accountId !== 'string' || !value.accountId.trim()) return false;
  if (value.paymentStatus !== 'paid') return false;
  if (!PENDING_ENTITLEMENTS.has(value.entitlement)) return false;
  if (!Number.isInteger(value.attempts) || value.attempts < 0 || value.attempts > ACCESS_RECHECK_MAX_ATTEMPTS) return false;
  if (!Number.isFinite(value.createdAt) || value.createdAt > now) return false;
  if (!Number.isFinite(value.startedAt) || value.startedAt < value.createdAt || value.startedAt > now) return false;
  if (!Number.isFinite(value.minimumExpiry) || value.minimumExpiry <= 0) return false;
  if (value.entitlement === 'filter') {
    if (!FILTER_RENEWAL_LOCATIONS.has(value.location) || typeof value.allowActiveRenewal !== 'boolean') {
      return false;
    }
  } else if (value.location !== undefined || value.allowActiveRenewal !== undefined) {
    return false;
  }
  return true;
}

export function createPendingAccessRecheck({
  accountId,
  entitlement,
  startedAt = Date.now(),
  createdAt = startedAt,
  minimumExpiry,
  location,
  allowActiveRenewal,
}, now = Date.now()) {
  const marker = {
    version: 2,
    paymentStatus: 'paid',
    accountId,
    entitlement,
    startedAt,
    createdAt,
    attempts: 0,
    minimumExpiry,
    ...(entitlement === 'filter' ? { location, allowActiveRenewal } : {}),
  };
  return isPendingAccessRecheck(marker, now) ? marker : null;
}

export function savePendingAccessRecheck(storage, marker, now = Date.now()) {
  if (!storage || typeof storage.setItem !== 'function' || !isPendingAccessRecheck(marker, now)) {
    return false;
  }
  try {
    storage.setItem(PENDING_ACCESS_RECHECK_STORAGE_KEY, JSON.stringify(marker));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingAccessRecheck(storage, accountId, now = Date.now()) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  let raw;
  try {
    raw = storage.getItem(PENDING_ACCESS_RECHECK_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let marker;
  try {
    marker = JSON.parse(raw);
  } catch {
    marker = null;
  }
  if (!isPendingAccessRecheck(marker, now)) {
    try { storage.removeItem(PENDING_ACCESS_RECHECK_STORAGE_KEY); } catch {}
    return null;
  }
  if (typeof accountId === 'string' && accountId.trim() && marker.accountId !== accountId) return null;
  return marker;
}

export function clearPendingAccessRecheck(storage, expected) {
  if (!storage || typeof storage.removeItem !== 'function') return false;
  if (expected) {
    const stored = loadPendingAccessRecheck(storage, null);
    if (stored && (
      stored.accountId !== expected.accountId ||
      stored.entitlement !== expected.entitlement ||
      stored.startedAt !== expected.startedAt
    )) return false;
  }
  try {
    storage.removeItem(PENDING_ACCESS_RECHECK_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasUnresolvedPaidPurchase(marker, now = Date.now()) {
  return isPendingAccessRecheck(marker, now);
}

export function getMinimumFilterSubscriptionExpiry(now, currentExpiry) {
  return getMinimumPaidEntitlementExpiry(now, currentExpiry);
}

export function getMinimumPaidEntitlementExpiry(now, currentExpiry) {
  return Math.max(timestamp(now), timestamp(currentExpiry)) + PAID_PASS_VERIFICATION_MS;
}

export function shouldContinueAccessRechecks(attempts, startedAt, now = Date.now()) {
  const started = timestamp(startedAt);
  return Number.isSafeInteger(attempts) &&
    attempts >= 0 &&
    attempts < ACCESS_RECHECK_MAX_ATTEMPTS &&
    started > 0 &&
    Number.isFinite(now) &&
    now >= started &&
    now - started < ACCESS_RECHECK_TIMEOUT_MS;
}

export function getPendingAccessRecheckPhase(marker, accountId, now = Date.now()) {
  if (typeof accountId !== 'string' || !accountId.trim() ||
      !isPendingAccessRecheck(marker, now) || marker.accountId !== accountId) {
    return null;
  }
  return shouldContinueAccessRechecks(marker.attempts, marker.startedAt, now)
    ? 'checking'
    : 'retry';
}

export function canRetryPendingPaymentCheck(marker, accountId, now = Date.now()) {
  return getPendingAccessRecheckPhase(marker, accountId, now) === 'retry';
}

export function isPendingAccessConfirmed(marker, profile, now = Date.now()) {
  return isPendingAccessRecheck(marker, now) &&
    profile &&
    typeof profile === 'object' &&
    String(profile.id) === marker.accountId &&
    isPaidEntitlementConfirmed(
      marker.paymentStatus,
      profile,
      marker.entitlement,
      marker.minimumExpiry,
    );
}

export function isPaidEntitlementConfirmed(paymentStatus, profile, entitlement, minimumExpiry) {
  if (paymentStatus !== 'paid' || !profile || typeof profile !== 'object') return false;
  const requiredExpiry = timestamp(minimumExpiry);
  if (!requiredExpiry) return false;
  const requirements = {
    filter: { expiryField: 'filter_sub_expiry' },
    vip: { expiryField: 'vip_expiry' },
    hideAge: { expiryField: 'hide_age_expiry', flagField: 'hide_age', flagValue: true },
    invisible: { expiryField: 'invisible_expiry', flagField: 'grid_visible', flagValue: false },
    editProfile: { expiryField: 'edit_profile_expiry', flagField: 'edit_profile_pass', flagValue: true },
  }[entitlement];
  if (!requirements) return false;
  if (requirements.flagField && profile[requirements.flagField] !== requirements.flagValue) return false;
  return timestamp(profile[requirements.expiryField]) >= requiredExpiry;
}

export function isPaidEntitlementActive(profile, entitlement, now = Date.now()) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Number.isFinite(now)) {
    return false;
  }
  const requirements = {
    filter: { expiryField: 'filter_sub_expiry' },
    vip: { expiryField: 'vip_expiry' },
    hideAge: { expiryField: 'hide_age_expiry', flagField: 'hide_age', flagValue: true },
    invisible: { expiryField: 'invisible_expiry', flagField: 'grid_visible', flagValue: false },
    editProfile: { expiryField: 'edit_profile_expiry', flagField: 'edit_profile_pass', flagValue: true },
  }[entitlement];
  if (!requirements) return false;
  if (requirements.flagField && profile[requirements.flagField] !== requirements.flagValue) return false;
  return timestamp(profile[requirements.expiryField]) > now;
}

export function getPaidEntitlementOutcome(paymentStatus, profile, entitlement, minimumExpiry) {
  if (paymentStatus === 'unsupported') return 'unsupported';
  if (paymentStatus !== 'paid') return 'cancelled';
  return isPaidEntitlementConfirmed(paymentStatus, profile, entitlement, minimumExpiry)
    ? 'confirmed'
    : 'pending';
}

export function getActiveAccessState({
  now = Date.now(),
  isAdmin = false,
  isVipRole = false,
  vipExpiry = null,
  globalVipUntil = 0,
  filterSubUntil = 0,
} = {}) {
  const temporaryVipActive = timestamp(vipExpiry) > now;
  const globalVipActive = timestamp(globalVipUntil) > now;
  const filterSubscriptionActive = timestamp(filterSubUntil) > now;
  const paidUnlocked = Boolean(isAdmin || isVipRole || temporaryVipActive || globalVipActive);

  return {
    temporaryVipActive,
    globalVipActive,
    filterSubscriptionActive,
    paidUnlocked,
    filterAccessActive: paidUnlocked || filterSubscriptionActive,
  };
}

export function hasFilterOptionAccess(option, {
  filterAccessActive = false,
  telegramPremium = false,
} = {}) {
  return Boolean(
    filterAccessActive ||
    (option === "hideNonMatching" && telegramPremium),
  );
}

export function shouldNotifyFilterAccessEnded(previous, current) {
  return Boolean(current?.accountId) &&
    previous?.accountId === current.accountId &&
    previous?.active === true &&
    current.active === false;
}

export function shouldNotifyFilterAccessRestored(previous, current) {
  return Boolean(current?.accountId) &&
    previous?.accountId === current.accountId &&
    previous?.active === false &&
    current.active === true;
}
