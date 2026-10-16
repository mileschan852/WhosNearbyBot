import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import {
  getVipCampaignStatus,
  parseVipCampaignPage,
  parseVipFailedRewardPage,
  parseVipFailureAlertAcknowledgement,
  parseVipFailureAlertSummary,
  parseVipRewardNotificationQueueHealth,
  parseVipRewardRetryAuditPage,
  startVipFailureAlertPolling,
  VIP_FAILURE_ALERT_POLL_INTERVAL_MS,
  VipCampaignPanel,
} from '../src/components/vip-campaign-panel.js';
import { VipGrantNoticeDialog } from '../src/components/vip-grant-notice-dialog.js';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
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
  crossCampaignFailedRewardsTitle: 'Failed reward messages across campaigns',
  crossCampaignFailedRewardsPlaceholder: 'Search username or Telegram account ID',
  crossCampaignFailedRewardsSearch: 'Search all campaigns',
  crossCampaignFailedRewardsSourceBot: 'Source app',
  crossCampaignFailedRewardsAllSources: 'All apps',
  crossCampaignFailedRewardsInitialHint: 'Search by username or account ID, or choose a source app.',
  crossCampaignFailedRewardsDetails: 'Campaign {campaign} · source {source} · notification bot {bot}',
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
  retryAuditToggle: 'View retry audit',
  retryAuditTitle: 'Manual retry audit',
  retryAuditEmpty: 'No manual retries are recorded for this campaign.',
  retryAuditLoading: 'Loading retry audit…',
  retryAuditLoadFailed: 'Could not load retry audit.',
  retryAuditEntry: 'Admin {admin} · {time} · claim {claim} · campaign {source} · notification bot {bot} · result {outcome}',
  retryAuditPending: 'Pending',
  retryAuditDelivered: 'Delivered',
  retryAuditFailed: 'Failed',
  retryAuditUncertain: 'Delivery uncertain',
  retryAuditLoadMore: 'Load more retry records',
  newFailureAlertTitle: 'New failed VIP reward messages: {count}',
  newFailureAlertSeparate: 'These reward DMs are separate from public campaign announcements.',
  newFailureAlertLatest: 'Latest reward failure: {time}',
  newFailureAlertChecking: 'Checking for new failed reward messages…',
  newFailureAlertLoadFailed: 'Could not check for new reward messages.',
  queueHealthTitle: 'VIP reward delivery queue health',
  queueHealthSeparate: 'Pending is overdue after 10 minutes; sending appears after its lease expires. Excludes terminal failures and public announcements.',
  queueHealthPending: 'Overdue pending: {count}',
  queueHealthExpiredSending: 'Expired sending leases: {count}',
  queueHealthOldest: 'Oldest wait: {time} · {minutes} min',
  queueHealthEmpty: 'No overdue pending or expired sending notices.',
  queueHealthChecking: 'Checking scheduled reward queue…',
  queueHealthLoadFailed: 'Could not load scheduled reward queue health.',
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
  crossCampaignFailedRewardSearchValue: '',
  crossCampaignFailedRewardSourceBotKey: 'all',
  crossCampaignFailedRewardSearched: false,
  crossCampaignFailedRewardClaims: [],
  crossCampaignFailedRewardClaimsHasMore: false,
  crossCampaignFailedRewardClaimsLoading: false,
  crossCampaignFailedRewardClaimsError: '',
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
  onCrossCampaignFailedRewardSearchChange() {},
  onCrossCampaignFailedRewardSourceChange() {},
  onSearchCrossCampaignFailedRewards() {},
  onLoadMoreCrossCampaignFailedRewards() {},
  onToggleRetryAudit() {},
  onLoadMoreRetryAudit() {},
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
const retryAuditRecord = {
  id: 'f847d3a9-9dd4-4d21-9f22-cbe4f85d7a91',
  claimId: failedClaim.id,
  adminTgId: 'tg_123456',
  adminUsername: 'mileschan852',
  retriedAt: '2026-11-03T00:00:00.000Z',
  sourceBotKey: 'botA',
  originalBotKey: 'botB',
  deliveryOutcome: 'delivered',
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

function compileAcknowledgeVipGrantHandler(environment) {
  environment.vipGrantAcknowledgementLockRef ??= { current: false };
  environment.setVipGrantAcknowledging ??= () => {};
  environment.setVipGrantAcknowledgementError ??= () => {};
  environment.vipGrantCopy ??= {
    en: {
      popupAckFailed: 'Could not save your confirmation. Please try again.',
      popupRetry: 'Retry',
      popupSaving: 'Saving…',
    },
  };
  environment.lang ??= 'en';
  const startMarker = 'const handleAcknowledgeVipGrant = async () => {';
  const endMarker = '\n  const handleSaveFlyingPrice = async () => {';
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, `expected App.tsx to contain ${startMarker}`);
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, `expected App.tsx to contain ${endMarker}`);

  const source = [
    appSource.slice(start, end),
    'this.__handleAcknowledgeVipGrant = handleAcknowledgeVipGrant;',
  ].join('\n');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  runInNewContext(transpiled, environment);
  return environment.__handleAcknowledgeVipGrant;
}

