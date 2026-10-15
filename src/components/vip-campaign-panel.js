import { createElement } from 'react';

const h = createElement;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIP_CAMPAIGN_WINDOWS = new Set(['today', 'week', 'month', '1_day', '3_days']);
const VIP_FAILURE_EVENT_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const VIP_FAILURE_EVENT_ID_MAX = 9_223_372_036_854_775_807n;
export const VIP_FAILURE_ALERT_POLL_INTERVAL_MS = 60_000;

export function startVipFailureAlertPolling({
  enabled,
  userId,
  onPoll,
  timer = globalThis,
  intervalMs = VIP_FAILURE_ALERT_POLL_INTERVAL_MS,
} = {}) {
  if (enabled !== true ||
      typeof userId !== 'string' ||
      !/^tg_[0-9]{1,20}$/.test(userId) ||
      typeof onPoll !== 'function' ||
      !timer ||
      typeof timer.setInterval !== 'function' ||
      typeof timer.clearInterval !== 'function' ||
      !Number.isSafeInteger(intervalMs) ||
      intervalMs < 1) {
    return () => {};
  }

  let active = true;
  const handle = timer.setInterval(() => {
    if (active) void onPoll();
  }, intervalMs);
  return () => {
    if (!active) return;
    active = false;
    timer.clearInterval(handle);
  };
}

function parseVipFailureAlertCursor(value) {
  if (!value || typeof value !== 'object' ||
      typeof value.eventId !== 'string' ||
      !VIP_FAILURE_EVENT_ID_PATTERN.test(value.eventId) ||
      BigInt(value.eventId) > VIP_FAILURE_EVENT_ID_MAX) {
    throw new Error('Invalid VIP reward failure alert cursor');
  }
  return { eventId: value.eventId };
}

export function parseVipFailureAlertSummary(value) {
  if (!value || typeof value !== 'object' ||
      !Number.isSafeInteger(value.newFailureCount) || value.newFailureCount < 0 ||
      (value.latestFailureAt !== null &&
        (typeof value.latestFailureAt !== 'string' || !Number.isFinite(Date.parse(value.latestFailureAt))))) {
    throw new Error('Invalid VIP reward failure alert summary');
  }
  if (value.newFailureCount === 0) {
    if (value.cursor !== null || value.latestFailureAt !== null) {
      throw new Error('Invalid VIP reward failure alert summary');
    }
    return { newFailureCount: 0, latestFailureAt: null, cursor: null };
  }
  if (value.latestFailureAt === null) throw new Error('Invalid VIP reward failure alert summary');
  return {
    newFailureCount: value.newFailureCount,
    latestFailureAt: value.latestFailureAt,
    cursor: parseVipFailureAlertCursor(value.cursor),
  };
}

export function parseVipRewardNotificationQueueHealth(value) {
  if (!value || typeof value !== 'object' ||
      !Number.isSafeInteger(value.overduePendingCount) || value.overduePendingCount < 0 ||
      !Number.isSafeInteger(value.expiredSendingCount) || value.expiredSendingCount < 0) {
    throw new Error('Invalid VIP reward notification queue health');
  }
  const hasWaitingNotices = value.overduePendingCount > 0 || value.expiredSendingCount > 0;
  if (!hasWaitingNotices) {
    if (value.oldestWaitingAt !== null || value.oldestWaitingSeconds !== null) {
      throw new Error('Invalid VIP reward notification queue health');
    }
    return {
      overduePendingCount: 0,
      expiredSendingCount: 0,
      oldestWaitingAt: null,
      oldestWaitingSeconds: null,
    };
  }
  if (typeof value.oldestWaitingAt !== 'string' ||
      !Number.isFinite(Date.parse(value.oldestWaitingAt)) ||
      !Number.isSafeInteger(value.oldestWaitingSeconds) ||
      value.oldestWaitingSeconds < 0) {
    throw new Error('Invalid VIP reward notification queue health');
  }
  return {
    overduePendingCount: value.overduePendingCount,
    expiredSendingCount: value.expiredSendingCount,
    oldestWaitingAt: value.oldestWaitingAt,
    oldestWaitingSeconds: value.oldestWaitingSeconds,
  };
}

export function parseVipFailureAlertAcknowledgement(value, requestedEventId) {
  const requestedCursor = parseVipFailureAlertCursor({ eventId: requestedEventId });
  if (!value || typeof value !== 'object' || value.acknowledged !== true) {
    throw new Error('Invalid VIP reward failure alert acknowledgement');
  }
  const cursor = parseVipFailureAlertCursor(value.cursor);
  if (BigInt(cursor.eventId) < BigInt(requestedCursor.eventId)) {
    throw new Error('Invalid VIP reward failure alert acknowledgement cursor');
  }
  return cursor;
}

