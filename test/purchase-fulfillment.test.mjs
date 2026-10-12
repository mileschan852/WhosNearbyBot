import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFlyingMessageFulfillmentMessage,
  getPurchaseFulfillmentOutcome,
  getRafflePurchaseOutcome,
} from '../src/utils/purchase-fulfillment.js';

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
