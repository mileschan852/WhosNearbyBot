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

export type RafflePurchaseOutcome = PurchaseFulfillmentOutcome | 'refunded' | 'rejected';

export function getRafflePurchaseOutcome(
  paymentStatus: string,
  expectedIntentId: string | null | undefined,
  response: unknown,
): RafflePurchaseOutcome;