export function parseVipCampaignPage(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.campaigns) ||
      typeof value.hasMore !== 'boolean') {
    throw new Error('Invalid campaign list response');
  }

  const campaigns = value.campaigns.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid campaign list response');
    const {
      id,
      sourceBotKey,
      durationDays,
      eligibilityWindow,
      cutoffAt,
      randomize,
      allowNewUsers,
      isActive,
      claimCount,
      failedRewardNotificationCount: rawFailedRewardNotificationCount,
      announcementStatus,
    } = row;
    const failedRewardNotificationCount = rawFailedRewardNotificationCount === undefined ||
      rawFailedRewardNotificationCount === null
      ? null
      : rawFailedRewardNotificationCount;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id) ||
        (sourceBotKey !== null && sourceBotKey !== 'botA' && sourceBotKey !== 'botB') ||
        !['pending', 'delivered', 'failed', 'cancelled', 'not_applicable'].includes(announcementStatus) ||
        !Number.isSafeInteger(durationDays) || durationDays < 1 || durationDays > 365 ||
        (eligibilityWindow !== null && !VIP_CAMPAIGN_WINDOWS.has(eligibilityWindow)) ||
        (cutoffAt !== null && (typeof cutoffAt !== 'string' || !Number.isFinite(Date.parse(cutoffAt)))) ||
        ((eligibilityWindow === null) !== (cutoffAt === null)) ||
        typeof randomize !== 'boolean' ||
        typeof allowNewUsers !== 'boolean' ||
        typeof isActive !== 'boolean' ||
        !Number.isSafeInteger(claimCount) || claimCount < 0 ||
        (failedRewardNotificationCount !== null &&
          (!Number.isSafeInteger(failedRewardNotificationCount) || failedRewardNotificationCount < 0))) {
      throw new Error('Invalid campaign list response');
    }
    return {
      id,
      sourceBotKey,
      durationDays,
      eligibilityWindow,
      cutoffAt,
      randomize,
      allowNewUsers,
      isActive,
      claimCount,
      failedRewardNotificationCount,
      announcementStatus,
    };
  });

  return { campaigns, hasMore: value.hasMore };
}

export function parseVipFailedRewardPage(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.claims) ||
      typeof value.hasMore !== 'boolean') {
    throw new Error('Invalid failed reward list response');
  }

  const claims = value.claims.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid failed reward list response');
    const {
      id,
      campaignId,
      campaignDurationDays,
      sourceBotKey,
      botKey,
      recipientId,
      recipientUsername,
      daysGranted,
      grantedAt,
      attempts,
      manualRetryCount,
      lastAttemptAt,
      lastBotKey,
      deliveryStatus,
    } = row;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id) ||
        typeof campaignId !== 'string' || !UUID_PATTERN.test(campaignId) ||
        !Number.isSafeInteger(campaignDurationDays) || campaignDurationDays < 1 || campaignDurationDays > 365 ||
        (sourceBotKey !== null && sourceBotKey !== 'botA' && sourceBotKey !== 'botB') ||
        (botKey !== 'botA' && botKey !== 'botB') ||
        typeof recipientId !== 'string' || !/^tg_[0-9]{1,20}$/.test(recipientId) ||
        (recipientUsername !== null &&
          (typeof recipientUsername !== 'string' || !/^[A-Za-z0-9_]{1,32}$/.test(recipientUsername))) ||
        !Number.isSafeInteger(daysGranted) || daysGranted < 1 || daysGranted > 365 ||
        typeof grantedAt !== 'string' || !Number.isFinite(Date.parse(grantedAt)) ||
        !Number.isSafeInteger(attempts) || attempts < 1 ||
        !Number.isSafeInteger(manualRetryCount) || manualRetryCount < 0 || manualRetryCount > 3 ||
        (lastAttemptAt !== null &&
          (typeof lastAttemptAt !== 'string' || !Number.isFinite(Date.parse(lastAttemptAt)))) ||
        (lastBotKey !== null && lastBotKey !== 'botA' && lastBotKey !== 'botB') ||
        !['failed', 'delivery_uncertain'].includes(deliveryStatus)) {
      throw new Error('Invalid failed reward claim');
    }
    return {
      id,
      campaignId,
      campaignDurationDays,
      sourceBotKey,
      botKey,
      recipientId,
      recipientUsername,
      daysGranted,
      grantedAt,
      attempts,
      manualRetryCount,
      lastAttemptAt,
      lastBotKey,
      deliveryStatus,
    };
  });

  return { claims, hasMore: value.hasMore };
}

