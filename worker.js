// WhosNearbyBot Payment Worker — Cloudflare Worker (plain fetch, no client libs).
//
// Secrets come from env (wrangler secrets / hosting-provided vars):
//   TELEGRAM_BOT_TOKEN  — bot token for @WhosNearbyBot
//   SUPABASE_URL        — https://<ref>.supabase.co
//   SUPABASE_ANON_KEY   — anon (or service) key used for REST calls
//
// Endpoints:
//   POST /create-invoice  — create a Telegram Stars invoice
//   POST /telegram-webhook — verify + apply successful Stars payments (idempotent)
//   GET  /health          — liveness probe

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
  change_preference: 1, // one-time pass, no long entitlement needed
};

function json(body, status = 200, cors = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (cors) {
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// POST /create-invoice
async function createInvoice(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.userId || !body.type) {
    return json({ error: 'userId and type are required' }, 400, true);
  }

  const cfg = ALLOWED_TYPES[body.type];
  if (!cfg) {
    return json({ error: 'Invalid subscription type' }, 400, true);
  }

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

  if (!tgData.ok) {
    return json({ error: tgData.description || 'Telegram invoice creation failed' }, 500, true);
  }

  return json({ invoiceLink: tgData.result }, 200, true);
}

// POST /telegram-webhook
async function telegramWebhook(request, env) {
  let update;
  try {
    update = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Telegram bots must acknowledge every update; not a payment -> ack.
  if (!update.message || !update.message.successful_payment) {
    return json({ ok: true });
  }

  const payment = update.message.successful_payment;
  const invoicePayload = JSON.parse(payment.invoice_payload || '{}');
  const userId = invoicePayload.userId;
  const subType = invoicePayload.type;

  if (!userId || !subType || !ALLOWED_TYPES[subType]) {
    return json({ error: 'Invalid invoice payload' }, 400);
  }

  // Verify the charge actually exists on Telegram's side (getUpdates),
  // and that this charge has not been applied already (idempotency).
  const chargeIds = [payment.provider_payment_charge_id, payment.telegram_payment_charge_id].filter(Boolean);

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    });
    const tgData = await tgRes.json();

    const verified = Array.isArray(tgData.result) && tgData.result.some((u) => {
      const p = u && u.message && u.message.successful_payment;
      if (!p) return false;
      if (p.provider_payment_charge_id && chargeIds.includes(p.provider_payment_charge_id)) return true;
      if (p.telegram_payment_charge_id && chargeIds.includes(p.telegram_payment_charge_id)) return true;
      return false;
    });

    if (!verified) {
      return json({ error: 'Payment could not be verified via Telegram' }, 403);
    }

    // Idempotency: insert the charge id first; if it already exists, skip.
    const idemRes = await fetch(`${env.SUPABASE_URL}/rest/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        type: subType,
        amount: payment.total_amount || ALLOWED_TYPES[subType].amount,
        currency: payment.currency || 'XTR',
        provider_payment_charge_id: payment.provider_payment_charge_id || null,
        telegram_payment_charge_id: payment.telegram_payment_charge_id || null,
      }),
    });

    // 201 = newly recorded; 409 (unique violation) = already processed.
    if (idemRes.status !== 201 && idemRes.status !== 200) {
      if (idemRes.status === 409) {
        return json({ ok: true, skipped: 'already processed' });
      }
      const errText = await idemRes.text().catch(() => '');
      console.error('Idempotency insert failed:', idemRes.status, errText);
      return json({ error: 'Failed to record payment' }, 500);
    }

    // Apply the entitlement.
    const expiry = new Date(Date.now() + (EXPIRY_DAYS[subType] || 30) * 86400000).toISOString();
    let updateData = {};

    if (subType === 'hide_age') {
      updateData = { hide_age: true, hide_age_expiry: expiry };
    } else if (subType === 'invisible') {
      updateData = { grid_visible: false, invisible_expiry: expiry };
    } else if (subType === 'edit_profile') {
      updateData = { edit_profile_pass: true, edit_profile_expiry: expiry };
    } else if (subType === 'change_filter' || subType === 'change_preference') {
      // Frontend applies these immediately after openInvoice('paid'); the
      // webhook just records the transaction (idempotency + audit).
      updateData = {};
    }

    if (Object.keys(updateData).length > 0) {
      const sbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(updateData),
      });

      if (!sbRes.ok) {
        const errText = await sbRes.text().catch(() => '');
        console.error('Supabase update failed:', sbRes.status, errText);
        return json({ error: 'Failed to update profile' }, 500);
      }
    }

    return json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return json({ error: 'Webhook Error' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/create-invoice' && request.method === 'POST') {
      return createInvoice(request, env);
    }

    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return telegramWebhook(request, env);
    }

    if (url.pathname === '/health') {
      return json({ ok: true });
    }

    return json({ error: 'Not Found' }, 404);
  },
};
