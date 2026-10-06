// WhosNearbyBot worker — authenticated API and payment fulfillment.
// Bindings: BOT_A_TOKEN, BOT_B_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
//           TELEGRAM_WEBHOOK_SECRET
// TELEGRAM_WEBHOOK_SECRET set => /telegram-webhook requires the
// X-Telegram-Bot-Api-Secret-Token header to match (setWebhook secret_token).
// All private profile and payment database access uses the server-only key.

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

const requestWindows = new Map();

function rateLimit(request, key, maxRequests = 120, windowMs = 60_000) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const bucketKey = `${key}:${ip}`;
  let bucket = requestWindows.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  if (bucket.count >= maxRequests) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  bucket.count += 1;
  requestWindows.set(bucketKey, bucket);

  // Keep the isolate-local guard bounded under high-cardinality traffic.
  if (requestWindows.size > 4096) {
    for (const [existingKey, existingBucket] of requestWindows) {
      if (existingBucket.resetAt <= now || requestWindows.size > 3072) {
        requestWindows.delete(existingKey);
      }
    }
  }
  return 0;
}

async function readJsonLimited(request, maxBytes = 4096) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    const error = new Error("Request body is too large");
    error.status = 413;
    error.requestBodyError = true;
    throw error;
  }

  const chunks = [];
  let totalBytes = 0;
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        const error = new Error("Request body is too large");
        error.status = 413;
        error.requestBodyError = true;
        throw error;
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    error.requestBodyError = true;
    throw error;
  }
}

const MAX_FLYING_MESSAGE_LENGTH = 200;
const MAX_FLYING_MESSAGE_PRICE = 10_000;
const RAFFLE_TICKET_AMOUNT = 100;

function parseRaffleTicketInvoicePayload(value) {
  const match = /^rt1\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|(botA|botB)\|([0-9]{1,20})\|100$/i.exec(String(value || ""));
  if (!match) return null;
  const tgId = parseTelegramId(match[3]);
  if (!tgId) return null;
  return { intentId: match[1], bot: match[2], tgId, amount: RAFFLE_TICKET_AMOUNT };
}

function isValidTelegramUsername(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{5,32}$/.test(value);
}

async function refundRaffleStarsPayment(env, bot, tgId, chargeId) {
  const token = getBotToken(env, bot);
  const numericTgId = Number(tgId);
  if (!token || !Number.isSafeInteger(numericTgId) || !chargeId) {
    throw new Error("Raffle payment refund cannot be submitted");
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/refundStarPayment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: numericTgId,
      telegram_payment_charge_id: chargeId,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const description = String(result.description || "");
    if (/already refunded|payment was refunded/i.test(description)) return;
    throw new Error(`Telegram Stars refund failed (${response.status})`);
  }
}

function parseFlyingMessageInvoicePayload(value) {
  const match = /^fm1\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|(botA|botB)\|([0-9]{1,20})\|([0-9]{1,5})$/i.exec(String(value || ""));
  if (!match) return null;
  const tgId = parseTelegramId(match[3]);
  const amount = Number(match[4]);
  if (!tgId || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_FLYING_MESSAGE_PRICE) return null;
  return { intentId: match[1], bot: match[2], tgId, amount };
}

function unwrapRpcResult(result) {
  return Array.isArray(result) ? result[0] : result;
}

async function getFlyingMessagePrice(env) {
  const rows = await sbGetStrict(
    env,
    "rest/v1/app_settings?select=value&key=eq.flying_message_price&limit=1",
  );
  const rawValue = Array.isArray(rows) ? rows[0]?.value : rows?.value;
  const price = rawValue === undefined || rawValue === null ? 0 : Number(rawValue);
  if (!Number.isSafeInteger(price) || price < 0 || price > MAX_FLYING_MESSAGE_PRICE) {
    throw new Error("Flying message price setting is invalid");
  }
  return price;
}

async function getEffectiveFlyingMessagePrice(env, authUser) {
  if (await isPaidUnlocked(env, authUser)) return 0;
  return getFlyingMessagePrice(env);
}

function getBotToken(env, bot) {
  if (bot !== "botA" && bot !== "botB") return null;
  const selected = bot === "botA" ? env.BOT_A_TOKEN : env.BOT_B_TOKEN;
  // Keep the old single-token binding as a migration fallback. New Cloudflare
  // deployments should bind both bot tokens explicitly.
  return selected || env.TELEGRAM_BOT_TOKEN || null;
}

function getBotTokens(env) {
  return [...new Set([
    env.BOT_A_TOKEN,
    env.BOT_B_TOKEN,
    env.TELEGRAM_BOT_TOKEN,
  ].filter(Boolean))];
}

function serviceKey(env) {
  return env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
}

// Telegram id of the sole admin allowed to force-reset any profile.
const ADMIN_ID = 1231127407;