export function parseVipRewardRetryAuditPage(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.records) ||
      typeof value.hasMore !== 'boolean') {
    throw new Error('Invalid VIP reward retry audit response');
  }

  const records = value.records.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new Error('Invalid VIP reward retry audit response');
    }
    const {
      id,
      claimId,
      adminTgId,
      adminUsername,
      retriedAt,
      sourceBotKey,
      originalBotKey,
      deliveryOutcome,
    } = row;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id) ||
        typeof claimId !== 'string' || !UUID_PATTERN.test(claimId) ||
        typeof adminTgId !== 'string' || !/^tg_[0-9]{1,20}$/.test(adminTgId) ||
        (adminUsername !== null &&
          (typeof adminUsername !== 'string' || !/^[A-Za-z0-9_]{1,32}$/.test(adminUsername))) ||
        typeof retriedAt !== 'string' || !Number.isFinite(Date.parse(retriedAt)) ||
        (sourceBotKey !== null && sourceBotKey !== 'botA' && sourceBotKey !== 'botB') ||
        (originalBotKey !== 'botA' && originalBotKey !== 'botB') ||
        !['pending', 'delivered', 'failed', 'delivery_uncertain'].includes(deliveryOutcome)) {
      throw new Error('Invalid VIP reward retry audit record');
    }
    return {
      id,
      claimId,
      adminTgId,
      adminUsername,
      retriedAt,
      sourceBotKey,
      originalBotKey,
      deliveryOutcome,
    };
  });

  return { records, hasMore: value.hasMore };
}

export function getVipCampaignStatus(campaign, now = Date.now()) {
  if (!campaign.isActive) return 'inactive';
  if (campaign.cutoffAt && Date.parse(campaign.cutoffAt) <= now) return 'ended';
  return 'active';
}

