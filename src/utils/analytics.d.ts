import type { PendingAccessRecheck } from './access-entitlements';

type AnalyticsData = Record<string, string | number | boolean>;
type AnalyticsTracker = (name: string, data?: AnalyticsData) => void;
type RenewalClaim = (renewalKey: string) => Promise<boolean>;
type SharedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type SharedLockManager = {
  request(name: string, callback: () => boolean | Promise<boolean>): Promise<boolean>;
};

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void;
export function createFilterRenewalConfirmationReporter(
  track?: AnalyticsTracker,
  claimRenewal?: RenewalClaim,
): (
  paymentStatus: string,
  marker: PendingAccessRecheck | null | undefined,
  profile: unknown,
) => Promise<boolean>;

export function createSharedRenewalClaim(options?: {
  locks?: SharedLockManager;
  storage?: SharedStorage;
}): RenewalClaim;
