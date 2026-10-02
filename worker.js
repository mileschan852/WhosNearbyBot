// WhosNearbyBot worker — authenticated API and payment fulfillment.
// Bindings: BOT_A_TOKEN, BOT_B_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
//           TELEGRAM_WEBHOOK_SECRET
// TELEGRAM_WEBHOOK_SECRET set => /telegram-webhook requires the
// X-Telegram-Bot-Api-Secret-Token header to match (setWebhook secret_token).
// All private profile and payment database access uses the server-only key.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
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
  const { private_notes, ...safe } = profile;
  return safe;
}

// Usernames that are always admin regardless of the managed list. The owner
// (mileschan852) can never be demoted.
const OWNER_USERNAME = "mileschan852";
const ALWAYS_ADMIN = [OWNER_USERNAME, "hkmembersonly"];

// True when the verified Telegram user is an admin: the hard-coded owner id,
// an always-admin username, or a username stored as role=admin in app_roles.
async function isAdminCaller(env, authUser) {
  if (Number(authUser?.id) === ADMIN_ID) return true;
  const uname = (authUser?.username || "").toLowerCase();
  if (!uname) return false;
  if (ALWAYS_ADMIN.includes(uname)) return true;
  const rows = await sbGet(env, `rest/v1/app_roles?select=role&username=eq.${encodeURIComponent(uname)}`);
  const role = (Array.isArray(rows) ? rows[0] : rows)?.role;
  return role === "admin";
}

async function isPaidUnlocked(env, authUser) {
  if (await isAdminCaller(env, authUser)) return true;
  const username = (authUser?.username || "").toLowerCase();
  if (username) {
    const rows = await sbGet(env, `rest/v1/app_roles?select=role&username=eq.${encodeURIComponent(username)}`);
    const role = (Array.isArray(rows) ? rows[0] : rows)?.role;
    if (role === "vip") return true;
  }
  const settings = await sbGet(env, "rest/v1/app_settings?select=value&key=eq.global_vip_until");
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

async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, { headers: sbHeaders(env) });
  if (!res.ok) return null;
  return res.json();
}

async function sbGetStrict(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, { headers: sbHeaders(env) });
  if (!res.ok) throw new Error(`Supabase read failed (${res.status})`);
  return res.json();
}

