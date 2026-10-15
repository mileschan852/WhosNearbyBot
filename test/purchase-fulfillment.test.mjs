import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getFlyingMessageDraftAfterOutcome,
  getFlyingMessageFulfillmentMessage,
  createFlyingMessageNotice,
  getFlyingMessageNoticeAfterDismissal,
  getFlyingMessageNoticeAfterMessage,
  getFlyingMessagePurchaseResolution,
  getPurchaseFulfillmentOutcome,
  getRafflePurchaseOutcome,
  shouldAutoDismissFlyingMessageNotice,
  shouldPersistFlyingMessageOutcome,
} from '../src/utils/purchase-fulfillment.js';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const intentId = '12345678-1234-4234-8234-123456789abc';
const fulfilledResponse = { intentId, status: 'fulfilled' };
const flyingMessage = {
  id: 'flying-message-1',
  tg_id: '123456',
  text: 'Hello nearby',
  from_name: 'Raffle',
  created_at: '2026-10-11T00:00:00.000Z',
  audience_bot: 'botA',
};

test('cancelled and unsupported invoices never complete an order', () => {
  for (const status of ['cancelled', 'failed']) {
    assert.equal(
      getPurchaseFulfillmentOutcome(status, intentId, fulfilledResponse),
      'cancelled',
    );
  }
  assert.equal(
    getPurchaseFulfillmentOutcome('unsupported', intentId, fulfilledResponse),
    'unsupported',
  );
});

test('a paid response stays pending until the matching Worker intent is fulfilled', () => {
  assert.equal(getPurchaseFulfillmentOutcome('paid', intentId, null), 'pending');
  assert.equal(
    getPurchaseFulfillmentOutcome('paid', intentId, { intentId, status: 'pending' }),
    'pending',
  );
  assert.equal(
    getPurchaseFulfillmentOutcome('paid', intentId, {
      intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'fulfilled',
    }),
    'pending',
  );
});

test('only the matching fulfilled Worker intent completes its purchase', () => {
  assert.equal(
    getPurchaseFulfillmentOutcome('paid', intentId, fulfilledResponse),
    'fulfilled',
  );
});

