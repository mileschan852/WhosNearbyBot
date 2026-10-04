import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import worker from "../worker.js";

const botToken = "admin-test-bot-token";
const env = {
  BOT_A_TOKEN: botToken,
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_KEY: "admin-test-service-key",
};

const adminUser = { id: 123456, first_name: "Admin", username: "mileschan852" };
const originalFetch = globalThis.fetch;
let calls;
let deleteStatus;
let rolesReadStatus;
let requestSequence = 1;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeInitData(user) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "admin-test-query",
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

async function send(path, body = {}, user = adminUser, method = "POST") {
  const headers = { "cf-connecting-ip": `192.0.2.${requestSequence++}` };
  const init = { method, headers };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({
      ...body,
      initData: makeInitData(user),
      bot: "botA",
    });
  }
  const response = await worker.fetch(new Request(`https://worker.test${path}`, init), env);
  let result = null;
  try { result = await response.json(); } catch {}
  return { response, result };
}

beforeEach(() => {
  calls = [];
  deleteStatus = 204;
  rolesReadStatus = 200;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({
      url,
      method,
      body,
      prefer: new Headers(init.headers).get("Prefer"),
    });

    if (url.hostname !== "supabase.test") {
      throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
    }
    if (url.pathname === "/rest/v1/app_roles" && method === "GET") {
      return jsonResponse([], rolesReadStatus);
    }
    if (url.pathname === "/rest/v1/app_roles" && method === "POST") {
      return jsonResponse([body]);
    }
    if (url.pathname === "/rest/v1/app_roles" && method === "DELETE") {
      return new Response(null, { status: deleteStatus });
    }
    if (url.pathname === "/rest/v1/app_settings" && method === "POST") {
      return init.headers && new Headers(init.headers).get("Prefer")?.includes("return=minimal")
        ? new Response(null, { status: 204 })
        : jsonResponse([body]);
    }
    if (url.pathname === "/rest/v1/profiles" && method === "PATCH") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected Supabase request: ${method} ${url.pathname}${url.search}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("admin role upsert accepts the verified bot and writes the normalized role", async () => {
  const { response, result } = await send("/api/roles", {
    action: "add",
    username: "@Test_Vip",
    role: "vip",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(result, { ok: true });
  const write = calls.find((call) => call.url.pathname === "/rest/v1/app_roles" && call.method === "POST");
  assert.ok(write);
  assert.deepEqual(write.body, { username: "test_vip", role: "vip" });
});

test("failed admin role deletion returns a failure instead of a false success", async () => {
  deleteStatus = 404;
  const { response, result } = await send("/api/roles", {
    action: "remove",
    username: "missing_vip",
  });

  assert.equal(response.status, 502);
  assert.equal(result.upstreamStatus, 404);
});

test("global VIP settings are written by a verified administrator", async () => {
  const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const { response, result } = await send("/api/global-vip", { until });

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  const write = calls.find((call) => call.url.pathname === "/rest/v1/app_settings" && call.method === "POST");
  assert.deepEqual(write.body, {
    key: "global_vip_until",
    value: String(Math.floor(until)),
    updated_at: write.body.updated_at,
  });
});

test("reset-all clears required profile fields without writing null to profiles.name", async () => {
  const { response, result } = await send("/api/reset-all");

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  const patch = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
  assert.ok(patch);
  assert.equal(patch.body.name, "");
  assert.equal(patch.body.is_underage, false);
  assert.equal(patch.prefer, "return=minimal");
});

test("role-list database failures are surfaced rather than returned as an empty list", async () => {
  rolesReadStatus = 404;
  const { response, result } = await send("/api/roles", {}, adminUser, "GET");

  assert.equal(response.status, 502);
  assert.equal(result.upstreamStatus, 404);
});

test("non-admin callers are rejected before any admin write", async () => {
  const { response } = await send("/api/global-vip", { until: Date.now() + 1000 }, {
    id: 654321,
    first_name: "Member",
    username: "regular_member",
  });

  assert.equal(response.status, 403);
  assert.ok(!calls.some((call) => call.method === "POST" || call.method === "PATCH" || call.method === "DELETE"));
});