function compileVipGrantNoticeMapping(environment) {
  const startMarker = 'const pendingVipGrant = authResponse.vipGrantNotice;';
  const endMarker = "\n        setIsAdmin(authResponse.role === 'admin');";
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, `expected App.tsx to contain ${startMarker}`);
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, `expected App.tsx to contain ${endMarker}`);

  const source = [
    'this.__applyVipGrantNotice = () => {',
    appSource.slice(start, end),
    '};',
  ].join('\n');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  runInNewContext(transpiled, environment);
  return environment.__applyVipGrantNotice;
}

test('VIP reward dialog focuses Confirm and traps Tab in both directions', () => {
  const dialog = VipGrantNoticeDialog({
    title: 'VIP reward',
    body: 'Your account received 3 VIP days.',
    confirmLabel: 'Confirm',
    onConfirm() {},
    onDismiss() {},
  });
  const html = renderToStaticMarkup(dialog);
  const confirmButton = findElement(dialog, (node) => node.type === 'button');
  assert.ok(confirmButton);
  assert.equal(confirmButton.props.autoFocus, true);
  assert.match(html, /autofocus=""/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);

  let activeElement;
  let confirmFocusCount = 0;
  const focusTarget = {
    focus() {
      activeElement = focusTarget;
      confirmFocusCount += 1;
    },
  };
  activeElement = focusTarget;
  const focusableElements = [focusTarget];
  focusableElements.item = (index) => focusableElements[index] ?? null;
  const currentTarget = {
    ownerDocument: {
      get activeElement() {
        return activeElement;
      },
    },
    querySelectorAll() {
      return focusableElements;
    },
    contains(element) {
      return element === focusTarget;
    },
  };

  for (const shiftKey of [false, true]) {
    let prevented = false;
    dialog.props.onKeyDown({
      key: 'Tab',
      shiftKey,
      currentTarget,
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true, `${shiftKey ? 'Shift+Tab' : 'Tab'} stays in the dialog`);
    assert.equal(activeElement, focusTarget);
  }
  assert.equal(confirmFocusCount, 2);
});

test('Escape dismisses the VIP reward dialog without acknowledging the reward', () => {
  const calls = [];
  const environment = {
    vipGrantNotice: { claimIds: ['claim-escape'], days: 3 },
    setVipGrantNotice(value) {
      calls.push(['close', value]);
    },
    workerPost: async (...args) => calls.push(['post', ...args]),
    console: { error() {} },
  };
  const onConfirm = compileAcknowledgeVipGrantHandler(environment);
  let dismissed = false;
  const dialog = VipGrantNoticeDialog({
    title: 'VIP reward',
    body: 'Your account received 3 VIP days.',
    confirmLabel: 'Confirm',
    onConfirm,
    onDismiss() {
      dismissed = true;
    },
  });
  let prevented = false;

  dialog.props.onKeyDown({
    key: 'Escape',
    shiftKey: false,
    currentTarget: {
      ownerDocument: { activeElement: null },
      querySelectorAll() {
        return [];
      },
      contains() {
        return false;
      },
    },
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(dismissed, true);
  assert.deepEqual(calls, []);
  assert.match(appSource, /onDismiss=\{\(\) => \{/);
  assert.match(appSource, /if \(vipGrantAcknowledgementLockRef\.current\) return;/);
});

test('Confirm acknowledges the pending VIP reward claim IDs', async () => {
  const calls = [];
  const environment = {
    vipGrantNotice: { claimIds: ['claim-confirm-1', 'claim-confirm-2'], days: 3 },
    setVipGrantNotice(value) {
      calls.push(['close', value]);
    },
    workerPost: async (...args) => {
      calls.push(['post', ...args]);
      return { acknowledged: true };
    },
    console: { error() {} },
  };
  const onConfirm = compileAcknowledgeVipGrantHandler(environment);
  const dialog = VipGrantNoticeDialog({
    title: 'VIP reward',
    body: 'Your account received 3 VIP days.',
    confirmLabel: 'Confirm',
    onConfirm,
    onDismiss() {},
  });
  const confirmButton = findElement(dialog, (node) => node.type === 'button');

  assert.ok(confirmButton);
  await confirmButton.props.onClick();
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ['post', '/api/vip-grants/ack', { claimIds: ['claim-confirm-1', 'claim-confirm-2'] }],
    ['close', null],
  ]));
  assert.match(appSource, /onConfirm=\{handleAcknowledgeVipGrant\}/);
});

test('a combined login reward displays its total VIP days and confirms both claim IDs', async () => {
  const state = { notice: null, acknowledgementError: '' };
  const postCalls = [];
  const copy = {
    en: {
      popupTitle: 'VIP reward received',
      popupBody: 'Your account received {days} VIP days.',
      popupConfirm: 'Confirm',
      popupRetry: 'Retry',
      popupSaving: 'Saving…',
      popupAckFailed: 'Could not save your confirmation. Please try again.',
    },
  };
  const environment = {
    authResponse: {
      vipGrantNotice: {
        claimIds: ['claim-combined-1', 'claim-combined-2'],
        days: 18,
        vipUntil: '2027-01-01T00:00:00.000Z',
      },
    },
    setVipGrantNotice(value) {
      state.notice = value;
      environment.vipGrantNotice = value;
    },
    setVipGrantAcknowledgementError(value) {
      state.acknowledgementError = value;
    },
    vipGrantCopy: copy,
    lang: 'en',
    workerPost: async (...args) => {
      postCalls.push(args);
      return { ok: true };
    },
    console: { error() {} },
  };
  compileVipGrantNoticeMapping(environment)();
  assert.equal(JSON.stringify(state.notice), JSON.stringify({
    claimIds: ['claim-combined-1', 'claim-combined-2'],
    days: 18,
    vipUntil: '2027-01-01T00:00:00.000Z',
  }));
  assert.match(
    appSource,
    /body=\{vipGrantCopy\[lang\]\.popupBody\.replace\('\{days\}', String\(vipGrantNotice\.days\)\)\}/,
    'the dialog body uses the combined days from the login response',
  );

  const onConfirm = compileAcknowledgeVipGrantHandler(environment);
  const dialog = VipGrantNoticeDialog({
    title: copy.en.popupTitle,
    body: copy.en.popupBody.replace('{days}', String(state.notice.days)),
    confirmLabel: copy.en.popupConfirm,
    onConfirm,
    onDismiss() {},
  });
  const html = renderToStaticMarkup(dialog);
  const confirmButton = findElement(dialog, (node) => node.type === 'button');
  assert.match(html, /Your account received 18 VIP days\./);
  await confirmButton.props.onClick();
  assert.equal(JSON.stringify(postCalls), JSON.stringify([
    ['/api/vip-grants/ack', { claimIds: ['claim-combined-1', 'claim-combined-2'] }],
  ]));
  assert.equal(state.notice, null);
});

test('failed VIP reward acknowledgement stays visible and can be retried', async () => {
  const notice = { claimIds: ['claim-retry'], days: 3 };
  const state = { notice, error: '', acknowledging: false, attempts: 0 };
  const postCalls = [];
  let rejectFirstAttempt;
  const environment = {
    vipGrantNotice: notice,
    vipGrantAcknowledgementLockRef: { current: false },
    setVipGrantNotice(value) {
      state.notice = value;
      environment.vipGrantNotice = value;
    },
    setVipGrantAcknowledging(value) {
      state.acknowledging = value;
    },
    setVipGrantAcknowledgementError(value) {
      state.error = value;
    },
    vipGrantCopy: {
      en: {
        popupAckFailed: 'Could not save your confirmation. Please try again.',
        popupRetry: 'Retry',
        popupSaving: 'Saving…',
      },
    },
    lang: 'en',
    workerPost: async (...args) => {
      state.attempts += 1;
      postCalls.push(args);
      if (state.attempts === 1) {
        return new Promise((_, reject) => {
          rejectFirstAttempt = reject;
        });
      }
      return { ok: true };
    },
    console: { error() {} },
  };
  const onConfirm = compileAcknowledgeVipGrantHandler(environment);
  const renderDialog = () => VipGrantNoticeDialog({
    title: 'VIP reward',
    body: 'Your account received 3 VIP days.',
    confirmLabel: 'Confirm',
    retryLabel: environment.vipGrantCopy.en.popupRetry,
    confirmingLabel: environment.vipGrantCopy.en.popupSaving,
    confirming: state.acknowledging,
    errorMessage: state.error,
    onConfirm,
    onDismiss() {},
  });

  const firstDialog = renderDialog();
  const firstConfirm = findElement(firstDialog, (node) => node.type === 'button');
  const firstAttempt = firstConfirm.props.onClick();
  assert.equal(state.acknowledging, true);
  const busyConfirm = findElement(renderDialog(), (node) => node.type === 'button');
  assert.equal(busyConfirm.props.disabled, true);
  assert.equal(busyConfirm.props.children, 'Saving…');
  await busyConfirm.props.onClick();
  assert.equal(state.attempts, 1, 'a second click cannot issue a duplicate request');

  rejectFirstAttempt(new Error('temporary connection failure'));
  await firstAttempt;
  assert.equal(state.notice, notice, 'the reward remains pending after a failed acknowledgement');
  assert.equal(state.acknowledging, false);
  assert.equal(
    state.error,
    'Could not save your confirmation. Please try again.',
  );
  const failedDialog = renderDialog();
  const failedHtml = renderToStaticMarkup(failedDialog);
  const retryButton = findElement(failedDialog, (node) => node.type === 'button');
  assert.match(failedHtml, /role="alert"/);
  assert.match(failedHtml, /Could not save your confirmation\. Please try again\./);
  assert.equal(retryButton.props.children, 'Retry');
  assert.equal(retryButton.props.disabled, false);

  await retryButton.props.onClick();
  assert.equal(state.attempts, 2);
  assert.equal(state.notice, null, 'the popup closes only after the Worker acknowledgement succeeds');
  assert.equal(state.error, '');
  assert.equal(JSON.stringify(postCalls), JSON.stringify([
    ['/api/vip-grants/ack', { claimIds: ['claim-retry'] }],
    ['/api/vip-grants/ack', { claimIds: ['claim-retry'] }],
  ]));
});

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

test('failure alert acknowledgement accepts a monotonic server cursor only', () => {
  assert.deepEqual(parseVipFailureAlertAcknowledgement({
    acknowledged: true,
    cursor: { eventId: '15' },
  }, '12'), { eventId: '15' });
  assert.throws(() => parseVipFailureAlertAcknowledgement({
    acknowledged: false,
    cursor: { eventId: '12' },
  }, '12'));
  assert.throws(() => parseVipFailureAlertAcknowledgement({
    acknowledged: true,
    cursor: { eventId: '11' },
  }, '12'));
});

test('failure alert polling is disabled when the panel is not active or account is missing', () => {
  let scheduled = 0;
  const timer = {
    setInterval() {
      scheduled += 1;
      return scheduled;
    },
    clearInterval() {},
  };
  const stopClosed = startVipFailureAlertPolling({
    enabled: false,
    userId: 'tg_123',
    onPoll() {},
    timer,
  });
  const stopNoAccount = startVipFailureAlertPolling({
    enabled: true,
    userId: null,
    onPoll() {},
    timer,
  });

  stopClosed();
  stopNoAccount();
  assert.equal(scheduled, 0);
});

test('failure alert polling cleans up on account changes and does not call stale callbacks', () => {
  let nextHandle = 1;
  const callbacks = new Map();
  const timer = {
    setInterval(callback, intervalMs) {
      assert.equal(intervalMs, VIP_FAILURE_ALERT_POLL_INTERVAL_MS);
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    clearInterval(handle) {
      callbacks.delete(handle);
    },
  };
  let firstAccountPolls = 0;
  let secondAccountPolls = 0;
  const stopFirstAccount = startVipFailureAlertPolling({
    enabled: true,
    userId: 'tg_123',
    onPoll() {
      firstAccountPolls += 1;
    },
    timer,
  });
  const staleCallback = callbacks.get(1);
  staleCallback();
  assert.equal(firstAccountPolls, 1);

  stopFirstAccount();
  const stopSecondAccount = startVipFailureAlertPolling({
    enabled: true,
    userId: 'tg_456',
    onPoll() {
      secondAccountPolls += 1;
    },
    timer,
  });
  staleCallback();
  [...callbacks.values()][0]();
  assert.equal(firstAccountPolls, 1);
  assert.equal(secondAccountPolls, 1);
  assert.equal(callbacks.size, 1);

  stopSecondAccount();
  assert.equal(callbacks.size, 0);
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

test('VIP reward queue health is a separate admin summary from failures and announcements', () => {
  const html = renderToStaticMarkup(VipCampaignPanel({
    ...props,
    queueHealth: {
      overduePendingCount: 3,
      expiredSendingCount: 2,
      oldestWaitingAt: '2030-01-02T00:00:00.000Z',
      oldestWaitingSeconds: 7200,
    },
    newFailureAlert: {
      newFailureCount: 1,
      latestFailureAt: '2030-01-03T00:00:00.000Z',
      cursor: { eventId: '12' },
    },
  }));

  assert.match(html, /data-testid="region-vip-reward-queue-health"/);
  assert.match(html, /VIP reward delivery queue health/);
  assert.match(html, /Overdue pending: 3/);
  assert.match(html, /Expired sending leases: 2/);
  assert.match(html, /Oldest wait: Dec 1, 2026 · 120 min/);
  assert.match(html, /New failed VIP reward messages: 1/);
  assert.match(html, /Announcement: Queued/);
});

test('VIP reward queue health parser validates counts, timestamp and empty summary', () => {
  assert.deepEqual(parseVipRewardNotificationQueueHealth({
    overduePendingCount: 2,
    expiredSendingCount: 1,
    oldestWaitingAt: '2030-01-02T00:00:00.000Z',
    oldestWaitingSeconds: 300,
  }), {
    overduePendingCount: 2,
    expiredSendingCount: 1,
    oldestWaitingAt: '2030-01-02T00:00:00.000Z',
    oldestWaitingSeconds: 300,
  });
  assert.deepEqual(parseVipRewardNotificationQueueHealth({
    overduePendingCount: 0,
    expiredSendingCount: 0,
    oldestWaitingAt: null,
    oldestWaitingSeconds: null,
  }), {
    overduePendingCount: 0,
    expiredSendingCount: 0,
    oldestWaitingAt: null,
    oldestWaitingSeconds: null,
  });
  assert.throws(() => parseVipRewardNotificationQueueHealth({
    overduePendingCount: -1,
    expiredSendingCount: 0,
    oldestWaitingAt: null,
    oldestWaitingSeconds: null,
  }));
  assert.throws(() => parseVipRewardNotificationQueueHealth({
    overduePendingCount: 1,
    expiredSendingCount: 0,
    oldestWaitingAt: 'not a time',
    oldestWaitingSeconds: 1,
  }));
  assert.throws(() => parseVipRewardNotificationQueueHealth({
    overduePendingCount: 0,
    expiredSendingCount: 0,
    oldestWaitingAt: '2030-01-02T00:00:00.000Z',
    oldestWaitingSeconds: 1,
  }));
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

test('retry audit page parser validates actor, claim, bot keys, time, and outcome', () => {
  const parsed = parseVipRewardRetryAuditPage({
    records: [retryAuditRecord],
    hasMore: false,
  });
  assert.deepEqual(parsed, {
    records: [retryAuditRecord],
    hasMore: false,
  });
  assert.throws(() => parseVipRewardRetryAuditPage({
    records: [{ ...retryAuditRecord, adminTgId: 'not-an-admin-id' }],
    hasMore: false,
  }));
  assert.throws(() => parseVipRewardRetryAuditPage({
    records: [{ ...retryAuditRecord, deliveryOutcome: 'anything' }],
    hasMore: false,
  }));
});

test('admins can review retry actor, time, claim, bot, and outcome', () => {
  const tree = VipCampaignPanel({
    ...props,
    retryAuditCampaignId: campaignId,
    retryAuditRecords: [retryAuditRecord],
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Manual retry audit/);
  assert.match(html, /@mileschan852/);
  assert.match(html, /Dec 1, 2026/);
  assert.match(html, new RegExp(failedClaim.id));
  assert.match(html, /Who&#x27;s Nearby/);
  assert.match(html, /Delivered/);

  let toggledId = null;
  const toggleTree = VipCampaignPanel({
    ...props,
    onToggleRetryAudit: (id) => { toggledId = id; },
  });
  const toggleButton = findElement(toggleTree, (node) =>
    node.type === 'button' && node.props['aria-label'] === undefined &&
      node.props['data-testid'] === `button-toggle-vip-retry-audit-${campaignId}`
  );
  assert.ok(toggleButton);
  toggleButton.props.onClick();
  assert.equal(toggledId, campaignId);
});

test('admins can search and retry failed reward messages across campaigns', () => {
  const otherCampaignId = '0c9c0802-6dd2-4453-a93b-8fef06d1a3d3';
  const crossCampaignClaim = {
    ...failedClaim,
    campaignId: otherCampaignId,
    sourceBotKey: 'botB',
    botKey: 'botA',
  };
  let changedSearch = null;
  let changedSource = null;
  let submitted = null;
  let retriedId = null;
  let loadedMore = false;
  const tree = VipCampaignPanel({
    ...props,
    crossCampaignFailedRewardSearchValue: 'member_test',
    crossCampaignFailedRewardSourceBotKey: 'botB',
    crossCampaignFailedRewardSearched: true,
    crossCampaignFailedRewardClaims: [crossCampaignClaim],
    crossCampaignFailedRewardClaimsHasMore: true,
    onCrossCampaignFailedRewardSearchChange: (value) => { changedSearch = value; },
    onCrossCampaignFailedRewardSourceChange: (value) => { changedSource = value; },
    onSearchCrossCampaignFailedRewards: (search, sourceBot) => {
      submitted = { search, sourceBot };
    },
    onRetryFailedReward: (id) => { retriedId = id; },
    onLoadMoreCrossCampaignFailedRewards: () => { loadedMore = true; },
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Failed reward messages across campaigns/);
  assert.match(html, /Search username or Telegram account ID/);
  assert.match(html, /Campaign 0c9c0802 · source Who&#x27;s Nearby · notification bot HKMO Date/);
  assert.match(html, /Recipient: @member_test/);

  const input = findElement(tree, (node) =>
    node.type === 'input' && node.props['data-testid'] === 'input-cross-campaign-vip-reward-search'
  );
  const sourceSelect = findElement(tree, (node) =>
    node.type === 'select' && node.props['data-testid'] === 'select-cross-campaign-vip-reward-source'
  );
  const form = findElement(tree, (node) =>
    node.type === 'form' && node.props['data-testid'] === 'form-cross-campaign-vip-reward-search'
  );
  assert.ok(input);
  assert.ok(sourceSelect);
  assert.ok(form);
  input.props.onChange({ target: { value: '@member_test' } });
  sourceSelect.props.onChange({ target: { value: 'botA' } });
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(changedSearch, '@member_test');
  assert.equal(changedSource, 'botA');
  assert.deepEqual(submitted, { search: 'member_test', sourceBot: 'botB' });

  const retryButton = findElement(tree, (node) =>
    node.type === 'button' &&
      node.props['data-testid'] === `button-retry-cross-campaign-vip-failure-${crossCampaignClaim.id}`
  );
  retryButton.props.onClick();
  assert.equal(retriedId, crossCampaignClaim.id);
  const loadMoreButton = findElement(tree, (node) =>
    node.type === 'button' &&
      node.props['data-testid'] === 'button-load-more-cross-campaign-vip-failures'
  );
  loadMoreButton.props.onClick();
  assert.equal(loadedMore, true);
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
