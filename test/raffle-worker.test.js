import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import worker from "../worker.js";

const botToken = "raffle-test-bot-token";
const webhookSecret = "raffle-test-webhook-secret";
const env = {
  BOT_A_TOKEN: botToken,
  TELEGRAM_WEBHOOK_SECRET: webhookSecret,
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_KEY: "test-key",
};
const ticketIntentId = "12345678-1234-4234-8234-123456789abc";
const originalFetch = globalThis.fetch;
let calls;
let requestSequence;
let completionResult;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeInitData(user) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "raffle-test-query",
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

const adultUser = { id: 123456, first_name: "Raffle", username: "raffle_member" };

async function request(path, {
  body = {},
  user = adultUser,
  method = "POST",
  headers = {},
} = {}) {
  const requestHeaders = {
    "cf-connecting-ip": `192.0.2.${requestSequence++}`,
    ...headers,
  };
  const init = { method, headers: requestHeaders };
  if (method !== "GET") {
    requestHeaders["Content-Type"] = "application/json";
    init.body = JSON.stringify({
      ...body,
      ...(path === "/telegram-webhook" ? {} : {
        initData: makeInitData(user),
        bot: "botA",
      }),
    });
  }
  const response = await worker.fetch(new Request(`https://worker.test${path}`, init), env);
  let result = null;
  try { result = await response.json(); } catch {}
  return { response, result };
}

beforeEach(() => {
  calls = [];
  requestSequence = 10;
  completionResult = { ok: true };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });

    if (url.hostname === "supabase.test") {
      if (url.pathname === "/rest/v1/profiles") {
        if (url.searchParams.get("select") === "dob,is_underage") {
          return jsonResponse([{ dob: "1990-04-15", is_underage: false }]);
        }
        if (url.searchParams.get("select") === "vip_expiry") return jsonResponse([]);
      }
      if (url.pathname === "/rest/v1/rpc/get_raffle_state") {
        return jsonResponse({
          roundKey: "2026-11",
          closesAt: "2026-11-01T12:00:00+00:00",
          serverNow: "2026-10-10T00:00:00+00:00",
          ticketCount: 7,
          userTicketCount: 2,
          latestDraw: null,
        });
      }
      if (url.pathname === "/rest/v1/rpc/create_raffle_ticket_intent") {
        return jsonResponse({ ok: true, roundKey: "2026-11", closesAt: "2026-11-01T12:00:00+00:00" });
      }
      if (url.pathname === "/rest/v1/rpc/mark_raffle_ticket_prechecked") {
        return jsonResponse({ ok: true });
      }
      if (url.pathname === "/rest/v1/rpc/complete_raffle_ticket_payment") {
        return jsonResponse(completionResult);
      }
      if (url.pathname === "/rest/v1/rpc/mark_raffle_ticket_refunded") {
        return jsonResponse({ ok: true });
      }
      if (url.pathname === "/rest/v1/rpc/draw_due_raffle_rounds") {
        return jsonResponse({ drawnRounds: 0 });
      }
      if (url.pathname === "/rest/v1/raffle_ticket_intents" && method === "PATCH") {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected Supabase request: ${method} ${url.pathname}${url.search}`);
    }

    if (url.hostname === "api.telegram.org") {
      if (url.pathname.endsWith("/createInvoiceLink")) {
        return jsonResponse({ ok: true, result: "https://t.me/invoice/raffle-test" });
      }
      if (url.pathname.endsWith("/answerPreCheckoutQuery")) return jsonResponse({ ok: true, result: true });
      if (url.pathname.endsWith("/refundStarPayment")) return jsonResponse({ ok: true, result: true });
    }
    throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("raffle state returns aggregate counts and checks the signed user's eligibility", async () => {
  const { response, result } = await request("/api/raffle/state");
  assert.equal(response.status, 200);
  assert.equal(result.ticketCount, 7);
  assert.equal(result.userTicketCount, 2);
  assert.equal(result.canPurchase, true);
  assert.equal(result.usernameRequired, false);
  assert.ok(calls.some(({ url }) => url.pathname === "/rest/v1/rpc/get_raffle_state"));
});

test("raffle purchase rejects a user without a Telegram username before creating an invoice", async () => {
  const { response, result } = await request("/api/raffle/ticket", {
    user: { id: 123456, first_name: "No username" },
  });
  assert.equal(response.status, 403);
  assert.match(result.error, /username/i);
  assert.equal(calls.length, 0);
});

test("raffle ticket invoice is fixed to 100 Telegram Stars and binds the signed account", async () => {
  const { response, result } = await request("/api/raffle/ticket");
  assert.equal(response.status, 200);
  assert.match(result.invoiceLink, /^https:\/\/t\.me\/invoice/);
  assert.equal(result.amount, 100);
  const intentCall = calls.find(({ url }) => url.pathname === "/rest/v1/rpc/create_raffle_ticket_intent");
  assert.equal(intentCall.body.p_tg_id, "123456");
  assert.equal(intentCall.body.p_username, "raffle_member");
  const invoiceCall = calls.find(({ url }) => url.pathname.endsWith("/createInvoiceLink"));
  assert.equal(invoiceCall.body.currency, "XTR");
  assert.equal(invoiceCall.body.prices[0].amount, 100);
  assert.match(invoiceCall.body.payload, new RegExp(`^rt1\\|${result.intentId}\\|botA\\|123456\\|100$`));
});

test("raffle pre-checkout verifies username, account, price and currency", async () => {
  const { response } = await request("/telegram-webhook", {
    method: "POST",
    body: {
      pre_checkout_query: {
        id: "pre-checkout-1",
        from: adultUser,
        currency: "XTR",
        total_amount: 100,
        invoice_payload: `rt1|${ticketIntentId}|botA|123456|100`,
      },
    },
    headers: { "x-telegram-bot-api-secret-token": webhookSecret },
  });
  assert.equal(response.status, 200);
  assert.equal(
    calls.find(({ url }) => url.pathname.endsWith("/answerPreCheckoutQuery")).body.ok,
    true,
  );
  const rpc = calls.find(({ url }) => url.pathname === "/rest/v1/rpc/mark_raffle_ticket_prechecked");
  assert.equal(rpc.body.p_username, "raffle_member");
  assert.equal(rpc.body.p_amount, 100);
});

test("an ineligible Stars payment is refunded and marked refunded", async () => {
  completionResult = { ok: false, refund: true, reason: "not_eligible" };
  const { response } = await request("/telegram-webhook", {
    method: "POST",
    body: {
      message: {
        from: adultUser,
        successful_payment: {
          invoice_payload: `rt1|${ticketIntentId}|botA|123456|100`,
          currency: "XTR",
          total_amount: 100,
          telegram_payment_charge_id: "telegram-charge-123",
          provider_payment_charge_id: "",
        },
      },
    },
    headers: { "x-telegram-bot-api-secret-token": webhookSecret },
  });
  assert.equal(response.status, 200);
  const refund = calls.find(({ url }) => url.pathname.endsWith("/refundStarPayment"));
  assert.equal(refund.body.user_id, 123456);
  assert.equal(refund.body.telegram_payment_charge_id, "telegram-charge-123");
  assert.ok(calls.some(({ url }) => url.pathname === "/rest/v1/rpc/mark_raffle_ticket_refunded"));
});

test("scheduled raffle handler calls the due-round drawing RPC", async () => {
  let scheduledPromise;
  worker.scheduled({}, env, { waitUntil(promise) { scheduledPromise = promise; } });
  await scheduledPromise;
  assert.ok(calls.some(({ url }) => url.pathname === "/rest/v1/rpc/draw_due_raffle_rounds"));
});
