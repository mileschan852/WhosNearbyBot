// WhosNearbyBot Worker — Stars invoices + TON NFT mint payments.
// Plain fetch, no client libs. Secrets come from env:
//   TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   WORKER_SECRET — shared key for /create-invoice and /mint auth
//
// Endpoints:
//   POST /create-invoice     — Telegram Stars invoice (legacy subscriptions)
//   POST /telegram-webhook   — verify + apply Stars payments (idempotent)
//   GET  /mint-state         — current NFT tier prices + remaining supply
//   POST /mint               — verify TON payment tx on-chain, then record mint + apply entitlement
//   GET  /health

// Simple in-memory rate limiter (~1 req/s per IP burst smoothed over 10s window).
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 30;           // max requests per window per IP
const rateBuckets = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateBuckets.has(ip)) rateBuckets.set(ip, []);
  const bucket = rateBuckets.get(ip);
  while (bucket.length && bucket[0] <= now - RATE_WINDOW_MS) bucket.shift();
  if (bucket.length >= RATE_MAX) return false;
  bucket.push(now);
  return true;
}

function requireSecret(request, env) {
  const provided = request.headers.get('X-Worker-Key') || '';
  return provided === (env.WORKER_SECRET || '');
}

const ALLOWED_TYPES = {
  hide_age:          { title: 'Hide Age (30 Days)',        description: 'Hide your age on your profile for 30 days.',        amount: 1000 },
  invisible:         { title: 'Invisible Mode (30 Days)',  description: 'Browse and go invisible on the grid for 30 days.', amount: 3000 },
  edit_profile:      { title: 'Edit Profile Pass',        description: 'Unlock profile editing permissions.',               amount: 1000 },
  change_filter:     { title: 'Filter Subscription (30 Days)', description: 'Custom filter override for 30 days.',            amount: 1000 },
  change_preference: { title: 'Change Profile & Preferences', description: 'One-time unlock to edit profile and preferences.', amount: 1000 },
};

const EXPIRY_DAYS = {
  hide_age: 30,
  invisible: 30,
  edit_profile: 30,
  change_filter: 30,
  change_preference: 1,
};

const TON_RECEIVER = 'EQBYY0vv7FoRuPTeCs6ht7kMM-tab8SRAZy14Ye8AS46SLVZ';
const TON_SUPPLY = 500;
const TON_BASE_PRICE = {
  invisible: 3,
  unlock_filter: 2,
  hide_name: 1,
};
const TIERS = ['invisible', 'unlock_filter', 'hide_name'];
const TONCENTER = 'https://toncenter.com/api/v2/jsonRPC';