export function VipCampaignPanel({
  campaigns,
  hasMore,
  loading,
  error,
  notice,
  stoppingCampaignId,
  failedRewardCampaignId = null,
  failedRewardClaims = [],
  failedRewardClaimsHasMore = false,
  failedRewardClaimsLoading = false,
  failedRewardClaimsError = '',
  retryingFailedRewardClaimId = null,
  crossCampaignFailedRewardSearchValue = '',
  crossCampaignFailedRewardSourceBotKey = 'all',
  crossCampaignFailedRewardSearched = false,
  crossCampaignFailedRewardClaims = [],
  crossCampaignFailedRewardClaimsHasMore = false,
  crossCampaignFailedRewardClaimsLoading = false,
  crossCampaignFailedRewardClaimsError = '',
  retryAuditCampaignId = null,
  retryAuditRecords = [],
  retryAuditHasMore = false,
  retryAuditLoading = false,
  retryAuditError = '',
  newFailureAlert = null,
  failureAlertLoading = false,
  failureAlertError = '',
  queueHealth = null,
  queueHealthLoading = false,
  queueHealthError = '',
  copy,
  sourceAppLabels,
  windowLabels,
  formatDate,
  onClose,
  onRefresh,
  onLoadMore,
  onStop,
  onToggleFailedRewards = () => {},
  onLoadMoreFailedRewards = () => {},
  onRetryFailedReward = () => {},
  onCrossCampaignFailedRewardSearchChange = () => {},
  onCrossCampaignFailedRewardSourceChange = () => {},
  onSearchCrossCampaignFailedRewards = () => {},
  onLoadMoreCrossCampaignFailedRewards = () => {},
  onToggleRetryAudit = () => {},
  onLoadMoreRetryAudit = () => {},
}) {
  const statusCopy = {
    active: copy.active,
    ended: copy.ended,
    inactive: copy.inactive,
  };
  const announcementStatusCopy = {
    pending: copy.announcementPending,
    delivered: copy.announcementDelivered,
    failed: copy.announcementFailed,
    cancelled: copy.announcementCancelled,
    not_applicable: copy.announcementLegacy,
  };

  return h('div', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'vip-campaign-panel-title',
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 3200,
      backgroundColor: 'rgba(0,0,0,0.76)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    },
  }, h('section', {
    onClick: (event) => event.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: '460px',
      maxHeight: '86vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1e1e1e',
      border: '1px solid #444',
      borderRadius: '12px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
    },
  },
  h('header', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '14px 16px',
      borderBottom: '1px solid #333',
    },
  },
  h('h2', {
    id: 'vip-campaign-panel-title',
    style: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#fff' },
  }, copy.title),
  h('div', { style: { display: 'flex', gap: '6px' } },
    h('button', {
      type: 'button',
      onClick: onRefresh,
      disabled: loading,
      'aria-label': copy.refresh,
      style: {
        padding: '5px 9px',
        border: '1px solid #555',
        borderRadius: '6px',
        backgroundColor: '#2a2a2a',
        color: '#fff',
        fontSize: '12px',
        cursor: loading ? 'wait' : 'pointer',
      },
    }, copy.refresh),
    h('button', {
      type: 'button',
      onClick: onClose,
      'aria-label': copy.close,
      style: { background: 'none', border: 'none', color: '#aaa', fontSize: '22px', cursor: 'pointer', lineHeight: 1 },
    }, '×'),
  )),
  h('div', {
    style: {
      overflowY: 'auto',
      padding: '12px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
  },
  notice ? h('div', {
    role: 'status',
    'aria-live': 'polite',
    style: { padding: '9px 10px', border: '1px solid #166534', borderRadius: '7px', background: '#102719', color: '#86efac', fontSize: '12px' },
  }, notice) : null,
  newFailureAlert?.newFailureCount > 0 &&
  newFailureAlert.cursor &&
  newFailureAlert.latestFailureAt ? h('div', {
    role: 'alert',
    'aria-live': 'polite',
    'data-testid': 'status-vip-reward-failure-alert',
    style: {
      padding: '10px',
      border: '1px solid #b45309',
      borderRadius: '7px',
      background: '#2b1e0e',
      color: '#fed7aa',
      fontSize: '12px',
    },
  },
  h('strong', {}, copy.newFailureAlertTitle.replace('{count}', String(newFailureAlert.newFailureCount))),
  h('p', { style: { margin: '5px 0 0' } }, copy.newFailureAlertSeparate),
  h('p', { style: { margin: '5px 0 0', color: '#fdba74' } },
    copy.newFailureAlertLatest.replace('{time}', formatDate(newFailureAlert.latestFailureAt)))) : null,
  failureAlertLoading ? h('div', {
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'status-vip-reward-failure-alert-loading',
    style: { color: '#aaa', fontSize: '11px' },
  }, copy.newFailureAlertChecking) : null,
  failureAlertError ? h('div', {
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'status-vip-reward-failure-alert-error',
    style: { color: '#fca5a5', fontSize: '11px' },
  }, copy.newFailureAlertLoadFailed) : null,
  h('section', {
    role: 'region',
    'aria-label': copy.queueHealthTitle,
    'data-testid': 'region-vip-reward-queue-health',
    style: {
      padding: '10px',
      border: '1px solid #1d4ed8',
      borderRadius: '7px',
      background: '#101d30',
      color: '#dbeafe',
      fontSize: '12px',
    },
  },
  h('strong', {}, copy.queueHealthTitle),
  h('p', { style: { margin: '5px 0 0', color: '#bfdbfe' } }, copy.queueHealthSeparate),
  queueHealthLoading && !queueHealth ? h('p', {
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'status-vip-reward-queue-health-loading',
    style: { margin: '7px 0 0', color: '#aaa', fontSize: '11px' },
  }, copy.queueHealthChecking) : null,
  queueHealthError ? h('p', {
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'status-vip-reward-queue-health-error',
    style: { margin: '7px 0 0', color: '#fca5a5', fontSize: '11px' },
  }, copy.queueHealthLoadFailed) : null,
  queueHealth ? h('div', {
    'data-testid': 'status-vip-reward-queue-health-summary',
    style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '7px' },
  },
  h('span', {}, copy.queueHealthPending.replace('{count}', String(queueHealth.overduePendingCount))),
  h('span', {}, copy.queueHealthExpiredSending.replace('{count}', String(queueHealth.expiredSendingCount))),
  queueHealth.oldestWaitingAt && queueHealth.oldestWaitingSeconds !== null
    ? h('span', {}, copy.queueHealthOldest
      .replace('{time}', formatDate(queueHealth.oldestWaitingAt))
      .replace('{minutes}', String(Math.floor(queueHealth.oldestWaitingSeconds / 60))))
    : h('span', {}, copy.queueHealthEmpty)) : null,
  ),
  loading ? h('div', {
    role: 'status',
    'aria-live': 'polite',
    style: { padding: '8px 4px', color: '#aaa', textAlign: 'center', fontSize: '12px' },
  }, copy.loading) : null,
  error ? h('div', {
    role: 'alert',
    style: { padding: '9px 10px', border: '1px solid #7f1d1d', borderRadius: '7px', background: '#2b1414', color: '#fca5a5', fontSize: '12px' },
  }, error) : null,
  !loading && !error && campaigns.length === 0 ? h('p', {
    style: { margin: '8px 0', color: '#999', fontSize: '13px', textAlign: 'center' },
  }, copy.empty) : null,
  h('section', {
    role: 'region',
    'aria-label': copy.crossCampaignFailedRewardsTitle,
    'data-testid': 'region-cross-campaign-vip-failures',
    style: {
      padding: '10px',
      border: '1px solid #555',
      borderRadius: '9px',
      backgroundColor: '#191919',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
  },
  h('h3', {
    style: { margin: 0, color: '#fff', fontSize: '13px' },
  }, copy.crossCampaignFailedRewardsTitle),
  h('form', {
    'data-testid': 'form-cross-campaign-vip-reward-search',
    onSubmit: (event) => {
      event.preventDefault();
      onSearchCrossCampaignFailedRewards(
        crossCampaignFailedRewardSearchValue,
        crossCampaignFailedRewardSourceBotKey,
      );
    },
    style: { display: 'flex', flexDirection: 'column', gap: '7px' },
  },
  h('input', {
    type: 'search',
    value: crossCampaignFailedRewardSearchValue,
    maxLength: 64,
    placeholder: copy.crossCampaignFailedRewardsPlaceholder,
    'aria-label': copy.crossCampaignFailedRewardsPlaceholder,
    'data-testid': 'input-cross-campaign-vip-reward-search',
    onChange: (event) => onCrossCampaignFailedRewardSearchChange(event.target.value),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px',
      border: '1px solid #555',
      borderRadius: '6px',
      backgroundColor: '#242424',
      color: '#fff',
      fontSize: '12px',
    },
  }),
  h('label', {
    style: { display: 'flex', flexDirection: 'column', gap: '4px', color: '#aaa', fontSize: '11px' },
  },
  copy.crossCampaignFailedRewardsSourceBot,
  h('select', {
    value: crossCampaignFailedRewardSourceBotKey,
    'aria-label': copy.crossCampaignFailedRewardsSourceBot,
    'data-testid': 'select-cross-campaign-vip-reward-source',
    onChange: (event) => onCrossCampaignFailedRewardSourceChange(event.target.value),
    style: {
      padding: '7px',
      border: '1px solid #555',
      borderRadius: '6px',
      backgroundColor: '#242424',
      color: '#fff',
      fontSize: '12px',
    },
  },
  h('option', { value: 'all' }, copy.crossCampaignFailedRewardsAllSources),
  h('option', { value: 'botA' }, sourceAppLabels.botA),
  h('option', { value: 'botB' }, sourceAppLabels.botB),
  )),
  h('button', {
    type: 'submit',
    disabled: crossCampaignFailedRewardClaimsLoading,
    'data-testid': 'button-search-cross-campaign-vip-rewards',
    style: {
      alignSelf: 'flex-start',
      padding: '7px 10px',
      border: '1px solid #2563eb',
      borderRadius: '6px',
      backgroundColor: '#1d4ed8',
      color: '#fff',
      fontSize: '11px',
      cursor: crossCampaignFailedRewardClaimsLoading ? 'wait' : 'pointer',
    },
  }, copy.crossCampaignFailedRewardsSearch)),
  !crossCampaignFailedRewardSearched ? h('p', {
    style: { margin: 0, color: '#aaa', fontSize: '11px' },
  }, copy.crossCampaignFailedRewardsInitialHint) : null,
  crossCampaignFailedRewardClaimsLoading ? h('p', {
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'status-cross-campaign-vip-failures-loading',
    style: { margin: 0, color: '#aaa', fontSize: '11px' },
  }, copy.failedRewardsLoading) : null,
  crossCampaignFailedRewardClaimsError ? h('p', {
    role: 'alert',
    'data-testid': 'status-cross-campaign-vip-failures-error',
    style: { margin: 0, color: '#fca5a5', fontSize: '11px' },
  }, crossCampaignFailedRewardClaimsError || copy.failedRewardsLoadFailed) : null,
  crossCampaignFailedRewardSearched &&
  !crossCampaignFailedRewardClaimsLoading &&
  !crossCampaignFailedRewardClaimsError &&
  crossCampaignFailedRewardClaims.length === 0 ? h('p', {
    'data-testid': 'text-cross-campaign-vip-failures-empty',
    style: { margin: 0, color: '#aaa', fontSize: '11px' },
  }, copy.failedRewardsEmpty) : null,
  ...crossCampaignFailedRewardClaims.map((claim) => {
    const recipient = claim.recipientUsername
      ? `@${claim.recipientUsername}`
      : claim.recipientId.replace(/^tg_/, '');
    const sourceApp = claim.sourceBotKey
      ? sourceAppLabels[claim.sourceBotKey]
      : copy.legacySourceApp;
    const campaignDetails = copy.crossCampaignFailedRewardsDetails
      .replace('{campaign}', claim.campaignId.slice(0, 8))
      .replace('{source}', sourceApp)
      .replace('{bot}', sourceAppLabels[claim.botKey]);
    const retrying = retryingFailedRewardClaimId === claim.id;
    return h('article', {
      key: claim.id,
      'data-testid': `item-cross-campaign-vip-failure-${claim.id}`,
      style: {
        padding: '8px',
        border: '1px solid #383838',
        borderRadius: '7px',
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
      },
    },
    h('p', { style: { margin: 0, color: '#ddd', fontSize: '11px' } },
      copy.failedRewardClaim.replace('{id}', claim.id.slice(0, 8))),
    h('p', { style: { margin: 0, color: '#ddd', fontSize: '11px' } },
      copy.failedRewardRecipient.replace('{recipient}', recipient)),
    h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } }, campaignDetails),
    h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } },
      copy.failedRewardDetails
        .replace('{days}', String(claim.daysGranted))
        .replace('{attempts}', String(claim.attempts))
        .replace('{retries}', String(claim.manualRetryCount))),
    claim.deliveryStatus === 'delivery_uncertain' ? h('p', {
      role: 'alert',
      style: { margin: 0, color: '#fcd34d', fontSize: '11px' },
    }, copy.failedRewardDeliveryUncertain) : null,
    claim.lastAttemptAt ? h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } },
      copy.failedRewardLastAttempt.replace('{time}', formatDate(claim.lastAttemptAt))) : null,
    claim.manualRetryCount >= 3
      ? h('p', { style: { margin: 0, color: '#fca5a5', fontSize: '11px' } }, copy.failedRewardRetryLimit)
      : h('button', {
        type: 'button',
        onClick: () => {
          if (claim.deliveryStatus === 'delivery_uncertain' &&
              (typeof window === 'undefined' ||
                !window.confirm(copy.failedRewardDeliveryUncertainConfirm))) return;
          onRetryFailedReward(claim.id);
        },
        disabled: retrying || retryingFailedRewardClaimId !== null,
        'aria-label': retrying ? copy.failedRewardRetrying : copy.failedRewardRetry,
        'data-testid': `button-retry-cross-campaign-vip-failure-${claim.id}`,
        style: {
          alignSelf: 'flex-start',
          padding: '6px 9px',
          border: '1px solid #2563eb',
          borderRadius: '6px',
          backgroundColor: '#1d4ed8',
          color: '#fff',
          fontSize: '11px',
          cursor: retrying || retryingFailedRewardClaimId !== null ? 'wait' : 'pointer',
        },
      }, retrying ? copy.failedRewardRetrying : copy.failedRewardRetry),
    );
  }),
  crossCampaignFailedRewardClaimsHasMore ? h('button', {
    type: 'button',
    onClick: onLoadMoreCrossCampaignFailedRewards,
    disabled: crossCampaignFailedRewardClaimsLoading,
    'data-testid': 'button-load-more-cross-campaign-vip-failures',
    style: {
      alignSelf: 'flex-start',
      padding: '6px 9px',
      border: '1px solid #555',
      borderRadius: '6px',
      backgroundColor: '#2a2a2a',
      color: '#fff',
      fontSize: '11px',
      cursor: crossCampaignFailedRewardClaimsLoading ? 'wait' : 'pointer',
    },
  }, copy.failedRewardLoadMore) : null,
  ),
  campaigns.map((campaign) => {
    const status = getVipCampaignStatus(campaign);
    const statusColor = status === 'active' ? '#86efac' : status === 'ended' ? '#fcd34d' : '#aaa';
    const windowLabel = campaign.eligibilityWindow ? windowLabels[campaign.eligibilityWindow] : null;
    const duration = campaign.randomize
      ? copy.randomDuration.replace('{days}', String(campaign.durationDays))
      : copy.duration.replace('{days}', String(campaign.durationDays));
    const sourceApp = campaign.sourceBotKey
      ? copy.sourceApp.replace('{app}', sourceAppLabels[campaign.sourceBotKey])
      : copy.legacySourceApp;
    const cutoff = campaign.cutoffAt
      ? copy.cutoff.replace('{time}', formatDate(campaign.cutoffAt))
      : copy.noCutoff;
    const stopping = stoppingCampaignId === campaign.id;
    const failedRewardsExpanded = failedRewardCampaignId === campaign.id;
    const retryAuditExpanded = retryAuditCampaignId === campaign.id;
    const campaignFailedClaims = failedRewardsExpanded
      ? failedRewardClaims.filter((claim) => claim.campaignId === campaign.id)
      : [];
    const campaignRetryAudit = retryAuditExpanded ? retryAuditRecords : [];

    return h('article', {
      key: campaign.id,
      'aria-label': `${copy.campaign} ${campaign.id}`,
      style: {
        padding: '11px',
        border: '1px solid #383838',
        borderRadius: '9px',
        backgroundColor: '#242424',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      },
    },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
      h('span', { style: { color: '#fff', fontSize: '12px', fontWeight: 'bold' } }, `${copy.campaign} · ${campaign.id.slice(0, 8)}`),
      h('span', { style: { color: statusColor, fontSize: '11px', fontWeight: 'bold' } }, statusCopy[status]),
    ),
    h('p', { style: { margin: 0, color: '#93c5fd', fontSize: '11px' } }, sourceApp),
    h('p', {
      style: {
        margin: 0,
        color: campaign.announcementStatus === 'failed' ? '#fca5a5' : '#aaa',
        fontSize: '11px',
      },
    }, `${copy.announcementStatus}: ${announcementStatusCopy[campaign.announcementStatus]}`),
    h('p', {
      style: {
        margin: 0,
        color: campaign.failedRewardNotificationCount === null
          ? '#fbbf24'
          : campaign.failedRewardNotificationCount > 0 ? '#fca5a5' : '#aaa',
        fontSize: '11px',
      },
    }, campaign.failedRewardNotificationCount === null
      ? copy.failedRewardNotificationsUnavailable
      : copy.failedRewardNotifications.replace('{count}', String(campaign.failedRewardNotificationCount))),
    campaign.failedRewardNotificationCount !== null && campaign.failedRewardNotificationCount > 0 ? h('button', {
      type: 'button',
      onClick: () => onToggleFailedRewards(campaign.id),
      disabled: retryingFailedRewardClaimId !== null,
      'aria-expanded': failedRewardsExpanded,
      'aria-controls': `failed-vip-rewards-${campaign.id}`,
      style: {
        alignSelf: 'flex-start',
        padding: '6px 9px',
        border: '1px solid #555',
        borderRadius: '6px',
        backgroundColor: '#2a2a2a',
        color: '#fff',
        fontSize: '11px',
        cursor: 'pointer',
      },
    }, copy.failedRewardsReview.replace('{count}', String(campaign.failedRewardNotificationCount))) : null,
    campaign.failedRewardNotificationCount !== null && failedRewardsExpanded ? h('div', {
      id: `failed-vip-rewards-${campaign.id}`,
      role: 'region',
      'aria-label': copy.failedRewardsReview.replace('{count}', String(campaign.failedRewardNotificationCount)),
      style: {
        padding: '8px',
        border: '1px solid #444',
        borderRadius: '7px',
        backgroundColor: '#191919',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
      },
    },
    failedRewardClaimsLoading ? h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } }, copy.failedRewardsLoading) : null,
    failedRewardClaimsError ? h('p', { role: 'alert', style: { margin: 0, color: '#fca5a5', fontSize: '11px' } }, failedRewardClaimsError) : null,
    !failedRewardClaimsLoading && !failedRewardClaimsError && campaignFailedClaims.length === 0
      ? h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } }, copy.failedRewardsEmpty)
      : null,
    ...campaignFailedClaims.map((claim) => {
      const recipient = claim.recipientUsername
        ? `@${claim.recipientUsername}`
        : claim.recipientId.replace(/^tg_/, '');
      const retrying = retryingFailedRewardClaimId === claim.id;
      return h('div', {
        key: claim.id,
        style: {
          padding: '7px',
          border: '1px solid #333',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        },
      },
      h('p', { style: { margin: 0, color: '#ddd', fontSize: '11px' } },
        copy.failedRewardClaim.replace('{id}', claim.id.slice(0, 8))),
      h('p', { style: { margin: 0, color: '#ddd', fontSize: '11px' } },
        copy.failedRewardRecipient.replace('{recipient}', recipient)),
      h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } },
        copy.failedRewardDetails
          .replace('{days}', String(claim.daysGranted))
          .replace('{attempts}', String(claim.attempts))
          .replace('{retries}', String(claim.manualRetryCount))),
      claim.deliveryStatus === 'delivery_uncertain' ? h('p', {
        role: 'alert',
        style: { margin: 0, color: '#fcd34d', fontSize: '11px' },
      }, copy.failedRewardDeliveryUncertain) : null,
      claim.lastAttemptAt ? h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } },
        copy.failedRewardLastAttempt.replace('{time}', formatDate(claim.lastAttemptAt))) : null,
      claim.manualRetryCount >= 3
        ? h('p', { style: { margin: 0, color: '#fca5a5', fontSize: '11px' } }, copy.failedRewardRetryLimit)
        : h('button', {
          type: 'button',
          onClick: () => {
            if (claim.deliveryStatus === 'delivery_uncertain' &&
                (typeof window === 'undefined' ||
                  !window.confirm(copy.failedRewardDeliveryUncertainConfirm))) return;
            onRetryFailedReward(claim.id);
          },
          disabled: retrying || retryingFailedRewardClaimId !== null,
          'aria-label': retrying ? copy.failedRewardRetrying : copy.failedRewardRetry,
          style: {
            alignSelf: 'flex-start',
            padding: '6px 9px',
            border: '1px solid #2563eb',
            borderRadius: '6px',
            backgroundColor: '#1d4ed8',
            color: '#fff',
            fontSize: '11px',
            cursor: retrying || retryingFailedRewardClaimId !== null ? 'wait' : 'pointer',
          },
        }, retrying ? copy.failedRewardRetrying : copy.failedRewardRetry),
      );
    }),
    failedRewardClaimsHasMore ? h('button', {
      type: 'button',
      onClick: () => onLoadMoreFailedRewards(campaign.id),
      disabled: failedRewardClaimsLoading,
      style: {
        alignSelf: 'flex-start',
        padding: '6px 9px',
        border: '1px solid #555',
        borderRadius: '6px',
        backgroundColor: '#2a2a2a',
        color: '#fff',
        fontSize: '11px',
        cursor: failedRewardClaimsLoading ? 'wait' : 'pointer',
      },
    }, copy.failedRewardLoadMore) : null,
    ) : null,
    h('button', {
      type: 'button',
      onClick: () => onToggleRetryAudit(campaign.id),
      'aria-expanded': retryAuditExpanded,
      'aria-controls': `vip-retry-audit-${campaign.id}`,
      'data-testid': `button-toggle-vip-retry-audit-${campaign.id}`,
      style: {
        alignSelf: 'flex-start',
        padding: '6px 9px',
        border: '1px solid #555',
        borderRadius: '6px',
        backgroundColor: '#2a2a2a',
        color: '#fff',
        fontSize: '11px',
        cursor: 'pointer',
      },
    }, copy.retryAuditToggle),
    retryAuditExpanded ? h('div', {
      id: `vip-retry-audit-${campaign.id}`,
      role: 'region',
      'aria-label': copy.retryAuditTitle,
      'data-testid': `region-vip-retry-audit-${campaign.id}`,
      style: {
        padding: '8px',
        border: '1px solid #444',
        borderRadius: '7px',
        backgroundColor: '#191919',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
      },
    },
    retryAuditLoading ? h('p', {
      role: 'status',
      'aria-live': 'polite',
      'data-testid': `status-vip-retry-audit-loading-${campaign.id}`,
      style: { margin: 0, color: '#aaa', fontSize: '11px' },
    }, copy.retryAuditLoading) : null,
    retryAuditError ? h('p', {
      role: 'alert',
      'data-testid': `status-vip-retry-audit-error-${campaign.id}`,
      style: { margin: 0, color: '#fca5a5', fontSize: '11px' },
    }, retryAuditError || copy.retryAuditLoadFailed) : null,
    !retryAuditLoading && !retryAuditError && campaignRetryAudit.length === 0
      ? h('p', {
        'data-testid': `text-vip-retry-audit-empty-${campaign.id}`,
        style: { margin: 0, color: '#aaa', fontSize: '11px' },
      }, copy.retryAuditEmpty)
      : null,
    ...campaignRetryAudit.map((record) => {
      const outcomeCopy = {
        pending: copy.retryAuditPending,
        delivered: copy.retryAuditDelivered,
        failed: copy.retryAuditFailed,
        delivery_uncertain: copy.retryAuditUncertain,
      }[record.deliveryOutcome];
      const admin = record.adminUsername
        ? `@${record.adminUsername}`
        : record.adminTgId;
      const sourceApp = record.sourceBotKey
        ? sourceAppLabels[record.sourceBotKey]
        : copy.legacySourceApp;
      return h('p', {
        key: record.id,
        'data-testid': `text-vip-retry-audit-record-${record.id}`,
        style: {
          margin: 0,
          padding: '6px',
          border: '1px solid #333',
          borderRadius: '5px',
          color: '#ddd',
          fontSize: '11px',
          overflowWrap: 'anywhere',
        },
      }, copy.retryAuditEntry
        .replace('{admin}', admin)
        .replace('{time}', formatDate(record.retriedAt))
        .replace('{claim}', record.claimId)
        .replace('{source}', sourceApp)
        .replace('{bot}', sourceAppLabels[record.originalBotKey])
        .replace('{outcome}', outcomeCopy));
    }),
    retryAuditHasMore ? h('button', {
      type: 'button',
      onClick: () => onLoadMoreRetryAudit(campaign.id),
      disabled: retryAuditLoading,
      'data-testid': `button-load-more-vip-retry-audit-${campaign.id}`,
      style: {
        alignSelf: 'flex-start',
        padding: '6px 9px',
        border: '1px solid #555',
        borderRadius: '6px',
        backgroundColor: '#2a2a2a',
        color: '#fff',
        fontSize: '11px',
        cursor: retryAuditLoading ? 'wait' : 'pointer',
      },
    }, copy.retryAuditLoadMore) : null,
    ) : null,
    h('p', { style: { margin: 0, color: '#ddd', fontSize: '12px' } }, duration),
    windowLabel ? h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } }, copy.window.replace('{window}', windowLabel)) : null,
    h('p', { style: { margin: 0, color: '#aaa', fontSize: '11px' } }, cutoff),
    h('p', { style: { margin: 0, color: '#ddd', fontSize: '11px' } }, copy.claimCount.replace('{count}', String(campaign.claimCount))),
    campaign.allowNewUsers ? h('p', { style: { margin: 0, color: '#93c5fd', fontSize: '11px' } }, copy.newUsers) : null,
    campaign.isActive ? h('button', {
      type: 'button',
      onClick: () => onStop(campaign.id),
      disabled: stopping,
      'aria-label': stopping ? copy.stopping : copy.stop,
      style: {
        alignSelf: 'flex-start',
        marginTop: '3px',
        padding: '6px 10px',
        border: '1px solid #7f1d1d',
        borderRadius: '6px',
        backgroundColor: '#3a1414',
        color: '#fca5a5',
        fontSize: '12px',
        cursor: stopping ? 'wait' : 'pointer',
      },
    }, stopping ? copy.stopping : copy.stop) : null,
    );
  }),
  hasMore ? h('button', {
    type: 'button',
    onClick: onLoadMore,
    disabled: loading,
    style: {
      padding: '9px 12px',
      border: '1px solid #555',
      borderRadius: '7px',
      backgroundColor: '#2a2a2a',
      color: '#fff',
      fontSize: '12px',
      cursor: loading ? 'wait' : 'pointer',
    },
  }, loading ? copy.loading : copy.loadMore) : null,
  )),
  );
}
