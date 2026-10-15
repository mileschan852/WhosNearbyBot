export function getPurchaseFulfillmentOutcome(paymentStatus, expectedIntentId, response) {
  if (paymentStatus === 'unsupported') return 'unsupported';
  if (paymentStatus !== 'paid') return 'cancelled';
  if (
    typeof expectedIntentId !== 'string' ||
    !expectedIntentId ||
    !response ||
    typeof response !== 'object'
  ) {
    return 'pending';
  }
  return response.status === 'fulfilled' && response.intentId === expectedIntentId
    ? 'fulfilled'
    : 'pending';
}

export function getFlyingMessageFulfillmentMessage(
  paymentStatus,
  expectedIntentId,
  response,
  expectedTgId,
  expectedBot,
) {
  if (
    getPurchaseFulfillmentOutcome(paymentStatus, expectedIntentId, response) !== 'fulfilled' ||
    typeof expectedTgId !== 'string' ||
    !expectedTgId ||
    !['botA', 'botB'].includes(expectedBot)
  ) {
    return null;
  }

  const message = response.message;
  if (
    !message ||
    typeof message !== 'object' ||
    typeof message.id !== 'string' ||
    !message.id ||
    typeof message.tg_id !== 'string' ||
    message.tg_id !== expectedTgId ||
    typeof message.text !== 'string' ||
    !message.text.trim() ||
    typeof message.from_name !== 'string' ||
    typeof message.created_at !== 'string' ||
    !message.created_at ||
    message.audience_bot !== expectedBot
  ) {
    return null;
  }

  return message;
}

export function getFlyingMessagePurchaseResolution(
  paymentStatus,
  expectedIntentId,
  response,
  expectedTgId,
  expectedBot,
) {
  const outcome = getPurchaseFulfillmentOutcome(paymentStatus, expectedIntentId, response);
  if (outcome === 'fulfilled') {
    const message = getFlyingMessageFulfillmentMessage(
      paymentStatus,
      expectedIntentId,
      response,
      expectedTgId,
      expectedBot,
    );
    return message
      ? { outcome: 'fulfilled', message }
      : { outcome: 'pending', message: null };
  }
  if (outcome !== 'pending') return { outcome, message: null };
  if (
    typeof expectedIntentId !== 'string' ||
    !expectedIntentId ||
    !response ||
    typeof response !== 'object' ||
    response.intentId !== expectedIntentId
  ) {
    return { outcome: 'pending', message: null };
  }
  if (response.status === 'refunded') return { outcome: 'refunded', message: null };
  if (response.status === 'rejected' || response.status === 'failed') {
    return { outcome: 'rejected', message: null };
  }
  if (response.status === 'cancelled') return { outcome: 'cancelled', message: null };
  return { outcome: 'pending', message: null };
}

export function getFlyingMessageDraftAfterOutcome(currentDraft, submittedText, outcome) {
  if (outcome !== 'fulfilled' || typeof currentDraft !== 'string') return currentDraft;
  return currentDraft.trim() === submittedText ? '' : currentDraft;
}

export function createFlyingMessageNotice(message = '', persistent = false) {
  const visibleMessage = typeof message === 'string' ? message : '';
  return {
    message: visibleMessage,
    persistent: Boolean(visibleMessage) && persistent === true,
  };
}

export function getFlyingMessageNoticeAfterMessage(currentNotice, message, persistent = false) {
  if (currentNotice?.persistent === true) return currentNotice;
  return createFlyingMessageNotice(message, persistent);
}

export function shouldPersistFlyingMessageOutcome(outcome) {
  return outcome === 'refunded' || outcome === 'rejected';
}

export function shouldAutoDismissFlyingMessageNotice(notice) {
  return Boolean(notice?.message) && notice.persistent !== true;
}

export function getFlyingMessageNoticeAfterDismissal() {
  return createFlyingMessageNotice();
}

export function getRafflePurchaseOutcome(paymentStatus, expectedIntentId, response) {
  const fulfillment = getPurchaseFulfillmentOutcome(paymentStatus, expectedIntentId, response);
  if (fulfillment !== 'pending') return fulfillment;
  if (
    paymentStatus !== 'paid' ||
    typeof expectedIntentId !== 'string' ||
    !expectedIntentId ||
    !response ||
    typeof response !== 'object' ||
    response.intentId !== expectedIntentId
  ) {
    return 'pending';
  }
  if (response.status === 'refunded') return 'refunded';
  if (response.status === 'rejected' || response.status === 'failed') return 'rejected';
  if (response.status === 'cancelled') return 'cancelled';
  return 'pending';
}
