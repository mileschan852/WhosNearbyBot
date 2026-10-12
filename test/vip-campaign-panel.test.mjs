import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getVipCampaignStatus,
  parseVipCampaignPage,
  parseVipFailedRewardPage,
  parseVipFailureAlertSummary,
  readVipFailureAlertCursor,
  VipCampaignPanel,
  writeVipFailureAlertCursor,
} from '../src/components/vip-campaign-panel.js';

const campaignId = '0c9c0802-6dd2-4453-a93b-8fef06d1a3d2';
const campaign = {
  id: campaignId,
  sourceBotKey: 'botA',
  durationDays: 30,
  eligibilityWindow: 'today',
  cutoffAt: '2026-12-01T00:00:00.000Z',
  randomize: true,
  allowNewUsers: true,
  isActive: true,
  claimCount: 7,
  failedRewardNotificationCount: 2,
  announcementStatus: 'pending',
};
const copy = {
  title: 'VIP campaigns',
  campaign: 'Campaign',
  sourceApp: 'Campaign app: {app}',
  legacySourceApp: 'Legacy campaign · both apps',
  empty: 'No VIP campaigns.',
  loading: 'Loading campaigns…',
  loadMore: 'Load more',
  refresh: 'Refresh',
  close: 'Close',
  active: 'Active',
  ended: 'Eligibility ended',
  inactive: 'Inactive',
  duration: '{days} days',
  randomDuration: 'Random: 1–{days} days',
  window: 'Login window: {window}',
  noCutoff: 'No login cutoff',
  cutoff: 'Eligibility cutoff: {time}',
  claimCount: 'Issued claims: {count}',
  failedRewardNotifications: 'Failed reward messages: {count}',
  failedRewardNotificationsUnavailable: 'Failed reward message count unavailable on the current backend.',
  failedRewardsReview: 'Review failed messages ({count})',
  failedRewardsEmpty: 'No failed messages remain.',
  failedRewardDeliveryUncertain: 'Telegram may already have sent this message.',
  failedRewardDeliveryUncertainConfirm: 'Retry even though this message may already be delivered?',
  failedRewardsLoading: 'Loading failed messages…',
  failedRewardsLoadFailed: 'Could not load failed messages.',
  failedRewardClaim: 'Claim {id}',
  failedRewardRecipient: 'Recipient: {recipient}',
  failedRewardDetails: '{days} VIP days · {attempts} attempts · {retries}/3 manual retries',
  failedRewardLastAttempt: 'Last attempt: {time}',
  failedRewardRetry: 'Retry notification',
  failedRewardRetrying: 'Sending…',
  failedRewardRetryLimit: 'Retry limit reached',
  failedRewardRetrySent: 'Reward message sent.',
  failedRewardRetryFailed: 'The message still failed.',
  failedRewardLoadMore: 'Load more failed messages',
  newFailureAlertTitle: 'New failed VIP reward messages: {count}',
  newFailureAlertSeparate: 'These reward DMs are separate from public campaign announcements.',
  newFailureAlertLatest: 'Latest reward failure: {time}',
  newFailureAlertChecking: 'Checking for new failed reward messages…',
  newFailureAlertLoadFailed: 'Could not check for new reward messages.',
  newUsers: 'Includes new accounts',
  announcementStatus: 'Announcement',
  announcementPending: 'Queued',
  announcementDelivered: 'Posted',
  announcementFailed: 'Delivery failed',
  announcementCancelled: 'Not sent; campaign ended',
  announcementLegacy: 'Legacy campaign; no announcement',
  stop: 'Stop campaign',
  stopping: 'Stopping…',
};
const props = {
  campaigns: [campaign],
  hasMore: true,
  loading: false,
  error: '',
  notice: '',
  stoppingCampaignId: null,
  failedRewardCampaignId: null,
  failedRewardClaims: [],
  failedRewardClaimsHasMore: false,
  failedRewardClaimsLoading: false,
  failedRewardClaimsError: '',
  retryingFailedRewardClaimId: null,
  copy,
  sourceAppLabels: {
    botA: 'HKMO Date',
    botB: "Who's Nearby",
  },
  windowLabels: {
    today: 'Today',
    week: 'This week',
    month: 'This month',
    '1_day': '1 day',
    '3_days': '3 days',
  },
  formatDate: () => 'Dec 1, 2026',
  onClose() {},
  onRefresh() {},
  onLoadMore() {},
  onStop() {},
  onToggleFailedRewards() {},
  onLoadMoreFailedRewards() {},
  onRetryFailedReward() {},
};

const failedClaim = {
  id: '874a9e0a-55f0-46cc-b92c-4255fba60213',
  campaignId,
  campaignDurationDays: 30,
  sourceBotKey: 'botA',
  botKey: 'botA',
  recipientId: 'tg_654321',
  recipientUsername: 'member_test',
  daysGranted: 12,
  grantedAt: '2026-11-01T00:00:00.000Z',
  attempts: 5,
  manualRetryCount: 1,
  lastAttemptAt: '2026-11-02T00:00:00.000Z',
  lastBotKey: 'botA',
  deliveryStatus: 'failed',
};

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

