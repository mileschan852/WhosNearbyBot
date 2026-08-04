// WhosNearbyBot Payment Worker — plain fetch, no supabase-js dependency
const TELEGRAM_BOT_TOKEN = '8155360875:AAHDcl3wcrNolWauDEpteH-br3AzIdE6f_Q';
const SUPABASE_URL = 'https://fngcjkclxxodjaiqkfkm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZ2Nqa2NseHhvZGphaXFrZmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTE4NzUsImV4cCI6MjA5MjU2Nzg3NX0.dpoNP8EO7iZCFP7dzjD33mCdiJ0gxl5lTl6-hPY0HH4';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // --- POST /create-invoice — create Telegram Stars invoice ---
    if (url.pathname === '/create-invoice' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.userId;
        const subType = body.type;

        let title = '', description = '', amount = 0;
        if (subType === 'hide_age') {
          title = 'Hide Age (30 Days)';
          description = 'Hide your age on your profile for 30 days.';
          amount = 1000;
        } else if (subType === 'invisible') {
          title = 'Invisible Mode (30 Days)';
          description = 'Browse and go invisible on the grid for 30 days.';
          amount = 3000;
        } else if (subType === 'edit_profile') {
          title = 'Edit Profile Pass';
          description = 'Unlock profile editing permissions.';
          amount = 1000;
        } else {
          return new Response(JSON.stringify({ error: 'Invalid subscription type' }), { status: 400, headers: corsHeaders });
        }

        const payload = {
          title,
          description,
          payload: JSON.stringify({ userId, type: subType }),
          currency: 'XTR',
          prices: [{ label: title, amount }],
        };

        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const tgData = await tgRes.json();
        if (!tgData.ok) {
          return new Response(JSON.stringify({ error: tgData.description }), { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ invoiceLink: tgData.result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // --- POST /telegram-webhook — handle successful Stars payments ---
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      try {
        const update = await request.json();

        if (update.message && update.message.successful_payment) {
          const payment = update.message.successful_payment;
          const invoicePayload = JSON.parse(payment.invoice_payload);
          const userId = invoicePayload.userId;
          const subType = invoicePayload.type;

          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          const expiryIso = expiryDate.toISOString();

          let updateData = {};
          if (subType === 'hide_age') updateData = { hide_age: true, hide_age_expiry: expiryIso };
          else if (subType === 'invisible') updateData = { grid_visible: false, invisible_expiry: expiryIso };
          else if (subType === 'edit_profile') updateData = { edit_profile_pass: true, edit_profile_expiry: expiryIso };

          // Update Supabase profile via REST API (no client library)
          const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(updateData),
          });

          if (!sbRes.ok) {
            const errText = await sbRes.text();
            console.error('Supabase update failed:', sbRes.status, errText);
          }
        }

        return new Response('OK', { status: 200 });
      } catch (err) {
        return new Response('Webhook Error', { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};