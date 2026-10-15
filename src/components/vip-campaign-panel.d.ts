import type { ReactElement } from 'react';

export type VipCampaignWindow = 'today' | 'week' | 'month' | '1_day' | '3_days';

export interface VipCampaign {
  id: string;
  sourceBotKey: 'botA' | 'botB' | null;
  durationDays: number;
  eligibilityWindow: VipCampaignWindow | null;
  cutoffAt: string | null;
  randomize: boolean;
  allowNewUsers: boolean;
  isActive: boolean;
  claimCount: number;
  failedRewardNotificationCount: number | null;
  announcementStatus: 'pending' | 'delivered' | 'failed' | 'cancelled' | 'not_applicable';
}

export interface VipFailedRewardClaim {
  id: string;
  campaignId: string;
  campaignDurationDays: number;
  sourceBotKey: 'botA' | 'botB' | null;
  botKey: 'botA' | 'botB';
  recipientId: string;
  recipientUsername: string | null;
  daysGranted: number;
  grantedAt: string;
  attempts: number;
  manualRetryCount: number;
  lastAttemptAt: string | null;
  lastBotKey: 'botA' | 'botB' | null;
  deliveryStatus: 'failed' | 'delivery_uncertain';
}

export type VipRewardRetryDeliveryOutcome = 'pending' | 'delivered' | 'failed' | 'delivery_uncertain';

export interface VipRewardRetryAudit {
  id: string;
  claimId: string;
  adminTgId: string;
  adminUsername: string | null;
  retriedAt: string;
  sourceBotKey: 'botA' | 'botB' | null;
  originalBotKey: 'botA' | 'botB';
  deliveryOutcome: VipRewardRetryDeliveryOutcome;
}

export interface VipFailureAlertCursor {
  eventId: string;
}

export interface VipFailureAlertSummary {
  newFailureCount: number;
  latestFailureAt: string | null;
  cursor: VipFailureAlertCursor | null;
}

export interface VipRewardNotificationQueueHealth {
  overduePendingCount: number;
  expiredSendingCount: number;
  oldestWaitingAt: string | null;
  oldestWaitingSeconds: number | null;
}

export interface VipCampaignCopy {
  title: string;
  campaign: string;
  sourceApp: string;
  legacySourceApp: string;
  empty: string;
  loading: string;
  loadMore: string;
  refresh: string;
  close: string;
  active: string;
  ended: string;
  inactive: string;
  duration: string;
  randomDuration: string;
  window: string;
  noCutoff: string;
  cutoff: string;
  claimCount: string;
  failedRewardNotifications: string;
  failedRewardNotificationsUnavailable: string;
  failedRewardsReview: string;
  crossCampaignFailedRewardsTitle: string;
  crossCampaignFailedRewardsPlaceholder: string;
  crossCampaignFailedRewardsSearch: string;
  crossCampaignFailedRewardsSourceBot: string;
  crossCampaignFailedRewardsAllSources: string;
  crossCampaignFailedRewardsInitialHint: string;
  crossCampaignFailedRewardsDetails: string;
  failedRewardsEmpty: string;
  failedRewardDeliveryUncertain: string;
  failedRewardDeliveryUncertainConfirm: string;
  failedRewardsLoading: string;
  failedRewardsLoadFailed: string;
  failedRewardClaim: string;
  failedRewardRecipient: string;
  failedRewardDetails: string;
  failedRewardLastAttempt: string;
  failedRewardRetry: string;
  failedRewardRetrying: string;
  failedRewardRetryLimit: string;
  failedRewardRetrySent: string;
  failedRewardRetryFailed: string;
  failedRewardLoadMore: string;
  retryAuditToggle: string;
  retryAuditTitle: string;
  retryAuditEmpty: string;
  retryAuditLoading: string;
  retryAuditLoadFailed: string;
  retryAuditEntry: string;
  retryAuditPending: string;
  retryAuditDelivered: string;
  retryAuditFailed: string;
  retryAuditUncertain: string;
  retryAuditLoadMore: string;
  newFailureAlertTitle: string;
  newFailureAlertSeparate: string;
  newFailureAlertLatest: string;
  newFailureAlertChecking: string;
  newFailureAlertLoadFailed: string;
  queueHealthTitle: string;
  queueHealthSeparate: string;
  queueHealthPending: string;
  queueHealthExpiredSending: string;
  queueHealthOldest: string;
  queueHealthEmpty: string;
  queueHealthChecking: string;
  queueHealthLoadFailed: string;
  newUsers: string;
  announcementStatus: string;
  announcementPending: string;
  announcementDelivered: string;
  announcementFailed: string;
  announcementCancelled: string;
  announcementLegacy: string;
  stop: string;
  stopping: string;
}