test('campaign panel shows duration, eligibility cutoff, claim count and active status', () => {
  const html = renderToStaticMarkup(VipCampaignPanel(props));

  assert.match(html, /VIP campaigns/);
  assert.match(html, /Campaign app: HKMO Date/);
  assert.match(html, /Random: 1–30 days/);
  assert.match(html, /Login window: Today/);
  assert.match(html, /Eligibility cutoff: Dec 1, 2026/);
  assert.match(html, /Issued claims: 7/);
  assert.match(html, /Failed reward messages: 2/);
  assert.match(html, /Review failed messages \(2\)/);
  assert.match(html, /Announcement: Queued/);
  assert.match(html, /Active/);
  assert.match(html, /Load more/);
});

test('new failure alert summary validates its cursor and count', () => {
  const summary = parseVipFailureAlertSummary({
    newFailureCount: 2,
    latestFailureAt: '2030-01-02T00:00:00.000Z',
    cursor: { eventId: '12' },
  });
  assert.deepEqual(summary, {
    newFailureCount: 2,
    latestFailureAt: '2030-01-02T00:00:00.000Z',
    cursor: { eventId: '12' },
  });
  assert.deepEqual(parseVipFailureAlertSummary({
    newFailureCount: 0,
    latestFailureAt: null,
    cursor: null,
  }), {
    newFailureCount: 0,
    latestFailureAt: null,
    cursor: null,
  });
  assert.throws(() => parseVipFailureAlertSummary({
    newFailureCount: 1,
    latestFailureAt: '2030-01-02T00:00:00.000Z',
    cursor: null,
  }));
  assert.throws(() => parseVipFailureAlertSummary({
    newFailureCount: 0,
    latestFailureAt: null,
    cursor: { eventId: '12' },
  }));
  assert.throws(() => parseVipFailureAlertSummary({
    newFailureCount: 1,
    latestFailureAt: 'not a time',
    cursor: { eventId: '12' },
  }));
});

test('failure alert cursor is persisted separately for each Telegram admin', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const cursor = { eventId: '12' };

  assert.equal(writeVipFailureAlertCursor(storage, 'tg_123', cursor), true);
  assert.deepEqual(readVipFailureAlertCursor(storage, 'tg_123'), cursor);
  assert.equal(readVipFailureAlertCursor(storage, 'tg_456'), null);
  assert.equal(writeVipFailureAlertCursor(storage, 'not-a-telegram-id', cursor), false);
});

test('new reward DM failures appear in a distinct admin alert, apart from announcements', () => {
  const html = renderToStaticMarkup(VipCampaignPanel({
    ...props,
    newFailureAlert: {
      newFailureCount: 2,
      latestFailureAt: '2030-01-02T00:00:00.000Z',
      cursor: { eventId: '12' },
    },
  }));

  assert.match(html, /role="alert"/);
  assert.match(html, /New failed VIP reward messages: 2/);
  assert.match(html, /These reward DMs are separate from public campaign announcements/);
  assert.match(html, /Latest reward failure: Dec 1, 2026/);
  assert.match(html, /Announcement: Queued/);
});

test('the reward failure alert is absent when there are no unseen failures', () => {
  const html = renderToStaticMarkup(VipCampaignPanel({
    ...props,
    newFailureAlert: null,
  }));
  assert.doesNotMatch(html, /New failed VIP reward messages/);
});

test('failed reward page parser validates recipient and retry details', () => {
  const parsed = parseVipFailedRewardPage({ claims: [failedClaim], hasMore: false });
  assert.deepEqual(parsed, { claims: [failedClaim], hasMore: false });
  assert.throws(() => parseVipFailedRewardPage({
    claims: [{ ...failedClaim, recipientId: 'not-a-telegram-id' }],
    hasMore: false,
  }));
  assert.throws(() => parseVipFailedRewardPage({
    claims: [{ ...failedClaim, manualRetryCount: 4 }],
    hasMore: false,
  }));
});