async function sbPostStrict(env, path, body, prefer = "return=representation") {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, {
    method: "POST",
    headers: { ...sbHeaders(env, true), "Prefer": prefer },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase write failed (${res.status})`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbPatchStrict(env, path, body) {
  const res = await fetch(`${env.SUPABASE_URL}/${path}`, {
    method: "PATCH",
    headers: { ...sbHeaders(env, true), "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase update failed (${res.status})`);
  return res.json();
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
  params.delete("signature");
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(token));
  const signKey = await crypto.subtle.importKey(
    "raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));
  const hex = [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, hash);
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
    let payment = null;
    try { payment = JSON.parse(query.invoice_payload || "null"); } catch {}
    const bot = payment?.bot === "botA" ? "botA" : "botB";
    const token = getBotToken(env, bot);
    if (!token) return new Response("Payment bot is not configured", { status: 503 });
    const config = payment && ALLOWED_TYPES[payment.type];
    const amount = payment?.amount ?? payment?.finalAmount;
    const valid = Boolean(
      token && config &&
      parseTelegramId(payment?.tg_id) === String(query.from?.id || "") &&
      amount === config.amount &&
      query.currency === "XTR" &&
      query.total_amount === config.amount
    );
    const result = await fetch(`https://api.telegram.org/bot${token || ""}/answerPreCheckoutQuery`, {
      method: "POST",
      body: JSON.stringify({
        pre_checkout_query_id: query.id,
        ok: valid,
        ...(!valid ? { error_message: "This invoice is no longer valid. Please create a new one." } : {}),
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (!result.ok) throw new Error(`Telegram pre-checkout response failed (${result.status})`);
    return new Response("OK");
  }
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
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
      try {
        const { initData, bot } = await request.json();
        if (!initData || !bot) return json({ error: "Missing initData or bot" }, 400);
        const tgUser = await parseAuthUser(env, initData, bot);
        if (!tgUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const tgId = `tg_${parseTelegramId(tgUser.id)}`;
        const profileData = { id: tgId, name: tgUser.first_name || "", username: tgUser.username || null, avatar: tgUser.photo_url || null, last_seen: new Date().toISOString() };
        const profile = await sbUpsertProfile(env, profileData);
        if (!profile) return json({ error: "Profile could not be loaded" }, 503);
        return json({ profile: safeOwnProfile(profile) });
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // POST /api/nearby — identity, location and admin scope are server-derived.
    if (path === "/api/nearby" && request.method === "POST") {
      try {
        const { initData, bot } = await request.json();
        const authUser = await parseAuthUser(env, initData, bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const profileId = `tg_${parseTelegramId(authUser.id)}`;
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
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // POST /api/profile
    if (path === "/api/profile" && request.method === "POST") {
      try {
        const { initData, bot, profile } = await request.json();
        const authUser = await parseAuthUser(env, initData, bot);
        if (!authUser) return json({ error: "Invalid or expired Telegram session" }, 401);
        const result = await updateOwnProfile(env, authUser, profile);
        return result.error
          ? json({ error: result.error }, result.status || 400)
          : json({ updated: true, profile: result.profile });
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // POST /api/invoice  (alias: /create-invoice)
    if ((path === "/api/invoice" || path === "/create-invoice") && request.method === "POST") {
      try {
        const body = await request.json();
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
        });
        const data = await res.json();
        if (!res.ok || !data.ok) return json({ error: data.description || "Telegram invoice request failed" }, 502);
        return json({ invoiceLink: data.result });
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
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

    // GET/POST /api/messages
    if (path === "/api/messages" && request.method === "GET") {
      try {
        const requestedLimit = parseInt(url.searchParams.get("limit") || "10", 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 10;
        return json(await sbGet(env, `rest/v1/flying_messages?order=created_at.desc&limit=${limit}`) || []);
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }
    if (path === "/api/messages" && request.method === "POST") {
      try {
        const { text, initData } = await request.json();
        const authUser = await parseAuthUser(env, initData || "");
        if (!authUser) return json({ error: "Unauthorized" }, 401);
        if (typeof text !== "string" || !text.trim()) return json({ error: "Missing text" }, 400);
        await sbPostStrict(env, "rest/v1/flying_messages", {
          id: crypto.randomUUID(),
          tg_id: parseTelegramId(authUser.id),
          text: text.trim().slice(0, 200),
          from_name: String(authUser.first_name || "Anonymous").slice(0, 60),
        });
        return json({ ok: true });
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // GET /api/raffle
    if (path === "/api/raffle" && request.method === "GET") {
      const state = await sbGet(env, "rest/v1/raffle_state?id=eq.1");
      return json(Array.isArray(state) ? state[0] : state || { prize_name: "Ultimate Bundle", tickets_sold: 0 });
    }

    // POST /api/reset-profile — admin-only force reset of a single profile.
    // Authorization comes from the verified Telegram user and server-side role
    // lookup; target_id is validated and is never treated as the caller.
    if (path === "/api/reset-profile" && request.method === "POST") {
      try {
        const { target_id, initData } = await request.json();
        if (!target_id) return json({ error: "Missing params" }, 400);
        const authUser = await parseAuthUser(env, initData || "");
        if (!authUser) return json({ error: "Unauthorized" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        const targetTelegramId = parseTelegramId(target_id);
        if (!targetTelegramId) return json({ error: "Invalid target ID" }, 400);
        const result = await sbPatchStrict(env, `rest/v1/profiles?id=eq.${encodeURIComponent(`tg_${targetTelegramId}`)}`, {
          name: "", username: null, avatar: null, dob: null, height: null, weight: null,
          gender: "man", seeking: "men", role_pref: null, safety_pref: null, playstyle_pref: null,
          where_pref: null, how_many_pref: null, hide_age: false, grid_visible: true, map_visible: false,
          is_underage: false, hide_age_expiry: null, invisible_expiry: null,
        });
        if (!Array.isArray(result) || result.length === 0) return json({ error: "Profile not found" }, 404);
        return json({ reset: true });
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // GET /api/roles — list managed admin/VIP entries (public read).
    if (path === "/api/roles" && request.method === "GET") {
      try {
        const rows = await sbGet(env, "rest/v1/app_roles?select=username,role,created_at&order=created_at.asc");
        return json(Array.isArray(rows) ? rows : []);
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // POST /api/roles — admin-only add/remove of admin/VIP entries.
    // Authorization comes from verified initData; the caller must be an admin.
    // The owner (mileschan852) role can never be added or removed here.
    if (path === "/api/roles" && request.method === "POST") {
      try {
        const { action, username, role, initData } = await request.json();
        const authUser = await parseAuthUser(env, initData || "");
        if (!authUser) return json({ error: "Unauthorized" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
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
            method: "DELETE", headers: sbHeaders(env, true),
          });
          return json({ ok: res.ok });
        }
        return json({ error: "Invalid action" }, 400);
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // POST /api/global-vip — admin-only. Grants EVERY user all paid functions
    // until a chosen time (epoch ms), or revokes it (until <= 0 / null).
    // Stored in app_settings.global_vip_until; clients read it and treat any
    // future value as VIP-for-all.
    if (path === "/api/global-vip" && request.method === "POST") {
      try {
        const { until, initData } = await request.json();
        const authUser = await parseAuthUser(env, initData || "");
        if (!authUser) return json({ error: "Unauthorized" }, 401);
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
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // POST /api/reset-all — admin-only. Clears the required profile fields for
    // EVERY user so the "complete your info" setup screen appears on their next
    // login. Mirrors /api/reset-profile but applied across all rows.
    if (path === "/api/reset-all" && request.method === "POST") {
      try {
        const { initData } = await request.json();
        const authUser = await parseAuthUser(env, initData || "");
        if (!authUser) return json({ error: "Unauthorized" }, 401);
        if (!(await isAdminCaller(env, authUser))) return json({ error: "Forbidden" }, 403);
        // PostgREST requires a filter for bulk PATCH; `id=not.is.null` matches all.
        await sbPatchStrict(env, "rest/v1/profiles?id=not.is.null", {
          name: null, username: null, avatar: null, dob: null, height: null, weight: null,
          gender: "man", seeking: "men", role_pref: null, safety_pref: null, playstyle_pref: null,
          where_pref: null, how_many_pref: null, non_man_mode: null, hide_age: false,
          grid_visible: true, map_visible: false, hide_age_expiry: null, invisible_expiry: null,
        });
        const resetAt = String(Date.now());
        await sbPostStrict(
          env,
          "rest/v1/app_settings?on_conflict=key",
          { key: "force_reset_after", value: resetAt, updated_at: new Date().toISOString() },
          "resolution=merge-duplicates,return=representation",
        );
        return json({ ok: true });
      } catch (e) { console.error("[worker]", e && e.message); return json({ error: "Internal error" }, 500); }
    }

    // GET /api/health
    if (path === "/api/health" || path === "/health") return json({ ok: true, version: "rls-hardened-1.2" });

    return json({ error: "Not found" }, 404);
  },
};