function json(body, status = 200, cors = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (cors) {
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function supabase(env, path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (opts.prefer) headers['Prefer'] = opts.prefer;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res;
}

async function mintState(env) {
  let counts = { invisible: 0, unlock_filter: 0, hide_name: 0 };
  try {
    const res = await supabase(env, `transactions?item_type=in.like.mint_%25&status=eq.paid&select=item_type`);
    if (res.ok) {
      const rows = await res.json();
      for (const r of rows) {
        const tier = (r.item_type || '').replace('mint_', '');
        if (counts[tier] !== undefined) counts[tier]++;
      }
    }
  } catch (e) { console.error('mint-state supabase error', e); }

  const tiers = {};
  for (const t of TIERS) {
    const minted = counts[t];
    tiers[t] = {
      price: TON_BASE_PRICE[t] + minted,
      minted,
      supply: Math.max(0, TON_SUPPLY - minted),
      soldOut: minted >= TON_SUPPLY,
    };
  }
  return json({ receiver: TON_RECEIVER, tiers }, 200, true);
}

async function doMint(request, env) {
  if (!requireSecret(request, env)) return json({ error: 'Unauthorized' }, 401, true);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, true); }

  const { userId, tier, txHash, amount } = body || {};
  if (!userId || !TIERS.includes(tier) || !txHash) {
    return json({ error: 'userId, tier and txHash are required' }, 400, true);
  }

  const state = await mintState(env);
  const tierState = (await state.json()).tiers[tier];
  if (tierState.soldOut) return json({ error: 'Sold out' }, 409, true);
  const expectedNano = Math.round(tierState.price * 1e9);

  let verified = false;
  try {
    const rpc = await fetch(TONCENTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getTransactions',
        params: { address: TON_RECEIVER, limit: 100 },
      }),
    });
    const data = await rpc.json();
    const txs = data.result || [];
    const hash = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
    for (const tx of txs) {
      const txId = tx.transaction_id || {};
      const txHashB64 = txId.hash || '';
      const txHashHex = Buffer.from(txHashB64, 'base64').toString('hex');
      if (txHashHex !== hash.toLowerCase()) continue;
      const inMsg = tx.in_msg || {};
      const value = Number(inMsg.value || 0);
      if (value >= expectedNano * 0.99 && value <= expectedNano * 1.05) {
        verified = true;
        break;
      }
    }
  } catch (e) { console.error('ton verify error', e); }

  if (!verified) return json({ error: 'Payment could not be verified on-chain' }, 403, true);

  const dupRes = await supabase(env, `transactions?note=eq.${encodeURIComponent(txHash)}&select=id`);
  const dupRows = dupRes.ok ? await dupRes.json() : [];
  if (dupRows.length > 0) return json({ ok: true, skipped: 'already processed' }, 200, true);

  const record = await supabase(env, 'transactions', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      tg_id: userId,
      item_type: `mint_${tier}`,
      base_amount: Math.round(tierState.price),
      final_charged: Math.round(tierState.price),
      status: 'paid',
      note: txHash,
    },
  });
  if (record.status !== 201 && record.status !== 200) {
    const txt = await record.text().catch(() => '');
    console.error('record mint failed', record.status, txt);
    return json({ error: 'Failed to record mint' }, 500, true);
  }

  const farFuture = '2099-12-31T23:59:59Z';
  let updateData = {};
  if (tier === 'invisible') updateData = { grid_visible: false, invisible_expiry: farFuture };
  else if (tier === 'hide_name') updateData = { hide_name: true };
  else if (tier === 'unlock_filter') updateData = { filter_unlocked: true };

  if (Object.keys(updateData).length > 0) {
    const up = await supabase(env, `profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: updateData,
    });
    if (!up.ok) {
      const txt = await up.text().catch(() => '');
      console.error('profile update failed', up.status, txt);
    }
  }

  return json({ ok: true, tier, price: tierState.price, remaining: tierState.supply - 1 }, 200, true);
}

async function createInvoice(request, env) {
  if (!requireSecret(request, env)) return json({ error: 'Unauthorized' }, 401, true);
  const body = await request.json().catch(() => null);
  if (!body || !body.userId || !body.type) {
    return json({ error: 'userId and type are required' }, 400, true);
  }
  const cfg = ALLOWED_TYPES[body.type];
  if (!cfg) return json({ error: 'Invalid subscription type' }, 400, true);

  const payload = {
    title: cfg.title,
    description: cfg.description,
    payload: JSON.stringify({ userId: body.userId, type: body.type }),
    currency: 'XTR',
    prices: [{ label: cfg.title, amount: cfg.amount }],
  };
  const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const tgData = await tgRes.json().catch(() => ({}));
  if (!tgData.ok) return json({ error: tgData.description || 'Telegram invoice creation failed' }, 500, true);
  return json({ invoiceLink: tgData.result }, 200, true);
}

async function telegramWebhook(request, env) {
  const expectedToken = env.TELEGRAM_WEBHOOK_SECRET || '';
  if (expectedToken && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== expectedToken) {
    return json({ error: 'Unauthorized' }, 401, true);
  }
  let update;
  try { update = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!update.message || !update.message.successful_payment) return json({ ok: true });

  const payment = update.message.successful_payment;
  const invoicePayload = JSON.parse(payment.invoice_payload || '{}');
  const userId = invoicePayload.userId;
  const subType = invoicePayload.type;
  if (!userId || !subType || !ALLOWED_TYPES[subType]) return json({ error: 'Invalid invoice payload' }, 400);

  const chargeIds = [payment.provider_payment_charge_id, payment.telegram_payment_charge_id].filter(Boolean);

  const idemRes = await supabase(env, 'transactions', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      tg_id: userId,
      item_type: subType,
      base_amount: payment.total_amount || ALLOWED_TYPES[subType].amount,
      final_charged: payment.total_amount || ALLOWED_TYPES[subType].amount,
      status: 'paid',
      note: payment.telegram_payment_charge_id || '',
    },
  });
  if (idemRes.status !== 201 && idemRes.status !== 200) {
    if (idemRes.status === 409) return json({ ok: true, skipped: 'already processed' });
    return json({ error: 'Failed to record payment' }, 500);
  }

  const expiry = new Date(Date.now() + (EXPIRY_DAYS[subType] || 30) * 86400000).toISOString();
  let updateData = {};
  if (subType === 'hide_age') updateData = { hide_age: true, hide_age_expiry: expiry };
  else if (subType === 'invisible') updateData = { grid_visible: false, invisible_expiry: expiry };
  else if (subType === 'edit_profile') updateData = { edit_profile_pass: true, edit_profile_expiry: expiry };

  if (Object.keys(updateData).length > 0) {
    const sbRes = await supabase(env, `profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: updateData,
    });
    if (!sbRes.ok) return json({ error: 'Failed to update profile' }, 500);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Key',
        },
      });
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(ip)) return json({ error: 'Too Many Requests' }, 429, true);

    if (url.pathname === '/create-invoice' && request.method === 'POST') return createInvoice(request, env);
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') return telegramWebhook(request, env);
    if (url.pathname === '/mint-state' && request.method === 'GET') return mintState(env);
    if (url.pathname === '/mint' && request.method === 'POST') return doMint(request, env);
    if (url.pathname === '/health') return json({ ok: true });
    return json({ error: 'Not Found' }, 404);
  },
}