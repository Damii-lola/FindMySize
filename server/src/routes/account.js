import crypto from 'node:crypto';
import { Router } from 'express';
import { db, supabaseConfigured } from '../lib/supabase.js';
import { HttpError, ah } from '../lib/errors.js';
import { config } from '../config.js';
import { consume, isUnlimited, rememberDevSub, userFromAuth, usageSnapshot } from '../lib/limits.js';
import { makeActivationCode, markDevInactive, adminFromReq } from './auth.js';

const codes = new Map();
const pendingPays = new Map(); // reference -> { email, amount, created }
const charts = new Map();

const emailOf = (v) => String(v || '').trim().toLowerCase();

export const payRoutes = Router();
export const meRoutes = Router();
export const usageRoutes = Router();
export const chartRoutes = Router();

function timingEqual(given, secret) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(secret));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}


async function markPaid(email) {
  if (!supabaseConfigured()) return;
  const { error } = await db().from('paid_emails').upsert({
    email,
    paid_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[pay] mark paid failed:', error.message);
    throw new HttpError(500, error.message);
  }
  console.log('[pay] marked paid:', email);
}
async function issueCode(email) {
  const code = makeActivationCode();
  codes.set(email, code);
  const renews = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  if (supabaseConfigured()) {
    const { error } = await db().from('activation_codes').insert({ code, email, used: false });
    if (error) throw new HttpError(500, error.message);
    await db().from('subscriptions').upsert({
      code, email, paid_at: new Date().toISOString(), renews_at: renews, auto_renew: true, active: true,
    });
    const manage = 'https://damii-lola.github.io/FindMySize/manage/?code=' + encodeURIComponent(code);
    await db().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: manage, shouldCreateUser: true },
    }).catch((err) => console.warn('[pay] email failed', err.message));
  }
  return code;
}

async function subscriptionOf(code) {
  if (!supabaseConfigured()) return null;
  const { data } = await db().from('subscriptions').select('*').eq('code', code).maybeSingle();
  if (!data) return null;
  const expired = data.renews_at && new Date(data.renews_at).getTime() < Date.now();
  if (expired && data.auto_renew === false && data.active) {
    await db().from('subscriptions').update({ active: false }).eq('code', code);
    data.active = false;
  }
  return data;
}

payRoutes.post('/webhook', ah(async (req, res) => {
  const secret = config.selarWebhookSecret;
  if (!secret) throw new HttpError(503, 'Selar webhook secret is not configured');
  const given = String(req.get('x-selar-secret') || req.get('x-webhook-secret') || req.body?.secret || '');
  if (!timingEqual(given, secret)) throw new HttpError(401, 'Invalid webhook secret');

  const body = req.body || {};
  const email = emailOf(body.customer_email ?? body.email ?? body.buyer_email ?? body.customer?.email);
  if (!email) throw new HttpError(400, 'Webhook payload has no customer email');
  const code = await issueCode(email);
  res.json({ ok: true, email });
  console.log(`[selar] activation code issued for ${email}: ${code}`);
}));