export interface VipCampaignPage {
  campaigns: VipCampaign[];
  hasMore: boolean;
}

export interface VipFailedRewardPage {
  claims: VipFailedRewardClaim[];
  hasMore: boolean;
}

export interface VipRewardRetryAuditPage {
  records: VipRewardRetryAudit[];
  hasMore: boolean;
}

export function parseVipCampaignPage(value: unknown): VipCampaignPage;
export function parseVipFailedRewardPage(value: unknown): VipFailedRewardPage;
export function parseVipRewardRetryAuditPage(value: unknown): VipRewardRetryAuditPage;
export function parseVipFailureAlertSummary(value: unknown): VipFailureAlertSummary;
export function parseVipRewardNotificationQueueHealth(value: unknown): VipRewardNotificationQueueHealth;
export const VIP_FAILURE_ALERT_POLL_INTERVAL_MS: number;
export function startVipFailureAlertPolling(options: {
  enabled: boolean;
  userId: string | null | undefined;
  onPoll: () => unknown;
  timer?: Pick<Window, 'setInterval' | 'clearInterval'>;
  intervalMs?: number;
}): () => void;
export function parseVipFailureAlertAcknowledgement(
  value: unknown,
  requestedEventId: string,
): VipFailureAlertCursor;
export function getVipCampaignStatus(campaign: VipCampaign, now?: number): 'active' | 'ended' | 'inactive';
export function VipCampaignPanel(props: {
  campaigns: VipCampaign[];
  hasMore: boolean;
  loading: boolean;
  error: string;
  notice: string;
  stoppingCampaignId: string | null;
  failedRewardCampaignId: string | null;
  failedRewardClaims: VipFailedRewardClaim[];
  failedRewardClaimsHasMore: boolean;
  failedRewardClaimsLoading: boolean;
  failedRewardClaimsError: string;
  retryingFailedRewardClaimId: string | null;
  crossCampaignFailedRewardSearchValue: string;
  crossCampaignFailedRewardSourceBotKey: 'all' | 'botA' | 'botB';
  crossCampaignFailedRewardSearched: boolean;
  crossCampaignFailedRewardClaims: VipFailedRewardClaim[];
  crossCampaignFailedRewardClaimsHasMore: boolean;
  crossCampaignFailedRewardClaimsLoading: boolean;
  crossCampaignFailedRewardClaimsError: string;
  retryAuditCampaignId?: string | null;
  retryAuditRecords?: VipRewardRetryAudit[];
  retryAuditHasMore?: boolean;
  retryAuditLoading?: boolean;
  retryAuditError?: string;
  newFailureAlert?: VipFailureAlertSummary | null;
  failureAlertLoading?: boolean;
  failureAlertError?: string;
  queueHealth?: VipRewardNotificationQueueHealth | null;
  queueHealthLoading?: boolean;
  queueHealthError?: string;
  copy: VipCampaignCopy;
  sourceAppLabels: Record<'botA' | 'botB', string>;
  windowLabels: Record<VipCampaignWindow, string>;
  formatDate: (value: string) => string;
  onClose: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onStop: (campaignId: string) => void;
  onToggleFailedRewards: (campaignId: string) => void;
  onLoadMoreFailedRewards: (campaignId: string) => void;
  onRetryFailedReward: (claimId: string) => void;
  onCrossCampaignFailedRewardSearchChange: (value: string) => void;
  onCrossCampaignFailedRewardSourceChange: (value: 'all' | 'botA' | 'botB') => void;
  onSearchCrossCampaignFailedRewards: (search: string, sourceBotKey: 'all' | 'botA' | 'botB') => void;
  onLoadMoreCrossCampaignFailedRewards: () => void;
  onToggleRetryAudit?: (campaignId: string) => void;
  onLoadMoreRetryAudit?: (campaignId: string) => void;
}): ReactElement;
