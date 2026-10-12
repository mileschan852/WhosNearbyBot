import { isPendingAccessConfirmed } from './access-entitlements.js';

export function trackEvent(name, data) {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break checkout or other app behavior.
  }
}

const FILTER_RENEWAL_CLAIM_PREFIX = 'whos-nearby:filter-renewal-confirmed:v1:';
const FILTER_RENEWAL_CLAIM_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function hashRenewalKey(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    first = Math.imul(first ^ character, 0x01000193);
    second = Math.imul(second ^ character, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

export function createSharedRenewalClaim({ locks, storage } = {}) {
  return async (renewalKey) => {
    try {
      const browserWindow = typeof window === 'undefined' ? null : window;
      const lockManager = locks || browserWindow?.navigator?.locks;
      const sharedStorage = storage || browserWindow?.localStorage;
      if (typeof lockManager?.request !== 'function' || !sharedStorage) return false;

      const claimKey = `${FILTER_RENEWAL_CLAIM_PREFIX}${hashRenewalKey(renewalKey)}`;
      return await lockManager.request(claimKey, async () => {
        try {
          const existingValue = sharedStorage.getItem(claimKey);
          if (existingValue !== null) {
            const existingAt = Number(existingValue);
            if (!Number.isFinite(existingAt) ||
                Date.now() - existingAt < FILTER_RENEWAL_CLAIM_TTL_MS) {
              return false;
            }
            sharedStorage.removeItem(claimKey);
          }

          sharedStorage.setItem(claimKey, String(Date.now()));
          return sharedStorage.getItem(claimKey) !== null;
        } catch {
          return false;
        }
      });
    } catch {
      // If cross-window coordination is unavailable, fail closed rather than emit duplicates.
      return false;
    }
  };
}

export function createFilterRenewalConfirmationReporter(
  track = trackEvent,
  claimRenewal = createSharedRenewalClaim(),
) {
  const reportedRenewals = new Set();

  return async (paymentStatus, marker, profile) => {
    if (paymentStatus !== 'paid' || !isPendingAccessConfirmed(marker, profile)) {
      return false;
    }

    // Keep the deduplication key local. It must never be sent as event data.
    const renewalKey = `${marker.accountId}:${marker.minimumExpiry}`;
    if (reportedRenewals.has(renewalKey)) return false;
    reportedRenewals.add(renewalKey);

    let claimed = false;
    try {
      claimed = await claimRenewal(renewalKey);
    } catch {
      reportedRenewals.delete(renewalKey);
      return false;
    }
    if (!claimed) return false;

    try {
      track('filter_renewal_confirmed', { location: marker.location });
    } catch {
      // Analytics failures must not change the payment result.
    }
    return true;
  };
}