test('admins can see the recipient and safely trigger a failed reward message retry', () => {
  let retriedId = null;
  const tree = VipCampaignPanel({
    ...props,
    failedRewardCampaignId: campaignId,
    failedRewardClaims: [failedClaim],
    failedRewardClaimsHasMore: true,
    onRetryFailedReward: (id) => { retriedId = id; },
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Claim 874a9e0a/);
  assert.match(html, /Recipient: @member_test/);
  assert.match(html, /12 VIP days · 5 attempts · 1\/3 manual retries/);
  assert.match(html, /Retry notification/);
  assert.match(html, /Load more failed messages/);

  const retryButton = findElement(tree, (node) =>
    node.type === 'button' && node.props['aria-label'] === copy.failedRewardRetry
  );
  assert.ok(retryButton);
  retryButton.props.onClick();
  assert.equal(retriedId, failedClaim.id);
});

test('failed reward claims at the manual retry limit cannot be retried again', () => {
  const tree = VipCampaignPanel({
    ...props,
    failedRewardCampaignId: campaignId,
    failedRewardClaims: [{ ...failedClaim, manualRetryCount: 3 }],
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Retry limit reached/);
  assert.doesNotMatch(html, /Retry notification/);
});

test('active campaigns expose a stop action that targets only that campaign', () => {
  let stoppedId = null;
  const tree = VipCampaignPanel({ ...props, onStop: (id) => { stoppedId = id; } });
  const stopButton = findElement(tree, (node) =>
    node.type === 'button' && node.props['aria-label'] === copy.stop
  );

  assert.ok(stopButton);
  stopButton.props.onClick();
  assert.equal(stoppedId, campaignId);
});

test('stopping preserves campaign details and hides the stop action for inactive campaigns', () => {
  const inactive = { ...campaign, isActive: false };
  const tree = VipCampaignPanel({ ...props, campaigns: [inactive], hasMore: false });
  const html = renderToStaticMarkup(tree);

  assert.match(html, /Inactive/);
  assert.match(html, /Issued claims: 7/);
  assert.doesNotMatch(html, /Stop campaign/);
});

test('cutoff campaigns show as ended while remaining stoppable until deactivated', () => {
  const ended = { ...campaign, cutoffAt: '2026-01-01T00:00:00.000Z' };

  assert.equal(getVipCampaignStatus(ended, Date.parse('2026-02-01T00:00:00.000Z')), 'ended');
  const html = renderToStaticMarkup(VipCampaignPanel({ ...props, campaigns: [ended], hasMore: false }));
  assert.match(html, /Eligibility ended/);
  assert.match(html, /Stop campaign/);
});

test('campaign response parser rejects malformed counts and inconsistent cutoff settings', () => {
  assert.deepEqual(parseVipCampaignPage({ campaigns: [campaign], hasMore: false }), {
    campaigns: [campaign],
    hasMore: false,
  });
  assert.throws(() => parseVipCampaignPage({
    campaigns: [{ ...campaign, claimCount: -1 }],
    hasMore: false,
  }), /Invalid campaign list response/);
  assert.throws(() => parseVipCampaignPage({
    campaigns: [{ ...campaign, failedRewardNotificationCount: -1 }],
    hasMore: false,
  }), /Invalid campaign list response/);
  assert.throws(() => parseVipCampaignPage({
    campaigns: [{ ...campaign, cutoffAt: null }],
    hasMore: false,
  }), /Invalid campaign list response/);
  assert.throws(() => parseVipCampaignPage({
    campaigns: [{ ...campaign, sourceBotKey: 'botC' }],
    hasMore: false,
  }), /Invalid campaign list response/);
});

test('campaigns still load when an older backend omits failed-notification counts', () => {
  const olderCampaign = { ...campaign };
  delete olderCampaign.failedRewardNotificationCount;
  const page = parseVipCampaignPage({ campaigns: [olderCampaign], hasMore: false });

  assert.equal(page.campaigns[0].failedRewardNotificationCount, null);
  const html = renderToStaticMarkup(VipCampaignPanel({
    ...props,
    campaigns: page.campaigns,
    hasMore: false,
  }));
  assert.match(html, /Failed reward message count unavailable on the current backend/);
  assert.doesNotMatch(html, /Review failed messages/);
});

test('legacy campaigns are labeled as shared across both apps', () => {
  const legacy = { ...campaign, sourceBotKey: null, announcementStatus: 'not_applicable' };
  assert.deepEqual(parseVipCampaignPage({ campaigns: [legacy], hasMore: false }), {
    campaigns: [legacy],
    hasMore: false,
  });
  const html = renderToStaticMarkup(VipCampaignPanel({
    ...props,
    campaigns: [legacy],
    hasMore: false,
  }));
  assert.match(html, /Legacy campaign · both apps/);
  assert.match(html, /Announcement: Legacy campaign; no announcement/);
});

test('campaign response parser accepts rolling one-day and three-day windows', () => {
  for (const eligibilityWindow of ['1_day', '3_days']) {
    const parsed = parseVipCampaignPage({
      campaigns: [{ ...campaign, eligibilityWindow }],
      hasMore: false,
    });
    assert.equal(parsed.campaigns[0].eligibilityWindow, eligibilityWindow);
    const html = renderToStaticMarkup(VipCampaignPanel({
      ...props,
      campaigns: [{ ...campaign, eligibilityWindow }],
      hasMore: false,
    }));
    assert.match(html, new RegExp(`Login window: ${eligibilityWindow === '1_day' ? '1 day' : '3 days'}`));
  }
});