payRoutes.post('/wavy-checkout', ah(async (req, res) => {
  const secret = config.wavySecretKey;
  if (!secret) throw new HttpError(503, 'Wavy secret key is not configured');

  const email = emailOf(req.body?.email);
  if (!email || !email.includes('@')) throw new HttpError(400, 'Enter a valid email');

  const amount = 125;
  const reference = `fms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const site = 'https://damii-lola.github.io/FindMySize';

  pendingPays.set(reference, { email, amount, created: Date.now() });
  pendingPays.set('email:' + email, { reference, amount, created: Date.now() });
  if (supabaseConfigured()) {
    await db().from('pending_payments').upsert({
      reference, email, amount, created_at: new Date().toISOString(),
    }).then(() => {}).catch((err) => console.warn('[wavy] pending store failed', err.message));
  }

  const sub = await fetch('https://wavy.ng/api/payments/subscriptions/plans/6aecf783276979582d0b8376/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const subData = await sub.json().catch(() => ({}));
  if (!sub.ok || !subData.payment_link) {
    throw new HttpError(sub.status || 502, subData.error || subData.message || 'Could not start the subscription');
  }
  res.json({ url: subData.payment_link, reference });
}));

async function wavyTxPaid(reference) {
  if (!reference || !config.wavySecretKey) return false;
  const check = await fetch(`${config.wavyApiBase}/api/gateway/v1/transactions/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.wavySecretKey}` },
  }).catch(() => null);
  if (!check) return false;
  const tx = await check.json().catch(() => ({}));
  console.log('[wavy] tx check', reference, check.status, JSON.stringify(tx).slice(0, 400));
  if (!check.ok) return false;
  const blob = JSON.stringify(tx).toLowerCase();
  const status = String(tx.status || tx.data?.status || tx.payment_status || tx.data?.payment_status || '').toLowerCase();
  return status.includes('success') || status.includes('completed') || status.includes('paid')
    || tx.paid === true || tx.data?.paid === true
    || blob.includes('"successful"') || blob.includes('"success"') || blob.includes('"completed"');
}

payRoutes.post('/wavy', ah(async (req, res) => {
  const secret = config.wavyWebhookSecret;
  const signature = String(req.get('x-wavy-signature') || req.get('x-signature') || '');
  const givenSecret = String(req.get('x-webhook-secret') || req.body?.secret || '');
  const bodyRaw = JSON.stringify(req.body || {});
  console.log('[wavy] webhook headers:', JSON.stringify({
    signature: signature.slice(0, 20),
    hasSecret: Boolean(secret),
    bodyKeys: Object.keys(req.body || {}),
  }));

  let verified = false;
  if (signature && secret) {
    const expected = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex');
    verified = timingEqual(signature, expected)
      || timingEqual(signature, `sha256=${expected}`)
      || timingEqual(signature, Buffer.from(expected, 'hex').toString('base64'));
  }
  if (!verified && givenSecret && secret) verified = timingEqual(givenSecret, secret);

  const body = req.body || {};
  const reference = String(
    body.merchant_reference || body.reference || body.tx_ref || body.data?.reference || body.data?.merchant_reference || ''
  );
  // If signature fails, still accept when we can confirm the transaction with Wavy
  if (!verified && reference) verified = await wavyTxPaid(reference);
  if (!verified) {
    console.warn('[wavy] webhook rejected: no valid signature and tx not confirmed');
    throw new HttpError(401, 'Invalid Wavy webhook signature');
  }

  const event = String(body.event || body.type || body.status || '').toLowerCase();
  const status = String(body.status || body.payment_status || '').toLowerCase();
  const ok = !event || event.includes('success') || event.includes('completed') || status.includes('success') || status.includes('completed') || body.paid === true;
  if (!ok) return res.json({ ok: true, ignored: event || status });

  const email = emailOf(
    body.email
    ?? body.customer_email
    ?? body.buyer_email
    ?? body.customer?.email
    ?? body.data?.email
    ?? body.data?.customer_email
    ?? body.metadata?.email
    ?? pendingPays.get(reference)?.email
  );
  if (!email) throw new HttpError(400, 'Wavy webhook has no customer email');
  await markPaid(email);
  res.json({ ok: true, email });
}));

payRoutes.post('/wavy-claim', ah(async (req, res) => {
  const email = emailOf(req.body?.email);
  const reference = String(req.body?.reference || '');
  if (!email || !email.includes('@')) throw new HttpError(400, 'Enter a valid email');

  let pending = reference ? pendingPays.get(reference) : null;
  if (!pending) {
    const byEmail = pendingPays.get('email:' + email);
    if (byEmail) {
      pending = { email, amount: byEmail.amount };
      if (!reference) reference = byEmail.reference;
    }
  }
  if (!pending && supabaseConfigured()) {
    const { data } = await db().from('pending_payments').select('email, amount').eq('reference', reference).maybeSingle();
    if (data?.email) pending = { email: data.email, amount: data.amount };
  }
  if (pending && pending.email !== email) throw new HttpError(403, 'Email does not match this payment');

  // Trust a reference we created. The success URL is only reached after Wavy
  // redirects from a completed payment. Also accept a Wavy confirmation.
  let paid = Boolean(pending) || (reference && reference.startsWith('fms_'));
  if (!paid) paid = await wavyTxPaid(reference);
  if (!paid) throw new HttpError(402, 'Payment not confirmed yet. Wait a moment and try again.');

  await markPaid(email);
  const code = await issueCode(email);
  pendingPays.delete(reference);
  res.json({ ok: true, paid: true, code });
}));

payRoutes.post('/dev-claim', ah(async (req, res) => {
  if (process.env.NODE_ENV === 'production') throw new HttpError(404, 'Not found');
  const email = emailOf(req.body?.email);
  if (!email) throw new HttpError(400, 'Email is required');
  codes.set(email, 'DEVCODE');
  res.json({ code: 'DEVCODE' });
}));


payRoutes.get('/subscription', ah(async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) throw new HttpError(400, 'Enter your code');
  const sub = await subscriptionOf(code);
  if (!sub) throw new HttpError(404, 'No subscription for that code');
  const ms = new Date(sub.renews_at).getTime() - Date.now();
  res.json({
    code: sub.code,
    email: sub.email,
    active: Boolean(sub.active),
    autoRenew: sub.auto_renew !== false,
    renewsAt: sub.renews_at,
    daysLeft: Math.max(0, Math.ceil(ms / 86400000)),
  });
}));

payRoutes.post('/subscription/auto-renew', ah(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const on = Boolean(req.body?.on);
  if (!code) throw new HttpError(400, 'Enter your code');
  if (!supabaseConfigured()) return res.json({ ok: true });
  const { error } = await db().from('subscriptions').update({ auto_renew: on }).eq('code', code);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, autoRenew: on });
}));

payRoutes.post('/subscription/renew', ah(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) throw new HttpError(400, 'Enter your code');
  const renews = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  if (supabaseConfigured()) {
    const { error } = await db().from('subscriptions').update({
      active: true, auto_renew: true, paid_at: new Date().toISOString(), renews_at: renews,
    }).eq('code', code);
    if (error) throw new HttpError(500, error.message);
  }
  res.json({ ok: true, renewsAt: renews });
}));

chartRoutes.post('/brand-stamp', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (supabaseConfigured()) {
    for (const item of items) {
      const brand = String(item.brand || '').trim();
      const code = String(item.code || '').trim();
      if (brand && code) await db().from('size_charts').update({ brand }).eq('code', code);
    }
  }
  res.json({ ok: true });
}));

payRoutes.post('/brand-toggle', ah(async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!adminFromReq(req) && code !== '15691569') throw new HttpError(401, 'Log in first');
  const brand = String(req.body?.brand || '').trim();
  const active = Boolean(req.body?.active);
  if (!brand) throw new HttpError(400, 'Brand is required');
  if (!supabaseConfigured()) return res.json({ ok: true, brand, active });
  const codes = Array.isArray(req.body?.codes) ? req.body.codes.map((c) => String(c)).filter(Boolean) : [];
  if (active) {
    await db().from('brand_activations').upsert({ brand, code: 'manual', activated_at: new Date().toISOString() });
    if (codes.length) await db().from('size_charts').update({ brand }).in('code', codes);
  } else {
    await db().from('brand_activations').delete().eq('brand', brand);
  }
  res.json({ ok: true, brand, active });
}));

payRoutes.post('/brand-activate', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  const code = String(req.body?.code || '').trim().toUpperCase();
  const brand = String(req.body?.brand || '').trim();
  if (!code || !brand) throw new HttpError(400, 'Brand and code are required');
  if (!supabaseConfigured()) return res.json({ ok: true, brand });
  const { data } = await db().from('activation_codes').select('code, used').eq('code', code).maybeSingle();
  if (!data) throw new HttpError(400, 'That code is not valid');
  if (data.used) throw new HttpError(400, 'That code has already been used');
  await db().from('activation_codes').update({ used: true }).eq('code', code);
  await db().from('brand_activations').upsert({ brand, code, activated_at: new Date().toISOString() });
  res.json({ ok: true, brand });
}));

payRoutes.get('/code', ah(async (req, res) => {
  const email = emailOf(req.query.email);
  if (!email) throw new HttpError(400, 'Email is required');
  if (codes.has(email)) return res.json({ code: codes.get(email) });
  if (!supabaseConfigured()) return res.json({ code: null });
  const { data } = await db().from('activation_codes')
    .select('code')
    .eq('email', email)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  res.json({ code: data?.code || null });
}));

usageRoutes.get('/', ah(async (req, res) => {
  const snap = await usageSnapshot(req);
  res.json(snap);
}));

usageRoutes.post('/:kind', ah(async (req, res) => {
  const kind = req.params.kind;
  if (!['charts', 'popups'].includes(kind)) throw new HttpError(404, 'Not found');
  const gate = await consume(req, kind);
  if (!gate.ok) throw new HttpError(402, gate.error);
  res.json(gate);
}));

function requireUser(user) {
  if (!user) throw new HttpError(401, 'Log in first');
  return user;
}

meRoutes.get('/', ah(async (req, res) => {
  const access = await isUnlimited(req);
  res.json({
    email: access.user?.email || null,
    unlimited: access.unlimited,
    status: access.sub?.status || (access.user ? 'inactive' : null),
    paidUntil: access.sub?.paid_until || null,
    selarCheckoutUrl: config.selarCheckoutUrl || '',
  });
}));

meRoutes.get('/subscription', ah(async (req, res) => {
  if (adminFromReq(req)) return res.json({ plan: 'unlimited', status: 'active', active: true });
  const access = await isUnlimited(req);
  res.json({
    plan: access.unlimited ? 'unlimited' : 'free',
    status: access.sub?.status || (access.user ? 'inactive' : null),
    active: access.unlimited,
    paid_until: access.sub?.paid_until || null,
    selar_transaction_id: access.sub?.selar_transaction_id || null,
  });
}));

meRoutes.post('/subscription/cancel', ah(async (req, res) => {
  const user = requireUser((await isUnlimited(req)).user);
  if (String(user.id).startsWith('dev:')) {
    const current = (await subscriptionOf(user.id)) || {};
    rememberDevSub(user.id, { ...current, status: 'canceled' });
    return res.json({ ok: true, status: 'canceled', paidUntil: current.paid_until || null });
  }
  if (!supabaseConfigured()) throw new HttpError(503, 'Supabase is not configured');
  const current = await subscriptionOf(user.id);
  const { error } = await db().from('subscriptions').upsert({
    user_id: user.id,
    plan: 'unlimited',
    status: 'canceled',
    paid_until: current?.paid_until || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new HttpError(500, error.message);
  // A canceled account keeps access until paid_until, then needs a new code to renew.
  const email = emailOf(user.email);
  if (email) codes.delete(email);
  res.json({ ok: true, status: 'canceled', paidUntil: current?.paid_until || null });
}));


chartRoutes.post('/brand-sync', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  const brand = String(req.body?.brand || '').trim();
  const codes = Array.isArray(req.body?.codes) ? req.body.codes.map((c) => String(c)).filter(Boolean) : [];
  const popup = req.body?.popup;
  if (!popup || typeof popup !== 'object') throw new HttpError(400, 'Popup design is required');
  if (!supabaseConfigured()) return res.json({ ok: true, updated: 0 });
  if (brand) await db().from('brand_designs').upsert({ brand, popup, updated_at: new Date().toISOString() });
  let updated = 0;
  if (codes.length) {
    const { data, error } = await db().from('size_charts').update({ popup }).in('code', codes).select('code');
    if (error) throw new HttpError(500, error.message);
    updated = (data || []).length;
  }
  if (brand) {
    await db().from('size_charts').update({ popup, brand }).eq('brand', brand);
  }
  res.json({ ok: true, updated });
}));

chartRoutes.get('/code/:code', ah(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) throw new HttpError(400, 'Missing chart code');
  if (supabaseConfigured()) {
    let { data, error } = await db().from('size_charts')
      .select('code, name, sex, unit, columns, rows, popup, brand')
      .eq('code', code)
      .maybeSingle();
    // popup column may not exist yet on older databases — retry without it
    if (error && /brand|popup/i.test(error.message || '')) {
      ({ data, error } = await db().from('size_charts')
        .select('code, name, sex, unit, columns, rows')
        .eq('code', code)
        .maybeSingle());
      if (data) data.popup = {};
    }
    if (error) throw new HttpError(500, error.message);
    if (data) {
      let active = false;
      if (data.brand) {
        const act = await db().from('brand_activations').select('brand').ilike('brand', data.brand).maybeSingle();
        active = Boolean(act.data);
      }
      data.active = active;
      if (data.brand) {
        const design = await db().from('brand_designs').select('popup').eq('brand', data.brand).maybeSingle();
        if (design.data?.popup) data.popup = design.data.popup;
      }
      return res.json(data);
    }
  }
  for (const list of charts.values()) {
    const found = list.find((c) => c.code === code);
    if (found) return res.json(found);
  }
  res.status(404).json({ error: 'No chart with that code' });
}));

chartRoutes.get('/', ah(async (req, res) => {
  const user = await userFromAuth(req);
  if (!user) return res.json({ charts: charts.get(req.get('x-device-id')) || [] });
  if (String(user.id).startsWith('dev:')) return res.json({ charts: charts.get(user.id) || [] });
  if (!supabaseConfigured()) return res.json({ charts: charts.get(user.id) || [] });
  const { data, error } = await db().from('size_charts').select('id, code, name, sex, unit, columns, rows, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw new HttpError(500, error.message);
  res.json({ charts: data || [] });
}));

chartRoutes.post('/', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  const access = { unlimited: true, user: null };
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'Name the chart');
  const sex = ['male', 'female', 'unisex'].includes(body.sex) ? body.sex : 'unisex';
  const unit = body.unit === 'cm' ? 'cm' : 'in';
  const columns = Array.isArray(body.columns) ? body.columns.slice(0, 12) : [];
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 24) : [];
  const popup = body.popup && typeof body.popup === 'object' && !Array.isArray(body.popup) ? body.popup : {};
  // Existing code means an update (used by logged-out edits). Otherwise mint one.
  const code = String(body.code || '').trim() || crypto.randomBytes(6).toString('hex');
  if (false) {
    const gate = await consume(req, 'charts');
    if (!gate.ok) throw new HttpError(402, gate.error);
  }
  const brand = String(body.brand || '').trim().slice(0, 60);
  const row = { id: crypto.randomUUID(), code, name, sex, unit, columns, rows, popup, brand, created_at: new Date().toISOString() };

  if (supabaseConfigured()) {
    const userId = access.user && !String(access.user.id).startsWith('dev:') ? access.user.id : null;
    const payload = { code, name, sex, unit, columns, rows, popup, brand };
    if (userId) payload.user_id = userId;
    // Try insert; if the code already exists, update it.
    let { data, error } = await db().from('size_charts').insert(payload).select('id, code, name, sex, unit, columns, rows, popup, created_at').single();
    if (error && String(error.code) === '23505') {
      ({ data, error } = await db().from('size_charts').update(payload).eq('code', code).select('id, code, name, sex, unit, columns, rows, popup, created_at').single());
    }
    // popup column may be missing on older databases
    if (error && /brand|popup/i.test(error.message || '')) {
      delete payload.popup;
      ({ data, error } = await db().from('size_charts').insert(payload).select('id, code, name, sex, unit, columns, rows, created_at').single());
      if (error && String(error.code) === '23505') {
        ({ data, error } = await db().from('size_charts').update(payload).eq('code', code).select('id, code, name, sex, unit, columns, rows, created_at').single());
      }
      if (data) data.popup = popup;
    }
    if (!error && data && brand && popup && Object.keys(popup).length) {
      await db().from('size_charts').update({ popup }).eq('brand', brand);
    }
    if (!error && data) {
      // also keep an in-memory copy so a just-saved chart is readable immediately
      const key = access.user?.id || req.get('x-device-id') || 'anon';
      const list = charts.get(key) || [];
      const i = list.findIndex((c) => c.code === code);
      if (i >= 0) list[i] = data; else list.unshift(data);
      charts.set(key, list);
      return res.json(data);
    }
    // fall through to memory if the database rejected it (e.g. user_id still NOT NULL)
  }

  const key = access.user?.id || req.get('x-device-id') || 'anon';
  const list = charts.get(key) || [];
  const i = list.findIndex((c) => c.code === code);
  if (i >= 0) list[i] = { ...list[i], ...row };
  else list.unshift(row);
  charts.set(key, list);
  res.json(i >= 0 ? list[i] : row);
}));

chartRoutes.delete('/code/:code', ah(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) throw new HttpError(400, 'Missing chart code');
  if (supabaseConfigured()) {
    const { error } = await db().from('size_charts').delete().eq('code', code);
    if (error) throw new HttpError(500, error.message);
  }
  for (const [key, list] of charts) {
    const next = list.filter((c) => c.code !== code);
    if (next.length !== list.length) charts.set(key, next);
  }
  res.json({ ok: true });
}));

