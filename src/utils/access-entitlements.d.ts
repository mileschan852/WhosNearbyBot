export interface AccessEntitlementInput {
  now?: number;
  isAdmin?: boolean;
  isVipRole?: boolean;
  vipExpiry?: string | number | null;
  globalVipUntil?: number | string | null;
  filterSubUntil?: number | string | null;
}

export interface AccessEntitlementState {
  temporaryVipActive: boolean;
  globalVipActive: boolean;
  filterSubscriptionActive: boolean;
  paidUnlocked: boolean;
  filterAccessActive: boolean;
}

export type PaidEntitlement = 'filter' | 'vip' | 'hideAge' | 'invisible' | 'editProfile';
export type PaidEntitlementOutcome = 'confirmed' | 'pending' | 'cancelled' | 'unsupported';
export type PendingAccessEntitlement = 'filter' | 'vip' | 'invisible' | 'hideAge' | 'editProfile';

export interface PendingAccessRecheck {
  version: 2;
  paymentStatus: 'paid';
  accountId: string;
  entitlement: PendingAccessEntitlement;
  startedAt: number;
  createdAt: number;
  attempts: number;
  minimumExpiry: number;
  location?: 'filter_expiry_notice' | 'filter_access_prompt' | 'filter_option' | 'active_filter_subscription';
  allowActiveRenewal?: boolean;
}

export interface PendingAccessRecheckInput {
  accountId: string;
  entitlement: PendingAccessEntitlement;
  startedAt?: number;
  createdAt?: number;
  minimumExpiry: number;
  location?: PendingAccessRecheck['location'];
  allowActiveRenewal?: boolean;
}

export const ACCESS_RECHECK_INTERVAL_MS: number;
export const ACCESS_RECHECK_MAX_ATTEMPTS: number;
export const ACCESS_RECHECK_TIMEOUT_MS: number;
export const PENDING_ACCESS_RECHECK_STORAGE_KEY: string;
export function createPendingAccessRecheck(
  input: PendingAccessRecheckInput,
  now?: number,
): PendingAccessRecheck | null;
export function savePendingAccessRecheck(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  marker: PendingAccessRecheck,
  now?: number,
): boolean;
export function loadPendingAccessRecheck(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined,
  accountId: string | null | undefined,
  now?: number,
): PendingAccessRecheck | null;
export function clearPendingAccessRecheck(
  storage: Pick<Storage, 'removeItem'> | null | undefined,
  expected?: PendingAccessRecheck,
): boolean;
export function selectMostRecentPendingAccessRecheck(
  local: PendingAccessRecheck | null | undefined,
  recovered: PendingAccessRecheck | null | undefined,
  accountId: string | null | undefined,
  now?: number,
): PendingAccessRecheck | null;
export function hasUnresolvedPaidPurchase(marker: PendingAccessRecheck | null | undefined, now?: number): boolean;
export function getMinimumFilterSubscriptionExpiry(now: number, currentExpiry: number | string | null): number;
export function getMinimumPaidEntitlementExpiry(now: number, currentExpiry: number | string | null): number;
export function isPaidEntitlementActive(
  profile: Record<string, unknown> | null | undefined,
  entitlement: PaidEntitlement,
  now?: number,
): boolean;
export function shouldContinueAccessRechecks(
  attempts: number,
  startedAt: number,
  now?: number,
): boolean;
export function getAccessRecheckRetryDelayMs(
  error: unknown,
  defaultDelayMs?: number,
): number;
export type PendingAccessRecheckPhase = 'checking' | 'retry';
export function getPendingAccessRecheckPhase(
  marker: PendingAccessRecheck | null | undefined,
  accountId: string | null | undefined,
  now?: number,
): PendingAccessRecheckPhase | null;
export function canRetryPendingPaymentCheck(
  marker: PendingAccessRecheck | null | undefined,
  accountId: string | null | undefined,
  now?: number,
): boolean;
export function isPendingAccessConfirmed(
  marker: PendingAccessRecheck | null | undefined,
  profile: unknown,
  now?: number,
): boolean;
export interface PendingAccessProfileCheckResult {
  status: 'confirmed' | 'pending' | 'unavailable';
  profile: unknown;
  confirmed: boolean;
  error: unknown;
}
export function checkPendingAccessProfile(
  marker: PendingAccessRecheck | null | undefined,
  readProfile: () => Promise<unknown>,
  now?: number,
): Promise<PendingAccessProfileCheckResult>;

export function isPaidEntitlementConfirmed(
  paymentStatus: string,
  profile: unknown,
  entitlement: PaidEntitlement,
  minimumExpiry: number,
): boolean;

export function getPaidEntitlementOutcome(
  paymentStatus: string,
  profile: unknown,
  entitlement: PaidEntitlement,
  minimumExpiry: number,
): PaidEntitlementOutcome;

export function getActiveAccessState(
  input?: AccessEntitlementInput,
): AccessEntitlementState;

export interface FilterOptionAccessInput {
  filterAccessActive?: boolean;
  telegramPremium?: boolean;
}

export function hasFilterOptionAccess(
  option: string,
  input?: FilterOptionAccessInput,
): boolean;

export interface FilterAccessSnapshot {
  accountId: string | null;
  active: boolean;
}

export function shouldNotifyFilterAccessEnded(
  previous: FilterAccessSnapshot,
  current: FilterAccessSnapshot,
): boolean;

export function shouldNotifyFilterAccessRestored(
  previous: FilterAccessSnapshot,
  current: FilterAccessSnapshot,
): boolean;
