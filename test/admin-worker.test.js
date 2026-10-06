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
let settingsReadStatus;
let settingsRows;
let roleRows;
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

async function send(path, body = {}, user = adminUser, method = "POST", ip) {
  const headers = { "cf-connecting-ip": ip || `192.0.2.${requestSequence++}` };
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

async function sendRawBody(path, ip, body = "{") {
  return worker.fetch(new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "cf-connecting-ip": ip, "Content-Type": "application/json" },
    body,
  }), env);
}

beforeEach(() => {
  calls = [];
  deleteStatus = 204;
  rolesReadStatus = 200;
  settingsReadStatus = 200;
  settingsRows = [{ key: "global_vip_until", value: "0" }];
  roleRows = [];
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
      const usernameFilter = url.searchParams.get("username");
      const rows = usernameFilter
        ? roleRows.filter((row) => `eq.${row.username}` === usernameFilter)
        : roleRows;
      return jsonResponse(rows, rolesReadStatus);
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
    if (url.pathname === "/rest/v1/app_settings" && method === "GET") {
      return jsonResponse(settingsRows, settingsReadStatus);
    }
    if (url.pathname === "/rest/v1/profiles" && method === "POST") {
      return jsonResponse([body]);
    }
    if (url.pathname === "/rest/v1/profiles" && method === "PATCH") {
      return jsonResponse([{ id: url.searchParams.get("id")?.replace(/^eq\./, "") || "tg_654321" }]);
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

test("secondary admin privileges come from the Supabase role row", async () => {
  roleRows = [{ username: "hkmembersonly", role: "admin" }];
  const { response, result } = await send("/api/roles", {
    action: "add",
    username: "managed_vip",
    role: "vip",
  }, {
    id: 987654,
    first_name: "Managed",
    username: "hkmembersonly",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(result, { ok: true });
  assert.ok(calls.some((call) =>
    call.url.pathname === "/rest/v1/app_roles" &&
    call.url.searchParams.get("username") === "eq.hkmembersonly"
  ));
});

test("a username is not an admin unless its role is stored in Supabase", async () => {
  const { response } = await send("/api/roles", {
    action: "add",
    username: "managed_vip",
    role: "vip",
  }, {
    id: 987654,
    first_name: "Managed",
    username: "hkmembersonly",
  });

  assert.equal(response.status, 403);
  assert.ok(!calls.some((call) => call.method === "POST"));
});

test("only an authenticated admin can list managed admin and VIP entries", async () => {
  roleRows = [
    { username: "managed_admin", role: "admin", created_at: "2026-01-01T00:00:00Z" },
    { username: "managed_vip", role: "vip", created_at: "2026-01-02T00:00:00Z" },
  ];

  const { response, result } = await send("/api/roles", { action: "list" });

  assert.equal(response.status, 200);
  assert.deepEqual(result, roleRows);
});

test("the old public role-list route is disabled", async () => {
  const { response } = await send("/api/roles", {}, adminUser, "GET");
  assert.equal(response.status, 405);
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

test("reset-all clears only weight so profile setup appears without erasing other profile data", async () => {
  const { response, result } = await send("/api/reset-all");

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  const patch = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
  assert.ok(patch);
  assert.deepEqual(patch.body, { weight: null });
  assert.equal(patch.prefer, "return=minimal");
});

test("single-profile reset clears only weight on the selected profile", async () => {
  const { response, result } = await send("/api/reset-profile", { target_id: "654321" });

  assert.equal(response.status, 200);
  assert.deepEqual(result, { reset: true });
  const patch = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
  assert.ok(patch);
  assert.equal(patch.url.searchParams.get("id"), "eq.tg_654321");
  assert.deepEqual(patch.body, { weight: null });
});

test("role-list database failures are surfaced rather than returned as an empty list", async () => {
  rolesReadStatus = 404;
  const { response, result } = await send("/api/roles", { action: "list" });

  assert.equal(response.status, 502);
  assert.equal(result.upstreamStatus, 404);
});

test("auth returns only the signed-in user's role and reads role state from Supabase", async () => {
  roleRows = [
    { username: "managed_admin", role: "admin", created_at: "2026-01-01T00:00:00Z" },
    { username: "other_member", role: "vip", created_at: "2026-01-02T00:00:00Z" },
  ];
  const { response, result } = await send("/api/auth", {}, {
    id: 987654,
    first_name: "Managed",
    username: "managed_admin",
  });

  assert.equal(response.status, 200);
  assert.equal(result.role, "admin");
  assert.equal("roles" in result, false);
  assert.ok(calls.some((call) =>
    call.url.pathname === "/rest/v1/app_roles" &&
    call.url.searchParams.get("username") === "eq.managed_admin"
  ));
});

test("auth surfaces Supabase settings failures instead of returning a successful empty state", async () => {
  settingsReadStatus = 500;
  const { response, result } = await send("/api/auth");

  assert.equal(response.status, 503);
  assert.match(result.error, /temporarily unavailable/i);
});

test("nearby search rejects excessive malformed requests from one IP", async () => {
  const ip = "203.0.113.240";
  for (let index = 0; index < 120; index++) {
    await sendRawBody("/api/nearby", ip);
  }
  const response = await sendRawBody("/api/nearby", ip);
  assert.equal(response.status, 429);
});

test("request body limits reject oversized payloads before database access", async () => {
  const response = await sendRawBody(
    "/api/nearby",
    "203.0.113.242",
    JSON.stringify({ payload: "x".repeat(5000) }),
  );
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("invoice creation rejects excessive requests from one IP", async () => {
  const ip = "203.0.113.241";
  for (let index = 0; index < 10; index++) {
    await sendRawBody("/api/invoice", ip);
  }
  const response = await sendRawBody("/api/invoice", ip);
  assert.equal(response.status, 429);
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