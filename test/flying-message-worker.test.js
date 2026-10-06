import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import worker from "../worker.js";

const botToken = "test-bot-token";
const env = {
  BOT_A_TOKEN: botToken,
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_KEY: "test-key",
};

const originalFetch = globalThis.fetch;
let calls;
let configuredPrice = 0;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeInitData(user) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "test-query",
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

async function sendMessage(user, ip) {
  const request = new Request("https://worker.test/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify({
      text: "Hello nearby",
      initData: makeInitData(user),
      bot: "botA",
    }),
  });
  const response = await worker.fetch(request, env);
  return { response, body: await response.json() };
}

beforeEach(() => {
  calls = [];
  configuredPrice = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, method: init.method || "GET" });

    if (url.hostname === "supabase.test") {
      if (url.pathname === "/rest/v1/app_settings" && url.searchParams.get("key") === "eq.flying_message_price") {
        return jsonResponse([{ value: String(configuredPrice) }]);
      }
      if (url.pathname === "/rest/v1/app_settings" && url.searchParams.get("key") === "eq.global_vip_until") {
        return jsonResponse([]);
      }
      if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("select") === "vip_expiry") {
        return jsonResponse([]);
      }
      if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("select") === "dob,is_underage") {
        return jsonResponse([{ dob: "1990-01-01", is_underage: false }]);
      }
      if (url.pathname === "/rest/v1/app_roles") {
        const username = (url.searchParams.get("username") || "").replace(/^eq\./, "");
        const roles = {
          admin_test: "admin",
          vip_test: "vip",
        };
        return jsonResponse(roles[username] ? [{ role: roles[username] }] : []);
      }
      if (url.pathname === "/rest/v1/rpc/send_free_flying_message") {
        return jsonResponse({
          ok: true,
          message: {
            id: `message-${calls.length}`,
            tg_id: "123456",
            audience_bot: "botA",
            text: "Hello nearby",
            from_name: "Test",
            created_at: new Date().toISOString(),
          },
        });
      }
      if (url.pathname === "/rest/v1/rpc/prepare_flying_message_intent") {
        return jsonResponse({ ok: true, intent_id: "00000000-0000-4000-8000-000000000001" });
      }
      throw new Error(`Unexpected Supabase request: ${url.pathname}${url.search}`);
    }

    if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/createInvoiceLink")) {
      return jsonResponse({ ok: true, result: "https://t.me/invoice/test" });
    }
    throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("configured free price sends through the free-message RPC", async () => {
  const { response, body } = await sendMessage(
    { id: 123456, first_name: "Test", username: "free_test" },
    "192.0.2.1",
  );

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.message.text, "Hello nearby");
  assert.ok(calls.some(({ url }) => url.pathname === "/rest/v1/rpc/send_free_flying_message"));
  assert.ok(!calls.some(({ url }) => url.pathname.endsWith("/createInvoiceLink")));
});

test("admins and VIPs bypass the configured Stars price server-side", async (t) => {
  for (const [username, ip] of [["admin_test", "192.0.2.2"], ["vip_test", "192.0.2.3"]]) {
    await t.test(username, async () => {
      calls = [];
      configuredPrice = 75;
      const { response, body } = await sendMessage(
        { id: username === "admin_test" ? 234567 : 345678, first_name: "Test", username },
        ip,
      );

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.ok(body.message);
      assert.ok(calls.some(({ url }) => url.pathname === "/rest/v1/rpc/send_free_flying_message"));
      assert.ok(!calls.some(({ url }) => url.pathname === "/rest/v1/rpc/prepare_flying_message_intent"));
      assert.ok(!calls.some(({ url }) => url.pathname.endsWith("/createInvoiceLink")));
    });
  }
});

test("regular users still receive an invoice when the configured price is nonzero", async () => {
  configuredPrice = 75;
  const { response, body } = await sendMessage(
    { id: 456789, first_name: "Test", username: "member_test" },
    "192.0.2.4",
  );

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.starsPrice, 75);
  assert.match(body.invoiceLink, /^https:\/\/t\.me\//);
  assert.ok(calls.some(({ url }) => url.pathname === "/rest/v1/rpc/prepare_flying_message_intent"));
  assert.ok(!calls.some(({ url }) => url.pathname === "/rest/v1/rpc/send_free_flying_message"));
});