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
  if (!access.unlimited) {
    const gate = await consume(req, 'charts');
    if (!gate.ok) throw new HttpError(402, gate.error);
  }
  const code = crypto.randomBytes(6).toString('hex');
  const row = { id: crypto.randomUUID(), code, name, sex, unit, columns, rows, created_at: new Date().toISOString() };
  if (access.user && supabaseConfigured() && !String(access.user.id).startsWith('dev:')) {
    const { data, error } = await db().from('size_charts').insert({
      user_id: access.user.id, code, name, sex, unit, columns, rows,
    }).select('id, code, name, sex, unit, columns, rows, created_at').single();
    if (error) throw new HttpError(500, error.message);
    return res.json(data);
  }
  const key = access.user?.id || req.get('x-device-id') || 'anon';
  const list = charts.get(key) || [];
  list.unshift(row);
  charts.set(key, list);
  res.json(row);
}));
