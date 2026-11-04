import crypto from 'node:crypto';
import { Router } from 'express';
import { db, supabaseConfigured } from '../lib/supabase.js';
import { HttpError, ah } from '../lib/errors.js';
import { config } from '../config.js';
import { consume, isUnlimited, rememberDevSub, userFromAuth, usageSnapshot } from '../lib/limits.js';
import { makeActivationCode, markDevInactive } from './auth.js';

const codes = new Map();
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

async function issueCode(email) {
  const code = makeActivationCode();
  codes.set(email, code);
  if (supabaseConfigured()) {
    const { error } = await db().from('activation_codes').insert({ code, email, used: false });
    if (error) throw new HttpError(500, error.message);
  }
  return code;
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

  const amount = Number(req.body?.amount) || 200;
  const reference = `fms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const origin = String(req.get('origin') || 'https://findmysize.onrender.com').replace(/\/$/, '');

  const response = await fetch(`${config.wavyApiBase}/api/gateway/v1/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      description: 'FindMySize Unlimited',
      email,
      payment_options: 'card',
      merchant_reference: reference,
      success_url: `${origin}/registered/?paid=1`,
      cancel_url: `${origin}/register/?cancel=1`,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status || 502, data.message || data.error || 'Wavy checkout failed');

  const url = data.authorization_url || data.checkout_url || data.url || data.data?.authorization_url;
  if (!url) throw new HttpError(502, 'Wavy did not return a checkout URL');
  res.json({ url, reference });
}));

payRoutes.post('/wavy', ah(async (req, res) => {
  const secret = config.wavyWebhookSecret;
  if (!secret) throw new HttpError(503, 'Wavy webhook secret is not configured');

  const signature = String(req.get('x-wavy-signature') || '');
  const givenSecret = String(req.get('x-webhook-secret') || req.body?.secret || '');
  const bodyRaw = JSON.stringify(req.body || {});
  let verified = false;
  if (signature && secret) {
    const expected = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex');
    verified = timingEqual(signature, expected) || timingEqual(signature, `sha256=${expected}`);
  }
  if (!verified && givenSecret) verified = timingEqual(givenSecret, secret);
  if (!verified) throw new HttpError(401, 'Invalid Wavy webhook signature');

  const body = req.body || {};
  const event = String(body.event || body.type || '').toLowerCase();
  if (event && !event.includes('success') && !event.includes('completed') && event !== 'payment.success') {
    return res.json({ ok: true, ignored: event });
  }

  const email = emailOf(
    body.email
    ?? body.customer_email
    ?? body.buyer_email
    ?? body.customer?.email
    ?? body.data?.email
    ?? body.data?.customer_email
    ?? body.metadata?.email
  );
  if (!email) throw new HttpError(400, 'Wavy webhook has no customer email');
  const code = await issueCode(email);
  res.json({ ok: true, email });
  console.log(`[wavy] activation code issued for ${email}: ${code}`);
}));

payRoutes.post('/dev-claim', ah(async (req, res) => {
  if (process.env.NODE_ENV === 'production') throw new HttpError(404, 'Not found');
  const email = emailOf(req.body?.email);
  if (!email) throw new HttpError(400, 'Email is required');
  codes.set(email, 'DEVCODE');
  res.json({ code: 'DEVCODE' });
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

chartRoutes.get('/code/:code', ah(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) throw new HttpError(400, 'Missing chart code');
  if (supabaseConfigured()) {
    let { data, error } = await db().from('size_charts')
      .select('code, name, sex, unit, columns, rows, popup')
      .eq('code', code)
      .maybeSingle();
    // popup column may not exist yet on older databases — retry without it
    if (error && /popup/i.test(error.message || '')) {
      ({ data, error } = await db().from('size_charts')
        .select('code, name, sex, unit, columns, rows')
        .eq('code', code)
        .maybeSingle());
      if (data) data.popup = {};
    }
    if (error) throw new HttpError(500, error.message);
    if (data) return res.json(data);
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
  const access = await isUnlimited(req);
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
  if (!access.unlimited && !body.code) {
    const gate = await consume(req, 'charts');
    if (!gate.ok) throw new HttpError(402, gate.error);
  }
  const row = { id: crypto.randomUUID(), code, name, sex, unit, columns, rows, popup, created_at: new Date().toISOString() };

  if (supabaseConfigured()) {
    const userId = access.user && !String(access.user.id).startsWith('dev:') ? access.user.id : null;
    const payload = { code, name, sex, unit, columns, rows, popup };
    if (userId) payload.user_id = userId;
    // Try insert; if the code already exists, update it.
    let { data, error } = await db().from('size_charts').insert(payload).select('id, code, name, sex, unit, columns, rows, popup, created_at').single();
    if (error && String(error.code) === '23505') {
      ({ data, error } = await db().from('size_charts').update(payload).eq('code', code).select('id, code, name, sex, unit, columns, rows, popup, created_at').single());
    }
    // popup column may be missing on older databases
    if (error && /popup/i.test(error.message || '')) {
      delete payload.popup;
      ({ data, error } = await db().from('size_charts').insert(payload).select('id, code, name, sex, unit, columns, rows, created_at').single());
      if (error && String(error.code) === '23505') {
        ({ data, error } = await db().from('size_charts').update(payload).eq('code', code).select('id, code, name, sex, unit, columns, rows, created_at').single());
      }
      if (data) data.popup = popup;
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

