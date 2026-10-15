export type PurchaseFulfillmentOutcome =
  | 'fulfilled'
  | 'pending'
  | 'cancelled'
  | 'unsupported';

export function getPurchaseFulfillmentOutcome(
  paymentStatus: string,
  expectedIntentId: string | null | undefined,
  response: unknown,
): PurchaseFulfillmentOutcome;

export type FlyingMessageFulfillmentMessage = {
  id: string;
  tg_id: string;
  text: string;
  from_name: string;
  created_at: string;
  audience_bot: 'botA' | 'botB';
};

export function getFlyingMessageFulfillmentMessage(
  paymentStatus: string,
  expectedIntentId: string | null | undefined,
  response: unknown,
  expectedTgId: string | null | undefined,
  expectedBot: string,
): FlyingMessageFulfillmentMessage | null;

export type FlyingMessagePurchaseOutcome =
  | PurchaseFulfillmentOutcome
  | 'refunded'
  | 'rejected';

export function getFlyingMessagePurchaseResolution(
  paymentStatus: string,
  expectedIntentId: string | null | undefined,
  response: unknown,
  expectedTgId: string | null | undefined,
  expectedBot: string,
): {
  outcome: FlyingMessagePurchaseOutcome;
  message: FlyingMessageFulfillmentMessage | null;
};

export function getFlyingMessageDraftAfterOutcome(
  currentDraft: string,
  submittedText: string,
  outcome: FlyingMessagePurchaseOutcome,
): string;

export type FlyingMessageNoticeState = {
  message: string;
  persistent: boolean;
};

export function createFlyingMessageNotice(
  message?: string,
  persistent?: boolean,
): FlyingMessageNoticeState;

export function getFlyingMessageNoticeAfterMessage(
  currentNotice: FlyingMessageNoticeState,
  message: string,
  persistent?: boolean,
): FlyingMessageNoticeState;

export function shouldPersistFlyingMessageOutcome(
  outcome: FlyingMessagePurchaseOutcome,
): boolean;

export function shouldAutoDismissFlyingMessageNotice(
  notice: FlyingMessageNoticeState,
): boolean;

export function getFlyingMessageNoticeAfterDismissal(): FlyingMessageNoticeState;

export type RafflePurchaseOutcome = PurchaseFulfillmentOutcome | 'refunded' | 'rejected';

export function getRafflePurchaseOutcome(
  paymentStatus: string,
  expectedIntentId: string | null | undefined,
  response: unknown,
): RafflePurchaseOutcome;