// Age from full month/day math so a 17-year-old never rounds up to 18.
function computeAge(dob) {
  if (!dob) return null;
  const b = new Date(dob);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

async function isEligibleAdultMessageUser(env, authUser) {
  const tgId = parseTelegramId(authUser?.id);
  if (!tgId) return false;
  const params = new URLSearchParams({
    select: "dob,is_underage",
    id: `eq.tg_${tgId}`,
    limit: "1",
  });
  const rows = await sbGetStrict(env, `rest/v1/profiles?${params}`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  return Boolean(
    profile &&
    profile.is_underage !== true &&
    typeof profile.dob === "string" &&
    computeAge(profile.dob) >= 18
  );
}

function getZodiacSignEmoji(dob) {
  if (!dob) return "";
  const date = new Date(dob);
  if (isNaN(date.getTime())) return "";
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "♈";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "♉";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "♊";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "♋";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "♌";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "♍";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "♎";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "♏";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "♐";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "♑";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "♒";
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return "♓";
  return "";
}

function parseTelegramId(value) {
  const id = String(value ?? "").replace(/^tg_/, "");
  return /^\d{1,20}$/.test(id) && Number(id) > 0 ? id : null;
}

function safeOwnProfile(profile) {
  if (!profile) return null;
  const safe = { ...profile };
  delete safe.private_notes;
  return safe;
}

// Usernames that are always admin regardless of the managed list. The owner
// (mileschan852) can never be demoted.
const OWNER_USERNAME = "mileschan852";
const ALWAYS_ADMIN = [OWNER_USERNAME];

async function getManagedRole(env, username) {
  const normalized = String(username || "").trim().toLowerCase().replace(/^@/, "");
  if (!normalized) return null;
  const params = new URLSearchParams({
    select: "role",
    username: `eq.${normalized}`,
    limit: "1",
  });
  const rows = await sbGetStrict(env, `rest/v1/app_roles?${params}`);
  const role = (Array.isArray(rows) ? rows[0] : rows)?.role;
  return role === "admin" || role === "vip" ? role : null;
}

async function getRoleForAuthUser(env, authUser) {
  if (Number(authUser?.id) === ADMIN_ID) return "admin";
  const username = (authUser?.username || "").toLowerCase();
  if (ALWAYS_ADMIN.includes(username)) return "admin";
  return getManagedRole(env, username);
}

// The owner stays immutable; every other managed admin is stored in Supabase.
async function isAdminCaller(env, authUser) {
  return (await getRoleForAuthUser(env, authUser)) === "admin";
}

async function isPaidUnlocked(env, authUser) {
  const role = await getRoleForAuthUser(env, authUser);
  if (role === "admin" || role === "vip") return true;
  const tgId = parseTelegramId(authUser?.id);
  if (tgId) {
    const profiles = await sbGetStrict(
      env,
      `rest/v1/profiles?select=vip_expiry&id=eq.${encodeURIComponent(`tg_${tgId}`)}&limit=1`,
    );
    const expiry = Date.parse((Array.isArray(profiles) ? profiles[0] : profiles)?.vip_expiry || "");
    if (Number.isFinite(expiry) && expiry > Date.now()) return true;
  }
  const settings = await sbGetStrict(env, "rest/v1/app_settings?select=value&key=eq.global_vip_until&limit=1");
  const value = Number((Array.isArray(settings) ? settings[0] : settings)?.value);
  return Number.isFinite(value) && value > Date.now();
}

function isProfileComplete(profile) {
  if (!profile?.dob || !profile.gender || !profile.seeking || !profile.height || !profile.weight) return false;
  if (profile.gender === "man" && profile.seeking === "men") {
    return Boolean(profile.role_pref && profile.safety_pref && profile.playstyle_pref &&
      profile.how_many_pref && Object.hasOwn(profile, "where_pref"));
  }
  return Boolean(profile.non_man_mode);
}

function sbHeaders(env, write = false) {
  const key = serviceKey(env) || (!write ? env.SUPABASE_ANON_KEY : null);
  if (!env.SUPABASE_URL || !key) throw new Error("Supabase server bindings are not configured");
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
  };
}

function adminWriteFailure(action, error) {
  const status = Number(error?.status);
  console.error(`[worker] ${action} failed`, error && error.message);
  return json({
    error: `${action} failed`,
    ...(Number.isInteger(status) && status >= 400 ? { upstreamStatus: status } : {}),
  }, 502);
}

async function sbGetStrict(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, {
    headers: sbHeaders(env),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const error = new Error(`Supabase read failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function sbPostStrict(env, path, body, prefer = "return=representation") {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, {
    method: "POST",
    headers: { ...sbHeaders(env, true), "Prefer": prefer },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const error = new Error(`Supabase write failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbPatchStrict(env, path, body, prefer = "return=representation") {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, {
    method: "PATCH",
    headers: { ...sbHeaders(env, true), "Prefer": prefer },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const error = new Error(`Supabase update failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbUpsertProfile(env, profile) {
  const rows = await sbPostStrict(
    env,
    "rest/v1/profiles?on_conflict=id",
    profile,
    "resolution=merge-duplicates,return=representation",
  );
  return Array.isArray(rows) ? rows[0] : rows;
}

// ---- Auth helpers -----------------------------------------------------------

// Verify Telegram's X-Telegram-Bot-Api-Secret-Token webhook header (constant-time).
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Validate Telegram WebApp initData HMAC per
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitDataWithToken(token, initData) {
  if (!token || typeof initData !== "string" || !initData) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  // Reject stale/replayed initData and timestamps too far in the future.
  const authDate = parseInt(params.get("auth_date") || "0", 10);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (!authDate || ageSeconds > 86400 || ageSeconds < -60) return false;
  params.delete("hash");
  const entries = [...params.entries()];
  // Telegram may include a separate Ed25519 `signature` alongside the HMAC
  // hash. Accept both documented canonical forms, while still requiring the
  // bot-token HMAC to cover the user and all other authentication fields.
  const dataCheckStrings = [
    entries.map(([k, v]) => `${k}=${v}`).sort().join("\n"),
    entries.filter(([k]) => k !== "signature")
      .map(([k, v]) => `${k}=${v}`).sort().join("\n"),
  ];
  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(token));
  const signKey = await crypto.subtle.importKey(
    "raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  for (const dataCheckString of new Set(dataCheckStrings)) {
    const hmac = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));
    const hex = [...new Uint8Array(hmac)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (timingSafeEqual(hex, hash)) return true;
  }
  return false;
}

async function verifyInitData(env, initData, bot) {
  if (bot === "botA" || bot === "botB") {
    return verifyInitDataWithToken(getBotToken(env, bot), initData);
  }
  for (const token of getBotTokens(env)) {
    if (await verifyInitDataWithToken(token, initData)) return true;
  }
  return false;
}

const ALLOWED_TYPES = {
  hide_age:          { title: 'Hide Age (30 Days)',        description: 'Hide your age on your profile for 30 days.',        amount: 1000 },
  invisible:         { title: 'Invisible Mode (30 Days)',  description: 'Browse and go invisible on the grid for 30 days.', amount: 3000 },
  edit_profile:      { title: 'Edit Profile Pass',        description: 'Unlock profile editing permissions.',               amount: 1000 },
  change_filter:     { title: 'Filter Subscription (30 Days)', description: 'Custom filter override for 30 days.',            amount: 1000 },
  change_preference: { title: 'Change Profile & Preferences', description: 'One-time unlock to edit profile and preferences.', amount: 1000 },
};

// Shared Telegram payment handling for both webhook routes. Callers MUST
// verify the secret-token header before invoking this.
async function handlePaymentUpdate(env, update) {
  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const flyingInvoice = parseFlyingMessageInvoicePayload(query.invoice_payload);
    const raffleTicket = parseRaffleTicketInvoicePayload(query.invoice_payload);
    let payment = null;
    try { payment = JSON.parse(query.invoice_payload || "null"); } catch {}
    const bot = flyingInvoice?.bot || raffleTicket?.bot || (payment?.bot === "botA" ? "botA" : "botB");
    const token = getBotToken(env, bot);
    if (!token) return new Response("Payment bot is not configured", { status: 503 });
    let valid = false;
    if (flyingInvoice) {
      valid = Boolean(
        String(query.from?.id || "") === flyingInvoice.tgId &&
        query.currency === "XTR" &&
        query.total_amount === flyingInvoice.amount
      );
      if (valid) {
        try {
          const result = unwrapRpcResult(await sbPostStrict(
            env,
            "rest/v1/rpc/mark_flying_message_prechecked",
            {
              p_intent_id: flyingInvoice.intentId,
              p_tg_id: flyingInvoice.tgId,
              p_bot: flyingInvoice.bot,
              p_amount: flyingInvoice.amount,
            },
          ));
          valid = result?.ok === true;
        } catch (error) {
          console.error("[worker] flying message pre-checkout verification failed", error && error.message);
          valid = false;
        }
      }
    } else if (raffleTicket) {
      valid = Boolean(
        String(query.from?.id || "") === raffleTicket.tgId &&
        isValidTelegramUsername(query.from?.username) &&
        query.currency === "XTR" &&
        query.total_amount === raffleTicket.amount
      );
      if (valid) {
        try {
          const result = unwrapRpcResult(await sbPostStrict(
            env,
            "rest/v1/rpc/mark_raffle_ticket_prechecked",
            {
              p_intent_id: raffleTicket.intentId,
              p_tg_id: raffleTicket.tgId,
              p_username: query.from.username,
              p_bot: raffleTicket.bot,
              p_amount: raffleTicket.amount,
            },
          ));
          valid = result?.ok === true;
        } catch (error) {
          console.error("[worker] raffle pre-checkout verification failed", error && error.message);
          valid = false;
        }
      }
    } else {
      const config = payment && ALLOWED_TYPES[payment.type];
      const amount = payment?.amount ?? payment?.finalAmount;
      valid = Boolean(
        config &&
        parseTelegramId(payment?.tg_id) === String(query.from?.id || "") &&
        amount === config.amount &&
        query.currency === "XTR" &&
        query.total_amount === config.amount
      );
    }
    const result = await fetch(`https://api.telegram.org/bot${token || ""}/answerPreCheckoutQuery`, {
      method: "POST",
      body: JSON.stringify({
        pre_checkout_query_id: query.id,
        ok: valid,
        ...(!valid ? { error_message: "This invoice is no longer valid. Please create a new one." } : {}),
      }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const answer = await result.json();
    if (!result.ok || !answer.ok) throw new Error(`Telegram pre-checkout response failed (${result.status})`);
    return new Response("OK");
  }
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const flyingInvoice = parseFlyingMessageInvoicePayload(payment.invoice_payload);
    const raffleTicket = parseRaffleTicketInvoicePayload(payment.invoice_payload);
    if (flyingInvoice) {
      if (
        String(update.message.from?.id || "") !== flyingInvoice.tgId ||
        payment.currency !== "XTR" ||
        payment.total_amount !== flyingInvoice.amount ||
        !payment.telegram_payment_charge_id
      ) {
        return new Response("Invalid flying message payment", { status: 400 });
      }
      await sbPostStrict(env, "rest/v1/rpc/complete_flying_message_payment", {
        p_intent_id: flyingInvoice.intentId,
        p_tg_id: flyingInvoice.tgId,
        p_bot: flyingInvoice.bot,
        p_amount: payment.total_amount,
        p_currency: payment.currency,
        p_telegram_payment_charge_id: payment.telegram_payment_charge_id,
        p_provider_payment_charge_id: payment.provider_payment_charge_id || null,
      });
      return new Response("OK");
    }
    if (raffleTicket) {
      const payerTgId = parseTelegramId(update.message.from?.id);
      if (
        payerTgId !== raffleTicket.tgId ||
        payment.currency !== "XTR" ||
        payment.total_amount !== raffleTicket.amount ||
        !payment.telegram_payment_charge_id
      ) {
        return new Response("Invalid raffle ticket payment", { status: 400 });
      }

      const result = unwrapRpcResult(await sbPostStrict(
        env,
        "rest/v1/rpc/complete_raffle_ticket_payment",
        {
          p_intent_id: raffleTicket.intentId,
          p_tg_id: raffleTicket.tgId,
          p_bot: raffleTicket.bot,
          p_amount: payment.total_amount,
          p_currency: payment.currency,
          p_telegram_payment_charge_id: payment.telegram_payment_charge_id,
          p_provider_payment_charge_id: payment.provider_payment_charge_id || null,
        },
      ));

      if (result?.ok === true) return new Response("OK");

      await refundRaffleStarsPayment(
        env,
        raffleTicket.bot,
        raffleTicket.tgId,
        payment.telegram_payment_charge_id,
      );
      await sbPostStrict(env, "rest/v1/rpc/mark_raffle_ticket_refunded", {
        p_intent_id: raffleTicket.intentId,
        p_telegram_payment_charge_id: payment.telegram_payment_charge_id,
      });
      return new Response("OK");
    }
    let payload;
    try { payload = JSON.parse(payment.invoice_payload || "null"); } catch {}
    const tgId = parseTelegramId(payload?.tg_id);
    const config = payload && ALLOWED_TYPES[payload.type];
    const amount = payload?.amount ?? payload?.finalAmount;
    if (!tgId || !config || amount !== config.amount ||
        String(update.message.from?.id || "") !== tgId ||
        payment.currency !== "XTR" || payment.total_amount !== config.amount ||
        !payment.telegram_payment_charge_id) {
      return new Response("Invalid payment payload", { status: 400 });
    }
    await sbPostStrict(env, "rest/v1/rpc/apply_payment", {
      p_tg_id: tgId,
      p_type: payload.type,
      p_amount: payment.total_amount,
      p_currency: payment.currency,
      p_telegram_payment_charge_id: payment.telegram_payment_charge_id,
      p_provider_payment_charge_id: payment.provider_payment_charge_id || null,
    });
  }
  return new Response("OK");
}

async function parseAuthUser(env, initData, bot) {
  if (bot && bot !== "botA" && bot !== "botB") return null;
  if (!(await verifyInitData(env, initData || "", bot))) return null;
  try {
    const user = JSON.parse(new URLSearchParams(initData).get("user") || "null");
    return parseTelegramId(user?.id) ? user : null;
  } catch {
    return null;
  }
}

async function parseAuthUserForEitherBot(env, initData, preferredBot) {
  if (preferredBot !== "botA" && preferredBot !== "botB") return null;
  const candidates = [preferredBot, preferredBot === "botA" ? "botB" : "botA"];
  for (const bot of candidates) {
    if (!(await verifyInitDataWithToken(getBotToken(env, bot), initData || ""))) continue;
    try {
      const user = JSON.parse(new URLSearchParams(initData).get("user") || "null");
      if (parseTelegramId(user?.id)) return { user, bot };
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function roundCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function sanitizeNearbyProfile(user) {
  const expires = user.hide_age_expiry ? new Date(user.hide_age_expiry).getTime() : null;
  const hideAge = Boolean(user.hide_age && (expires === null || (Number.isFinite(expires) && expires > Date.now())));
  const lastSeenMs = user.last_seen ? new Date(user.last_seen).getTime() : NaN;
  return {
    id: user.id,
    name: user.name || (user.username ? `@${user.username}` : "Anonymous"),
    username: user.username || "",
    avatar: user.avatar || "",
    lat: roundCoordinate(user.lat),
    lng: roundCoordinate(user.lng),
    last_seen: Number.isFinite(lastSeenMs)
      ? new Date(Math.floor(lastSeenMs / 900000) * 900000).toISOString()
      : null,
    gender: user.gender || null,
    seeking: user.seeking || null,
    age: hideAge ? null : computeAge(user.dob),
    zodiac: getZodiacSignEmoji(user.dob),
    height: user.height || null,
    weight: user.weight || null,
    role_pref: user.role_pref || null,
    safety_pref: user.safety_pref || null,
    playstyle_pref: user.playstyle_pref || null,
    where_pref: user.where_pref || null,
    how_many_pref: user.how_many_pref || null,
    non_man_mode: user.non_man_mode || null,
    hide_age: hideAge,
    grid_visible: user.grid_visible ?? true,
    map_visible: user.map_visible ?? false,
    distance: Number.isFinite(Number(user.distance))
      ? Math.round(Number(user.distance) / 1000) * 1000
      : null,
  };
}

const PROFILE_CONTENT_FIELDS = [
  "dob", "gender", "seeking", "height", "weight", "role_pref",
  "safety_pref", "playstyle_pref", "where_pref", "how_many_pref",
  "non_man_mode",
];
const PROFILE_UPDATE_FIELDS = new Set([
  ...PROFILE_CONTENT_FIELDS, "lat", "lng", "map_visible", "grid_visible", "hide_age",
]);

function validBirthDate(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function updateOwnProfile(env, authUser, updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return { error: "Invalid profile" , status: 400 };
  }
  const keys = Object.keys(updates);
  if (!keys.length || keys.some((key) => !PROFILE_UPDATE_FIELDS.has(key))) {
    return { error: "Unsupported profile fields" , status: 400 };
  }
  const tgId = parseTelegramId(authUser.id);
  if (!tgId) return { error: "Invalid Telegram user" , status: 401 };
  const profileId = `tg_${tgId}`;
  const rows = await sbGetStrict(
    env,
    `rest/v1/profiles?select=*&id=eq.${encodeURIComponent(profileId)}`,
  );
  const current = Array.isArray(rows) ? rows[0] : rows;
  if (!current) return { error: "Profile not found" , status: 404 };
  if (current.is_underage) return { error: "This account is locked" , status: 403 };

  const clean = {};
  for (const key of keys) clean[key] = updates[key];
  if ("dob" in clean && !validBirthDate(clean.dob)) {
    return { error: "Invalid date of birth" , status: 400 };
  }
  for (const key of ["gender", "seeking"]) {
    if (key in clean && clean[key] !== null &&
        !(key === "gender" ? ["man", "woman", "non-binary"] : ["men", "women", "everyone"]).includes(clean[key])) {
      return { error: `Invalid ${key}` , status: 400 };
    }
  }
  for (const key of ["lat", "lng"]) {
    if (key in clean) {
      const value = clean[key];
      const limit = key === "lat" ? 90 : 180;
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
        return { error: `Invalid ${key}` , status: 400 };
      }
    }
  }
  for (const key of ["hide_age", "grid_visible", "map_visible"]) {
    if (key in clean && typeof clean[key] !== "boolean") {
      return { error: `Invalid ${key}` , status: 400 };
    }
  }
  for (const key of ["height", "weight", "role_pref", "safety_pref", "playstyle_pref", "where_pref", "how_many_pref", "non_man_mode"]) {
    if (key in clean && clean[key] !== null && typeof clean[key] !== "string") {
      return { error: `Invalid ${key}` , status: 400 };
    }
  }
  if ("dob" in clean && typeof clean.dob === "string" && computeAge(clean.dob) < 18) {
    if (keys.some((key) => key !== "dob")) {
      return { error: "Underage profiles cannot be completed" , status: 403 };
    }
  }

  const contentChanged = PROFILE_CONTENT_FIELDS.some(
    (key) => key in clean && clean[key] !== current[key],
  );
  if (contentChanged && isProfileComplete(current)) {
    const passExpiry = current.edit_profile_expiry ? new Date(current.edit_profile_expiry).getTime() : 0;
    const hasEditPass = current.edit_profile_pass && passExpiry > Date.now();
    if (!hasEditPass && !(await isPaidUnlocked(env, authUser))) {
      return { error: "A profile edit pass is required" , status: 403 };
    }
  }

  const next = { ...clean, last_seen: new Date().toISOString() };
  if ("hide_age" in clean) {
    if (!clean.hide_age) {
      next.hide_age_expiry = null;
    } else {
      const expiry = current.hide_age_expiry ? new Date(current.hide_age_expiry).getTime() : 0;
      const hasActivePass = expiry > Date.now();
      if (!hasActivePass && !(await isPaidUnlocked(env, authUser))) {
        return { error: "An active hide-age entitlement is required" , status: 403 };
      }
    }
  }
  if ("grid_visible" in clean) {
    if (!clean.grid_visible) {
      const expiry = current.invisible_expiry ? new Date(current.invisible_expiry).getTime() : 0;
      const hasActivePass = expiry > Date.now();
      if (!hasActivePass && !(await isPaidUnlocked(env, authUser))) {
        return { error: "An active invisible-mode entitlement is required" , status: 403 };
      }
    } else {
      next.invisible_expiry = null;
    }
  }
  const result = await sbPatchStrict(
    env,
    `rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}`,
    next,
  );
  const profile = Array.isArray(result) ? result[0] : result;
  if (!profile) return { error: "Profile update did not apply" , status: 409 };
  return { profile: safeOwnProfile(profile) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
      });
    }

    // POST /api/auth
    if (path === "/api/auth" && request.method === "POST") {
      const retryAfter = rateLimit(request, "auth");
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot } = await readJsonLimited(request);
        if (!initData || !bot) return json({ error: "Missing initData or bot" }, 400);
        const authSession = await parseAuthUserForEitherBot(env, initData, bot);
        if (!authSession) return json({ error: "Invalid or expired Telegram session" }, 401);
        const { user: tgUser, bot: verifiedBot } = authSession;
        const tgId = `tg_${parseTelegramId(tgUser.id)}`;
        const profileData = { id: tgId, name: tgUser.first_name || "", username: tgUser.username || null, avatar: tgUser.photo_url || null, last_seen: new Date().toISOString() };
        const profile = await sbUpsertProfile(env, profileData);
        if (!profile) return json({ error: "Profile could not be loaded" }, 503);
        const [role, settings] = await Promise.all([
          getRoleForAuthUser(env, tgUser),
          sbGetStrict(env, "rest/v1/app_settings?select=value&key=eq.global_vip_until&limit=1"),
        ]);
        if (!Array.isArray(settings)) return json({ error: "Account information is temporarily unavailable." }, 503);
        const globalVipUntil = Number(settings[0]?.value);
        return json({
          profile: safeOwnProfile(profile),
          role,
          globalVipUntil: Number.isFinite(globalVipUntil) ? globalVipUntil : 0,
          bot: verifiedBot,
        });
      } catch (e) {
        if (e?.requestBodyError) return json({ error: e.message }, e.status || 400);
        console.error("[worker] authentication data load failed", e && e.message);
        return json({ error: "Account information is temporarily unavailable." }, 503);
      }
    }

    // POST /api/nearby — identity, location and admin scope are server-derived.
    if (path === "/api/nearby" && request.method === "POST") {
      const retryAfter = rateLimit(request, "nearby", 120, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData, bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const tgId = parseTelegramId(authUser.id);
        if (!tgId) return json({ error: "Invalid Telegram user" }, 401);
        const userRetryAfter = rateLimit(request, `nearby-user:${tgId}`, 60, 60_000);
        if (userRetryAfter) {
          return json({ error: "Too many nearby searches" }, 429, { "retry-after": String(userRetryAfter) });
        }
        const profileId = `tg_${tgId}`;
        const ownRows = await sbGetStrict(
          env,
          `rest/v1/profiles?select=lat,lng&id=eq.${encodeURIComponent(profileId)}`,
        );
        const ownProfile = Array.isArray(ownRows) ? ownRows[0] : ownRows;
        if (!ownProfile || typeof ownProfile.lat !== "number" || typeof ownProfile.lng !== "number") {
          return json({ error: "Set your location before searching nearby" }, 409);
        }
        const isAdmin = await isAdminCaller(env, authUser);
        const nearby = await sbPostStrict(env, "rest/v1/rpc/get_nearby_users", {
          p_lat: ownProfile.lat,
          p_lng: ownProfile.lng,
          p_radius_meters: 50000,
          p_requesting_user_id: profileId,
          p_is_admin: isAdmin,
        });
        if (!Array.isArray(nearby)) return json({ error: "Nearby search returned invalid data" }, 502);
        return json(nearby.map(sanitizeNearbyProfile));
      } catch (e) {
        if (e?.requestBodyError) return json({ error: e.message }, e.status || 400);
        console.error("[worker] nearby search failed", e && e.message);
        return json({ error: "Nearby search is temporarily unavailable." }, 503);
      }
    }

    // POST /api/profile
    if (path === "/api/profile" && request.method === "POST") {
      const retryAfter = rateLimit(request, "profile-update", 60, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot, profile } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData, bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const tgId = parseTelegramId(authUser.id);
        if (!tgId) return json({ error: "Invalid Telegram user" }, 401);
        const userRetryAfter = rateLimit(request, `profile-update-user:${tgId}`, 60, 60_000);
        if (userRetryAfter) {
          return json({ error: "Too many profile updates" }, 429, { "retry-after": String(userRetryAfter) });
        }
        const result = await updateOwnProfile(env, authUser, profile);
        return result.error
          ? json({ error: result.error }, result.status || 400)
          : json({ updated: true, profile: result.profile });
      } catch (e) {
        if (e?.requestBodyError) return json({ error: e.message }, e.status || 400);
        console.error("[worker] profile update failed", e && e.message);
        return json({ error: "Profile update is temporarily unavailable." }, 503);
      }
    }

    // POST /api/invoice  (alias: /create-invoice)
    if ((path === "/api/invoice" || path === "/create-invoice") && request.method === "POST") {
      const retryAfter = rateLimit(request, "create-invoice", 10, 60_000);
      if (retryAfter) {
        return json({ error: "Too many invoice requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const body = await readJsonLimited(request);
        const { userId, initData, bot } = body;
        const type = body.type;
        const cfg = ALLOWED_TYPES[type];
        if (!cfg) return json({ error: "Invalid type" }, 400);
        if (bot !== "botA" && bot !== "botB") return json({ error: "Invalid bot" }, 400);
        const authUser = await parseAuthUser(env, initData, bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const tgId = parseTelegramId(authUser.id);
        if (userId !== undefined && parseTelegramId(userId) !== tgId) {
          return json({ error: "Invoice user does not match Telegram session" }, 403);
        }
        const userRetryAfter = rateLimit(request, `create-invoice-user:${tgId}`, 10, 60_000);
        if (userRetryAfter) {
          return json({ error: "Too many invoice requests" }, 429, { "retry-after": String(userRetryAfter) });
        }
        const token = getBotToken(env, bot);
        if (!token) return json({ error: "Payment bot is not configured" }, 503);
        const finalAmount = cfg.amount;
        const res = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
          method: "POST",
          body: JSON.stringify({
            title: cfg.title,
            description: cfg.description,
            payload: JSON.stringify({ tg_id: tgId, type, amount: finalAmount, bot }),
            provider_token: "",
            currency: "XTR",
            prices: [{ label: cfg.title, amount: finalAmount }],
          }),
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) return json({ error: data.description || "Telegram invoice request failed" }, 502);
        return json({ invoiceLink: data.result });
      } catch (e) {
        if (e?.requestBodyError) return json({ error: e.message }, e.status || 400);
        console.error("[worker] invoice creation failed", e && e.message);
        return json({ error: "Could not create an invoice. Please try again." }, 502);
      }
    }

    // POST /api/raffle/state — signed Telegram identity; exposes aggregate
    // ticket counts and the latest public winners, never purchaser IDs.
    if (path === "/api/raffle/state" && request.method === "POST") {
      const retryAfter = rateLimit(request, "raffle-state", 30, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const tgId = parseTelegramId(authUser.id);
        const state = unwrapRpcResult(await sbPostStrict(
          env,
          "rest/v1/rpc/get_raffle_state",
          { p_tg_id: tgId },
        ));
        const hasUsername = isValidTelegramUsername(authUser.username);
        const isAdult = await isEligibleAdultMessageUser(env, authUser);
        return json({
          ...state,
          canPurchase: hasUsername && isAdult,
          usernameRequired: !hasUsername,
        });
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] raffle state failed", e && e.message);
        return json({ error: "Raffle information is temporarily unavailable." }, 503);
      }
    }

    // POST /api/raffle/ticket — one fixed-price Stars ticket per invoice.
    // Telegram username and adult eligibility are derived from signed initData
    // and rechecked transactionally by the database RPC.
    if (path === "/api/raffle/ticket" && request.method === "POST") {
      const retryAfter = rateLimit(request, "raffle-ticket-invoice", 10, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      let intentId = "";
      let tgId = "";
      try {
        const { initData, bot } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!isValidTelegramUsername(authUser.username)) {
          return json({ error: "A Telegram username is required to buy raffle tickets." }, 403);
        }
        if (!(await isEligibleAdultMessageUser(env, authUser))) {
          return json({ error: "Complete an adult profile before buying raffle tickets." }, 403);
        }
        if (bot !== "botA" && bot !== "botB") return json({ error: "Invalid bot" }, 400);
        const token = getBotToken(env, bot);
        if (!token) return json({ error: "Payment bot is not configured" }, 503);
        tgId = parseTelegramId(authUser.id);
        intentId = crypto.randomUUID();

        const prepared = unwrapRpcResult(await sbPostStrict(
          env,
          "rest/v1/rpc/create_raffle_ticket_intent",
          {
            p_intent_id: intentId,
            p_tg_id: tgId,
            p_username: authUser.username,
            p_bot: bot,
          },
        ));
        if (!prepared?.ok) {
          const reason = prepared?.reason;
          const status = reason === "profile" ? 403
            : reason === "closed" || reason === "pending_invoice" ? 409
              : 400;
          const error = reason === "profile"
            ? "Complete an adult profile before buying raffle tickets."
            : reason === "closed"
              ? "Ticket sales for this draw are closed."
              : reason === "pending_invoice"
                ? "Finish or cancel your existing raffle ticket invoice first."
                : "A raffle ticket invoice could not be prepared.";
          return json({ error }, status);
        }

        const title = "Monthly raffle ticket";
        const response = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: "One ticket for the monthly raffle. Draw at 8:00 PM Hong Kong time on the 1st.",
            payload: `rt1|${intentId}|${bot}|${tgId}|${RAFFLE_TICKET_AMOUNT}`,
            provider_token: "",
            currency: "XTR",
            prices: [{ label: title, amount: RAFFLE_TICKET_AMOUNT }],
          }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await response.json();
        if (!response.ok || !data.ok || typeof data.result !== "string") {
          throw new Error("Telegram invoice creation failed");
        }
        return json({
          invoiceLink: data.result,
          intentId,
          roundKey: prepared.roundKey,
          amount: RAFFLE_TICKET_AMOUNT,
        });
      } catch (e) {
        if (intentId && tgId) {
          try {
            await sbPatchStrict(
              env,
              `rest/v1/raffle_ticket_intents?id=eq.${encodeURIComponent(intentId)}&tg_id=eq.${encodeURIComponent(tgId)}&status=eq.pending`,
              { status: "cancelled", updated_at: new Date().toISOString() },
            );
          } catch {}
        }
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] raffle ticket invoice failed", e && e.message);
        return json({ error: "Could not create a Telegram Stars invoice. Please try again." }, 502);
      }
    }

    // POST /api/raffle/cancel — only cancels the caller's outstanding invoice.
    if (path === "/api/raffle/cancel" && request.method === "POST") {
      const retryAfter = rateLimit(request, "raffle-ticket-cancel", 20, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot, intentId } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(intentId || ""))) {
          return json({ error: "Invalid invoice reference." }, 400);
        }
        const tgId = parseTelegramId(authUser.id);
        await sbPatchStrict(
          env,
          `rest/v1/raffle_ticket_intents?id=eq.${encodeURIComponent(intentId)}&tg_id=eq.${encodeURIComponent(tgId)}&audience_bot=eq.${bot}&status=in.(pending,prechecked)`,
          { status: "cancelled", updated_at: new Date().toISOString() },
        );
        return json({ ok: true });
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] raffle ticket cancellation failed", e && e.message);
        return json({ error: "Could not cancel the raffle ticket invoice." }, 502);
      }
    }

    // POST /api/webhook — verify Telegram's secret-token header first so
    // forged updates can't grant paid entitlements. TELEGRAM_WEBHOOK_SECRET
    // must match the secret_token passed to setWebhook.
    if (path === "/api/webhook" && request.method === "POST") {
      // Telegram sends this secret token with every webhook call; reject anything else.
      const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(secretHeader, env.TELEGRAM_WEBHOOK_SECRET)) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        return await handlePaymentUpdate(env, await request.json());
      } catch (e) {
        console.error("[worker] webhook processing failed", e && e.message);
        return new Response("Payment processing failed", { status: 500 });
      }
    }

    // POST /telegram-webhook — bot updates, secret-token protected. Fails
    // closed: without TELEGRAM_WEBHOOK_SECRET no update is accepted, so a
    // forged successful_payment can never grant a paid entitlement for free.
    if (path === "/telegram-webhook" && request.method === "POST") {
      const secretHeader = request.headers.get("x-telegram-bot-api-secret-token") || "";
      if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(secretHeader, env.TELEGRAM_WEBHOOK_SECRET)) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        return await handlePaymentUpdate(env, await request.json());
      } catch (e) {
        console.error("[worker] webhook processing failed", e && e.message);
        return new Response("Payment processing failed", { status: 500 });
      }
    }

    // POST /api/messages/feed — authenticated, short-lived messages for this
    // entry bot only. The database service key never reaches the browser.
    if (path === "/api/messages/feed" && request.method === "POST") {
      const retryAfter = rateLimit(request, "flying-message-feed", 900, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!(await isEligibleAdultMessageUser(env, authUser))) {
          return json({ error: "Complete an adult profile before viewing messages." }, 403);
        }

        const since = new Date(Date.now() - 12_000).toISOString();
        const params = new URLSearchParams({
          select: "id,tg_id,text,from_name,created_at,audience_bot",
          audience_bot: `eq.${bot}`,
          created_at: `gte.${since}`,
          order: "created_at.asc",
          limit: "50",
        });
        const [messages, starsPrice] = await Promise.all([
          sbGetStrict(env, `rest/v1/flying_messages?${params}`),
          getFlyingMessagePrice(env),
        ]);
        return json({ messages: Array.isArray(messages) ? messages : [], starsPrice });
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] flying message feed failed", e && e.message);
        return json({ error: "Internal error" }, 500);
      }
    }

    if (path === "/api/messages" && request.method === "POST") {
      const retryAfter = rateLimit(request, "flying-message-send", 60, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { text, initData, bot } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (typeof text !== "string") return json({ error: "Enter a message first." }, 400);
        const safeText = text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
        if (!safeText || [...safeText].length > MAX_FLYING_MESSAGE_LENGTH) {
          return json({ error: "Messages must contain 1 to 200 characters." }, 400);
        }

        const tgId = parseTelegramId(authUser.id);
        if (!tgId) return json({ error: "Invalid Telegram user." }, 401);
        const fromName = String(authUser.first_name || "Anonymous")
          .replace(/\p{Cc}/gu, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60) || "Anonymous";
        const starsPrice = await getEffectiveFlyingMessagePrice(env, authUser);

        if (starsPrice === 0) {
          const result = unwrapRpcResult(await sbPostStrict(
            env,
            "rest/v1/rpc/send_free_flying_message",
            { p_tg_id: tgId, p_bot: bot, p_text: safeText, p_from_name: fromName },
          ));
          if (!result?.ok) {
            const reason = result?.reason;
            const retry = Number(result?.retry_after) || 0;
            const status = reason === "cooldown" ? 429 : reason === "pending_invoice" ? 409 : reason === "profile" ? 403 : 400;
            const error = reason === "cooldown"
              ? `You can send another flying message in ${retry} seconds.`
              : reason === "pending_invoice"
                ? "Finish or cancel your existing message invoice first."
                : reason === "profile"
                  ? "Complete an adult profile before sending messages."
                  : "Message could not be sent.";
            return json(
              { error, ...(retry ? { retryAfter: retry } : {}) },
              status,
              retry ? { "retry-after": String(retry) } : {},
            );
          }
          return json({ ok: true, message: result.message });
        }

        const token = getBotToken(env, bot);
        if (!token) return json({ error: "Payment bot is not configured" }, 503);
        const intentId = crypto.randomUUID();
        const prepared = unwrapRpcResult(await sbPostStrict(
          env,
          "rest/v1/rpc/prepare_flying_message_intent",
          {
            p_intent_id: intentId,
            p_tg_id: tgId,
            p_bot: bot,
            p_text: safeText,
            p_from_name: fromName,
            p_amount: starsPrice,
          },
        ));
        if (!prepared?.ok) {
          const reason = prepared?.reason;
          const retry = Number(prepared?.retry_after) || 0;
          const status = reason === "cooldown" ? 429 : reason === "pending_invoice" ? 409 : reason === "profile" ? 403 : 400;
          const error = reason === "cooldown"
            ? `You can send another flying message in ${retry} seconds.`
            : reason === "pending_invoice"
              ? "Finish or cancel your existing message invoice first."
              : reason === "profile"
                ? "Complete an adult profile before sending messages."
                : "Message could not be sent.";
          return json(
            { error, ...(retry ? { retryAfter: retry } : {}) },
            status,
            retry ? { "retry-after": String(retry) } : {},
          );
        }

        try {
          const response = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
            method: "POST",
            body: JSON.stringify({
              title: "Flying message",
              description: `Send a message to online users for ${starsPrice} Telegram Stars.`,
              payload: `fm1|${intentId}|${bot}|${tgId}|${starsPrice}`,
              provider_token: "",
              currency: "XTR",
              prices: [{ label: "Flying message", amount: starsPrice }],
            }),
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          const data = await response.json();
          if (!response.ok || !data.ok || typeof data.result !== "string") {
            throw new Error(data.description || "Telegram invoice request failed");
          }
          return json({ ok: true, invoiceLink: data.result, intentId, starsPrice });
        } catch (error) {
          try {
            await sbPatchStrict(
              env,
              `rest/v1/flying_message_intents?id=eq.${intentId}&status=eq.pending`,
              { status: "cancelled" },
            );
          } catch {}
          console.error("[worker] flying message invoice failed", error && error.message);
          return json({ error: "Could not create a Telegram Stars invoice. Please try again." }, 502);
        }
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] flying message send failed", e && e.message);
        return json({ error: "Internal error" }, 500);
      }
    }

    if (path === "/api/messages/status" && request.method === "POST") {
      const retryAfter = rateLimit(request, "flying-message-status", 20, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot, intentId } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(intentId || ""))) {
          return json({ error: "Invalid invoice reference." }, 400);
        }
        const tgId = parseTelegramId(authUser.id);
        const params = new URLSearchParams({
          select: "status,message_id",
          id: `eq.${intentId}`,
          tg_id: `eq.${tgId}`,
          audience_bot: `eq.${bot}`,
          limit: "1",
        });
        const rows = await sbGetStrict(env, `rest/v1/flying_message_intents?${params}`);
        const intent = Array.isArray(rows) ? rows[0] : null;
        if (!intent) return json({ error: "Invoice not found." }, 404);
        let message = null;
        if (intent.status === "fulfilled" && intent.message_id) {
          const messageParams = new URLSearchParams({
            select: "id,tg_id,text,from_name,created_at,audience_bot",
            id: `eq.${intent.message_id}`,
            limit: "1",
          });
          const messageRows = await sbGetStrict(env, `rest/v1/flying_messages?${messageParams}`);
          message = Array.isArray(messageRows) ? messageRows[0] || null : null;
        }
        return json({ status: intent.status, message });
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] flying message status failed", e && e.message);
        return json({ error: "Internal error" }, 500);
      }
    }

    if (path === "/api/messages/cancel" && request.method === "POST") {
      const retryAfter = rateLimit(request, "flying-message-cancel", 10, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot, intentId } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(intentId || ""))) {
          return json({ error: "Invalid invoice reference." }, 400);
        }
        const tgId = parseTelegramId(authUser.id);
        const filters = new URLSearchParams({
          id: `eq.${intentId}`,
          tg_id: `eq.${tgId}`,
          audience_bot: `eq.${bot}`,
          status: "eq.pending",
        });
        await sbPatchStrict(env, `rest/v1/flying_message_intents?${filters}`, { status: "cancelled" });
        return json({ ok: true });
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] flying message cancellation failed", e && e.message);
        return json({ error: "Internal error" }, 500);
      }
    }

    if (path === "/api/admin/flying-message-price" && request.method === "POST") {
      const retryAfter = rateLimit(request, "flying-message-price-admin", 20, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const { initData, bot, starsPrice } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        const price = Number(starsPrice);
        if (!Number.isSafeInteger(price) || price < 0 || price > MAX_FLYING_MESSAGE_PRICE) {
          return json({ error: "Price must be between 0 and 10000 Stars." }, 400);
        }
        await sbPostStrict(
          env,
          "rest/v1/app_settings?on_conflict=key",
          { key: "flying_message_price", value: String(price), updated_at: new Date().toISOString() },
          "resolution=merge-duplicates,return=minimal",
        );
        return json({ ok: true, starsPrice: price });
      } catch (e) {
        const status = Number(e?.status);
        if (status >= 400 && status < 500) return json({ error: e.message }, status);
        console.error("[worker] flying message price update failed", e && e.message);
        return json({ error: "Internal error" }, 500);
      }
    }

    // The old unauthenticated global feed is deliberately disabled.
    if (path === "/api/messages" && request.method === "GET") {
      return json({ error: "Use the authenticated messages feed." }, 405);
    }

    // GET /api/raffle — public aggregate state for compatibility. The mini app
    // uses the authenticated POST endpoint to also get its own ticket count.
    if (path === "/api/raffle" && request.method === "GET") {
      const retryAfter = rateLimit(request, "raffle-public-state", 120, 60_000);
      if (retryAfter) {
        return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      }
      try {
        const state = unwrapRpcResult(await sbPostStrict(
          env,
          "rest/v1/rpc/get_raffle_state",
          { p_tg_id: null },
        ));
        const publicState = state && typeof state === "object" ? { ...state } : {};
        delete publicState.userTicketCount;
        return json(publicState);
      } catch (e) {
        console.error("[worker] public raffle state failed", e && e.message);
        return json({ error: "Raffle information is temporarily unavailable." }, 503);
      }
    }

    // POST /api/reset-profile — admin-only force reset of a single profile.
    // Clearing only weight is enough to make the profile incomplete, while
    // preserving the user's avatar and all other saved profile data.
    // Authorization comes from the verified Telegram user and server-side role
    // lookup; target_id is validated and is never treated as the caller.
    if (path === "/api/reset-profile" && request.method === "POST") {
      const retryAfter = rateLimit(request, "admin-reset-profile", 10, 60_000);
      if (retryAfter) return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      try {
        const { target_id, initData, bot } = await request.json();
        if (!target_id) return json({ error: "Missing params" }, 400);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        const targetTelegramId = parseTelegramId(target_id);
        if (!targetTelegramId) return json({ error: "Invalid target ID" }, 400);
        const result = await sbPatchStrict(env, `rest/v1/profiles?id=eq.${encodeURIComponent(`tg_${targetTelegramId}`)}`, {
          weight: null,
        });
        if (!Array.isArray(result) || result.length === 0) return json({ error: "Profile not found" }, 404);
        return json({ reset: true });
      } catch (e) { return adminWriteFailure("Profile reset", e); }
    }

    // The managed admin/VIP list is only available to authenticated admins.
    if (path === "/api/roles" && request.method === "GET") {
      return json({ error: "Use the authenticated admin role-list request." }, 405);
    }

    // POST /api/roles — admin-only list/add/remove of admin/VIP entries.
    // Authorization comes from verified initData; the caller must be an admin.
    // The owner (mileschan852) role can never be added or removed here.
    if (path === "/api/roles" && request.method === "POST") {
      const retryAfter = rateLimit(request, "admin-role-update", 30, 60_000);
      if (retryAfter) return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      try {
        const { action, username, role, initData, bot } = await readJsonLimited(request);
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        if (action === "list") {
          const rows = await sbGetStrict(
            env,
            "rest/v1/app_roles?select=username,role,created_at&order=created_at.asc",
          );
          if (!Array.isArray(rows)) return json({ error: "Admin role list returned an invalid response" }, 502);
          return json(rows);
        }
        const uname = String(username || "").trim().toLowerCase().replace(/^@/, "");
        if (!/^[a-z0-9_]{5,32}$/.test(uname)) return json({ error: "Invalid username" }, 400);
        if (uname === OWNER_USERNAME) return json({ error: "Owner role is immutable" }, 403);
        if (action === "add") {
          if (role !== "admin" && role !== "vip") return json({ error: "Invalid role" }, 400);
          await sbPostStrict(
            env,
            "rest/v1/app_roles?on_conflict=username",
            { username: uname, role },
            "resolution=merge-duplicates,return=representation",
          );
          return json({ ok: true });
        }
        if (action === "remove") {
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/app_roles?username=eq.${encodeURIComponent(uname)}`, {
            method: "DELETE",
            headers: sbHeaders(env, true),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) {
            const error = new Error(`Supabase delete failed (${res.status})`);
            error.status = res.status;
            throw error;
          }
          return json({ ok: true });
        }
        return json({ error: "Invalid action" }, 400);
      } catch (e) {
        if (e?.requestBodyError) return json({ error: e.message }, e.status || 400);
        return adminWriteFailure("Admin role update", e);
      }
    }

    // POST /api/global-vip — admin-only. Grants EVERY user all paid functions
    // until a chosen time (epoch ms), or revokes it (until <= 0 / null).
    // Stored in app_settings.global_vip_until; clients read it and treat any
    // future value as VIP-for-all.
    if (path === "/api/global-vip" && request.method === "POST") {
      const retryAfter = rateLimit(request, "admin-global-vip", 10, 60_000);
      if (retryAfter) return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      try {
        const { until, initData, bot } = await request.json();
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        const untilMs = Number(until);
        const value = Number.isFinite(untilMs) && untilMs > Date.now() ? String(Math.floor(untilMs)) : "0";
        await sbPostStrict(
          env,
          "rest/v1/app_settings?on_conflict=key",
          { key: "global_vip_until", value, updated_at: new Date().toISOString() },
          "resolution=merge-duplicates,return=representation",
        );
        return json({ ok: true, until: value });
      } catch (e) { return adminWriteFailure("Global VIP update", e); }
    }

    // POST /api/reset-all — admin-only. Clears only weight for EVERY user.
    // Weight is required by the profile-completion check, so this shows the
    // setup screen on next login without erasing avatars or other profile data.
    if (path === "/api/reset-all" && request.method === "POST") {
      const retryAfter = rateLimit(request, "admin-reset-all", 2, 60_000);
      if (retryAfter) return json({ error: "Too many requests" }, 429, { "retry-after": String(retryAfter) });
      try {
        const { initData, bot } = await request.json();
        const authUser = await parseAuthUser(env, initData || "", bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        // PostgREST requires a filter for bulk PATCH; `id=not.is.null` matches all.
        await sbPatchStrict(env, "rest/v1/profiles?id=not.is.null", {
          weight: null,
        }, "return=minimal");
        let resetTimestampRecorded = true;
        try {
          const resetAt = String(Date.now());
          await sbPostStrict(
            env,
            "rest/v1/app_settings?on_conflict=key",
            { key: "force_reset_after", value: resetAt, updated_at: new Date().toISOString() },
            "resolution=merge-duplicates,return=minimal",
          );
        } catch (error) {
          resetTimestampRecorded = false;
          console.error("[worker] reset-all timestamp write failed", error && error.message);
        }
        return json({ ok: true, resetTimestampRecorded });
      } catch (e) { return adminWriteFailure("All-user reset", e); }
    }

    // GET /api/health
    if (path === "/api/health" || path === "/health") return json({ ok: true, version: "rls-hardened-1.2" });

    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env, context) {
    context.waitUntil((async () => {
      try {
        const result = unwrapRpcResult(await sbPostStrict(
          env,
          "rest/v1/rpc/draw_due_raffle_rounds",
          {},
        ));
        console.log("[worker] raffle draw check completed", result?.drawnRounds ?? 0);
      } catch (error) {
        console.error("[worker] raffle draw check failed", error && error.message);
        throw error;
      }
    })());
  },
};