test('a paid flying message confirms only for the matching intent, user, bot, and message', () => {
  const response = { ...fulfilledResponse, message: flyingMessage };
  assert.deepEqual(
    getFlyingMessageFulfillmentMessage('paid', intentId, response, '123456', 'botA'),
    flyingMessage,
  );

  for (const invalidResponse of [
    { ...response, intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { ...response, status: 'pending' },
    { ...response, status: 'refunded' },
    { ...response, status: 'rejected' },
    { ...response, message: { ...flyingMessage, tg_id: '654321' } },
    { ...response, message: { ...flyingMessage, audience_bot: 'botB' } },
    { ...response, message: null },
  ]) {
    assert.equal(
      getFlyingMessageFulfillmentMessage('paid', intentId, invalidResponse, '123456', 'botA'),
      null,
    );
  }

  assert.equal(
    getFlyingMessageFulfillmentMessage('paid', intentId, response, '654321', 'botA'),
    null,
  );
  assert.equal(
    getFlyingMessageFulfillmentMessage('paid', intentId, response, '123456', 'botB'),
    null,
  );
  assert.equal(
    getFlyingMessageFulfillmentMessage('cancelled', intentId, response, '123456', 'botA'),
    null,
  );
});

test('refunded and rejected flying-message payments stop as terminal without sending or clearing the draft', () => {
  const draft = 'Hello nearby';
  for (const [status, outcome] of [
    ['refunded', 'refunded'],
    ['rejected', 'rejected'],
  ]) {
    const resolution = getFlyingMessagePurchaseResolution(
      'paid',
      intentId,
      { ...fulfilledResponse, status, message: flyingMessage },
      '123456',
      'botA',
    );
    assert.deepEqual(resolution, { outcome, message: null });
    assert.equal(getFlyingMessageDraftAfterOutcome(draft, draft, outcome), draft);
  }

  const mismatchedRefund = getFlyingMessagePurchaseResolution(
    'paid',
    intentId,
    { intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'refunded' },
    '123456',
    'botA',
  );
  assert.deepEqual(mismatchedRefund, { outcome: 'pending', message: null });
});

test('the app shows terminal flying-message notices and merges only confirmed messages', () => {
  const handlerStart = appSource.indexOf('const handleSendFlyingMessage = async () => {');
  const handlerEnd = appSource.indexOf('\n  const verifyFilterSubscription', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'flying-message handler is present');
  const handler = appSource.slice(handlerStart, handlerEnd);

  assert.match(handler, /getFlyingMessagePurchaseResolution\(/);
  assert.match(handler, /terminalOutcome = resolution\.outcome;\s*break;/);
  assert.match(handler, /showFlyingMessageNotice\(\s*flyingMessageCopy\[lang\]\.paymentRefunded,\s*shouldPersistFlyingMessageOutcome\(terminalOutcome\),?\s*\)/);
  assert.match(handler, /showFlyingMessageNotice\(\s*flyingMessageCopy\[lang\]\.paymentRejected,\s*shouldPersistFlyingMessageOutcome\(terminalOutcome\),?\s*\)/);
  assert.match(handler, /getFlyingMessageDraftAfterOutcome\(current, text, terminalOutcome\)/);
  assert.match(handler, /if \(paidMessage\) \{\s*mergeFlyingMessages\(\[paidMessage\]\)/);
});

test('refund and rejection notices persist until dismissal or a new send attempt without clearing the draft', () => {
  const handlerStart = appSource.indexOf('const handleSendFlyingMessage = async () => {');
  const handlerEnd = appSource.indexOf('\n  const verifyFilterSubscription', handlerStart);
  const handler = appSource.slice(handlerStart, handlerEnd);
  assert.match(handler, /dismissFlyingMessageNotice\(\);\s*setSendingFlyingMessage\(true\)/);

  const draft = 'Keep this draft';
  for (const outcome of ['refunded', 'rejected']) {
    assert.equal(shouldPersistFlyingMessageOutcome(outcome), true);
    const notice = createFlyingMessageNotice(`payment ${outcome}`, true);
    assert.equal(shouldAutoDismissFlyingMessageNotice(notice), false);
    assert.equal(
      getFlyingMessageNoticeAfterMessage(notice, 'Another notice').message,
      notice.message,
      'other updates cannot replace a terminal payment notice',
    );

    const dismissedNotice = getFlyingMessageNoticeAfterDismissal();
    assert.deepEqual(dismissedNotice, { message: '', persistent: false });
    assert.equal(getFlyingMessageDraftAfterOutcome(draft, draft, outcome), draft);
  }
  assert.equal(shouldPersistFlyingMessageOutcome('cancelled'), false);

  const moduleSource = readFileSync(
    new URL('../src/modules/flying-message/FlyingMessageModule.tsx', import.meta.url),
    'utf8',
  );
  assert.match(moduleSource, /role="status"\s+aria-live="polite"\s+aria-atomic="true"/);
  assert.match(moduleSource, /onClick={onDismissStatus}/);
  assert.match(moduleSource, /aria-label={dismissLabel}/);
  assert.match(moduleSource, /className="flying-message-status-dismiss"/);
  assert.match(appSource, /onDismissStatus={dismissFlyingMessageNotice}/);
  assert.match(moduleSource, /height: showPersistentStatus \? 'auto' : '52px'/);
  assert.ok(
    moduleSource.indexOf('className="flying-message-persistent-status"') <
      moduleSource.indexOf('<form onSubmit={onSubmit}'),
    'the persistent notice is in normal flow before the composer, not positioned over it',
  );

  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(styles, /\.flying-message-status-dismiss:focus-visible/);
  assert.match(styles, /\.flying-message-persistent-status[\s\S]*?overflow-wrap: anywhere/);
  assert.match(styles, /\.flying-message-status-dismiss[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
});

test('a confirmed flying message clears only the unchanged submitted draft', () => {
  const resolution = getFlyingMessagePurchaseResolution(
    'paid',
    intentId,
    { ...fulfilledResponse, message: flyingMessage },
    '123456',
    'botA',
  );
  assert.equal(resolution.outcome, 'fulfilled');
  assert.deepEqual(resolution.message, flyingMessage);
  assert.equal(getFlyingMessageDraftAfterOutcome('Hello nearby', 'Hello nearby', 'fulfilled'), '');
  assert.equal(
    getFlyingMessageDraftAfterOutcome('My edited draft', 'Hello nearby', 'fulfilled'),
    'My edited draft',
  );
});

test('only the matching Worker intent can report a terminal refund or rejection', () => {
  assert.equal(
    getRafflePurchaseOutcome('paid', intentId, { intentId, status: 'refunded' }),
    'refunded',
  );
  assert.equal(
    getRafflePurchaseOutcome('paid', intentId, { intentId, status: 'rejected' }),
    'rejected',
  );
  assert.equal(
    getRafflePurchaseOutcome('paid', intentId, {
      intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'refunded',
    }),
    'pending',
  );
  assert.equal(
    getRafflePurchaseOutcome('paid', intentId, {
      intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'rejected',
    }),
    'pending',
  );
  assert.equal(
    getPurchaseFulfillmentOutcome('paid', intentId, { intentId, status: 'refunded' }),
    'pending',
  );
});
