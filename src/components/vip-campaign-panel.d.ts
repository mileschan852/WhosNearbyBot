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

export interface VipFailureAlertCursor {
  eventId: string;
}

export interface VipFailureAlertSummary {
  newFailureCount: number;
  latestFailureAt: string | null;
  cursor: VipFailureAlertCursor | null;
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
  newFailureAlertTitle: string;
  newFailureAlertSeparate: string;
  newFailureAlertLatest: string;
  newFailureAlertChecking: string;
  newFailureAlertLoadFailed: string;
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

export function parseVipCampaignPage(value: unknown): VipCampaignPage;
export function parseVipFailedRewardPage(value: unknown): VipFailedRewardPage;
export function parseVipFailureAlertSummary(value: unknown): VipFailureAlertSummary;
export function readVipFailureAlertCursor(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  userId: string | null | undefined,
): VipFailureAlertCursor | null;
export function writeVipFailureAlertCursor(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  userId: string | null | undefined,
  cursor: VipFailureAlertCursor,
): boolean;
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
  newFailureAlert?: VipFailureAlertSummary | null;
  failureAlertLoading?: boolean;
  failureAlertError?: string;
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
}): ReactElement;
