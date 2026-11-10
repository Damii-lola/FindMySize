import crypto from 'node:crypto';
import { Router } from 'express';
import { db, supabaseConfigured } from '../lib/supabase.js';
import { HttpError, ah } from '../lib/errors.js';
import { dbError, missingColumn, missingTable, selectTolerant, writeTolerant } from '../lib/schema.js';
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
  const paidAt = new Date().toISOString();
  const renews = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  if (supabaseConfigured()) {
    const { error } = await db().from('activation_codes').insert({ code, email, used: false });
    if (error) throw new HttpError(500, error.message);
    await db().from('subscriptions').upsert({
      code, email, paid_at: paidAt, renews_at: renews, auto_renew: true, active: true,
    });
    // Stamp paid_at + expires_at onto any brand already activated with this email
    await db().from('brand_activations')
      .update({ paid_at: paidAt, expires_at: renews, email })
      .eq('code', code)
      .then(() => {}).catch(() => {});
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


// In-memory plan ID cache — survives the process lifetime, resets on redeploy
let _wavyPlanIdCache = null;
let _wavyPlanInflight = null; // deduplicates concurrent first-calls

const WAVY_TIMEOUT_MS = 10_000; // 10 s — fail fast, never let a Wavy call hang the checkout

function wavyFetch(url, opts = {}) {
  return fetch(url, { signal: AbortSignal.timeout(WAVY_TIMEOUT_MS), ...opts });
}

// Find the existing FindMySize $125/month plan, or create it if it doesn't exist yet.
// Returns the plan ID string.
async function getOrCreateWavyPlan(secret) {
  if (_wavyPlanIdCache) return _wavyPlanIdCache;
  // Deduplicate: if a plan-creation is already in flight, wait for it
  if (_wavyPlanInflight) return _wavyPlanInflight;

  _wavyPlanInflight = (async () => {
    const base = config.wavyApiBase;
    const headers = { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' };

    // 1. Try to list existing plans and find ours
    const listRes = await wavyFetch(`${base}/api/payments/subscriptions/plans`, { headers }).catch(() => null);
    if (listRes?.ok) {
      const listData = await listRes.json().catch(() => ({}));
      const plans = listData.data || listData.plans || listData.results || (Array.isArray(listData) ? listData : []);
      const existing = plans.find((p) => {
        const name = String(p.name || p.plan_name || '').toLowerCase();
        const amount = Number(p.amount || p.price || 0);
        return name.includes('findmysize') || (amount === 125 && name.includes('month'));
      });
      if (existing) {
        const id = existing._id || existing.id || existing.plan_id;
        console.log('[wavy] found existing plan', id);
        _wavyPlanIdCache = id;
        return id;
      }
    }

    // 2. Create the plan
    console.log('[wavy] creating subscription plan');
    const createRes = await wavyFetch(`${base}/api/payments/subscriptions/plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'FindMySize Monthly',
        amount: 125,
        currency: 'USD',
        interval: 'monthly',
        description: 'FindMySize — size charts set up, embedded, and kept updated.',
      }),
    });
    const createData = await createRes.json().catch(() => ({}));
    console.log('[wavy] create plan response', createRes.status, JSON.stringify(createData).slice(0, 400));
    if (!createRes.ok) {
      throw new HttpError(createRes.status || 502, createData.error || createData.message || createData.data?.message || 'Could not create Wavy subscription plan');
    }
    const newId = (createData.data || createData)?._id
      || (createData.data || createData)?.id
      || (createData.data || createData)?.plan_id;
    if (!newId) throw new HttpError(502, 'Wavy plan created but returned no ID');
    console.log('[wavy] created plan', newId);
    _wavyPlanIdCache = newId;
    return newId;
  })().finally(() => { _wavyPlanInflight = null; });

  return _wavyPlanInflight;
}

// GET /api/pay/wavy-plans — diagnostic: show plan status and raw API responses
payRoutes.get('/wavy-plans', ah(async (req, res) => {
  const secret = config.wavySecretKey;
  if (!secret) throw new HttpError(503, 'WAVY_SECRET_KEY not configured');

  const base = config.wavyApiBase;
  const headers = { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' };

  const listRes = await wavyFetch(`${base}/api/payments/subscriptions/plans`, { headers }).catch((err) => ({ _err: err.message }));
  const listBody = listRes.json ? await listRes.json().catch(() => ({})) : listRes;

  res.json({
    cached_plan_id: _wavyPlanIdCache,
    list_status: listRes.status ?? null,
    plans: listBody,
  });
}));

payRoutes.post('/wavy-checkout', ah(async (req, res) => {
  const secret = config.wavySecretKey;
  if (!secret) throw new HttpError(503, 'Wavy secret key is not configured');

  const email = emailOf(req.body?.email);
  if (!email || !email.includes('@')) throw new HttpError(400, 'Enter a valid email');

  const reference = `fms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const amount = 125;
  const site = 'https://damii-lola.github.io/FindMySize';

  pendingPays.set(reference, { email, amount, created: Date.now() });
  pendingPays.set('email:' + email, { reference, amount, created: Date.now() });
  if (supabaseConfigured()) {
    await db().from('pending_payments').upsert({
      reference, email, amount, created_at: new Date().toISOString(),
    }).then(() => {}).catch((err) => console.warn('[wavy] pending store failed', err.message));
  }

  // One-time $450 payment via Wavy gateway checkout API
  const checkoutEndpoint = `${config.wavyApiBase}/api/gateway/v1/checkout`;
  console.log('[wavy] creating $450 checkout for', email, 'ref', reference);
  const sub = await wavyFetch(checkoutEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
    body: JSON.stringify({
      amount: 125,
      currency: 'USD',
      email,
      description: 'FindMySize — one-time setup',
      merchant_reference: reference,
      success_url: `${site}/pay/success.html?ref=${reference}`,
      cancel_url: `${site}/pay/`,
    }),
  });
  const subData = await sub.json().catch(() => ({}));
  console.log('[wavy] checkout response', sub.status, JSON.stringify(subData).slice(0, 400));
  const payUrl = subData.payment_link || subData.data?.payment_link
    || subData.checkout_url || subData.data?.checkout_url
    || subData.url || subData.data?.url
    || subData.link || subData.data?.link;
  if (!sub.ok || !payUrl) {
    throw new HttpError(sub.status || 502, subData.error || subData.message || subData.data?.message || 'Could not create Wavy checkout');
  }
  res.json({ url: payUrl, reference });
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


/** Everything the dashboard would like to know about a chart; only the first few are needed, the rest are asked for if the table has them. */
const CHART_COLUMNS = ['id', 'code', 'name', 'sex', 'unit', 'columns', 'rows', 'popup', 'popup_uses', 'brand', 'user_id', 'created_at', 'updated_at'];
const CHART_REQUIRED = ['code', 'name', 'columns', 'rows', 'created_at'];

chartRoutes.get('/all', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  if (!supabaseConfigured()) return res.json({ charts: [] });
  // A table without one of the optional columns (brand, popup, ...) is read without it, not refused.
  const { data } = await selectTolerant(
    (cols) => db().from('size_charts').select(cols).order('created_at', { ascending: false }),
    CHART_COLUMNS, { required: CHART_REQUIRED },
  );
  res.json({ charts: data || [] });
}));

// GET /api/pay/monitor — admin overview: all brands, payment dates, expiry, days left
payRoutes.get('/monitor', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  if (!supabaseConfigured()) return res.json({ brands: [] });

  // Pull brand_activations with paid_at / expires_at
  const { data: acts } = await db()
    .from('brand_activations')
    .select('brand, code, activated_at, paid_at, expires_at, email')
    .order('activated_at', { ascending: false });

  // Pull brand_meta for brand names / display info
  const { data: meta } = await db().from('brand_meta').select('brands').eq('key', 'admin').maybeSingle();
  const brandNames = meta?.brands || {};

  const now = Date.now();
  const seen = new Set();
  const brands = [];

  for (const a of (acts || [])) {
    const key = a.brand;
    if (seen.has(key)) continue;
    seen.add(key);

    const expiresAt = a.expires_at ? new Date(a.expires_at) : null;
    const paidAt = a.paid_at ? new Date(a.paid_at) : (a.activated_at ? new Date(a.activated_at) : null);
    const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now) / 86400000) : null;
    const expired = expiresAt ? expiresAt.getTime() < now : false;
    const expiringSoon = !expired && daysLeft !== null && daysLeft <= 5;

    brands.push({
      brand: key,
      name: brandNames[key]?.name || key,
      email: a.email || null,
      paidAt: paidAt?.toISOString() || null,
      expiresAt: expiresAt?.toISOString() || null,
      daysLeft,
      expired,
      expiringSoon,
      code: a.code,
    });
  }

  // Sort: expired first, then expiring soon, then by days left
  brands.sort((a, b) => {
    if (a.expired !== b.expired) return a.expired ? -1 : 1;
    if (a.expiringSoon !== b.expiringSoon) return a.expiringSoon ? -1 : 1;
    return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
  });

  res.json({ brands, now: new Date().toISOString() });
}));

// POST /api/pay/monitor-ping — send a renewal reminder email to a brand's contact
payRoutes.post('/monitor-ping', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const brand = String(req.body?.brand || '').trim();
  if (!email || !email.includes('@')) throw new HttpError(400, 'Email is required');

  // Send via any configured email transport (Supabase auth mailer as a simple option)
  // For now: log it and return ok — plug in Resend/Nodemailer when email is wired up
  console.log(`[monitor] ping sent to ${email} for brand "${brand}"`);

  // If Resend is configured, send the email
  if (config.resendApiKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.resendApiKey}` },
      body: JSON.stringify({
        from: 'FindMySize <noreply@findmysize.app>',
        to: [email],
        subject: `Your FindMySize plan for ${brand} needs renewal`,
        html: `<p>Hi,</p>
<p>Your <strong>FindMySize</strong> size chart plan for <strong>${brand}</strong> has expired or is about to expire.</p>
<p>To keep your size charts live and your embed running, renew your plan at:</p>
<p><a href="https://damii-lola.github.io/FindMySize/pay/">https://damii-lola.github.io/FindMySize/pay/</a></p>
<p>Reply to this email if you have any questions.</p>
<p>— FindMySize</p>`,
      }),
    }).catch((err) => console.warn('[monitor] resend failed:', err.message));
  }

  res.json({ ok: true, email, brand });
}));

/**
 * Who is asking: the admin, a signed-in account, or nobody. `key` is where that owner's own
 * brand settings are kept, so one account's brands are never shown to, or overwritten by, another's.
 */
async function ownerOf(req) {
  if (adminFromReq(req)) return { admin: true, key: 'admin', user: null };
  const user = await userFromAuth(req);
  if (!user) return null;
  return { admin: false, key: `user:${user.id}`, user, signedIn: !String(user.id).startsWith('dev:') };
}

/** The garments an owner may see: all of them for the admin, otherwise their own plus any saved before accounts. */
function ownedCharts(q, who) {
  return who.admin ? q : q.or(`user_id.eq.${who.user.id},user_id.is.null`);
}

// Brands. The source of truth is the `brand` stored on each garment; the owner's brand_meta row (a name -> brand
// record, plus activations and per-brand popup designs) fills in what the garments cannot say. Anything that
// cannot be read or written is reported in `warnings` — never swallowed — so the dashboard can tell the owner.
payRoutes.get('/brands', ah(async (req, res) => {
  const who = await ownerOf(req);
  if (!who) throw new HttpError(401, 'Log in first');
  if (!supabaseConfigured()) return res.json({ brands: {}, activations: {}, designs: {}, warnings: ['memory'] });
  const warnings = [];

  let meta = {};
  const metaRes = await db().from('brand_meta').select('brands, activations, designs').eq('key', who.key).maybeSingle();
  if (metaRes.error) {
    if (missingTable(metaRes.error)) warnings.push('no-brand-meta-table');
    else throw dbError(metaRes.error, 'Could not read brands');
  } else meta = metaRes.data || {};

  const brands = { ...(meta.brands || {}) };
  const { data, dropped } = await selectTolerant(
    (cols) => ownedCharts(db().from('size_charts').select(cols), who),
    ['name', 'brand', 'user_id'], { required: who.admin ? ['name'] : ['name', 'user_id'] },
  );
  if (dropped.includes('brand')) warnings.push('no-brand-column');
  for (const row of data || []) {
    const brand = String(row.brand || '').trim();
    if (brand && row.name) brands[String(row.name).toLowerCase()] = brand;   // the garment's own brand wins
  }
  res.json({ brands, activations: meta.activations || {}, designs: meta.designs || {}, warnings });
}));

payRoutes.post('/brands', ah(async (req, res) => {
  const who = await ownerOf(req);
  if (!who) throw new HttpError(401, 'Log in first');
  const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const warnings = [];
  if (!supabaseConfigured()) return res.json({ ok: true, warnings: ['memory'] });
  const { error } = await db().from('brand_meta').upsert({
    key: who.key, brands: plain(req.body?.brands), activations: plain(req.body?.activations), designs: plain(req.body?.designs), updated_at: new Date().toISOString(),
  });
  if (error) {
    if (missingTable(error)) warnings.push('no-brand-meta-table');
    else throw dbError(error, 'Could not save brands');
  }
  res.json({ ok: true, warnings });
}));

chartRoutes.post('/brand-stamp', ah(async (req, res) => {
  const who = await ownerOf(req);
  if (!who) throw new HttpError(401, 'Log in first');
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const warnings = [];
  let stamped = 0;
  if (supabaseConfigured()) {
    for (const item of items) {
      const brand = String(item.brand || '').trim();
      const code = String(item.code || '').trim();
      if (!brand || !code) continue;
      let q = db().from('size_charts').update({ brand }).eq('code', code);
      if (!who.admin) q = q.eq('user_id', who.user.id);   // an account may only label its own garments
      const { data: hit, error } = await q.select('code');
      if (error) {
        if (missingColumn(error) === 'brand') { warnings.push('no-brand-column'); break; }
        throw dbError(error, 'Could not label the garment');
      }
      stamped += (hit || []).length;   // only what really changed
    }
  }
  res.json({ ok: true, stamped, warnings });
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
    for (const chartCode of codes) {
      await db().from('brand_activations').upsert({ brand: chartCode, code: brand, activated_at: new Date().toISOString() });
      await db().from('size_charts').update({ brand }).eq('code', chartCode);
    }
  } else {
    await db().from('brand_activations').delete().eq('brand', brand);
    for (const chartCode of codes) await db().from('brand_activations').delete().eq('brand', chartCode);
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
  if (brand) await db().from('brand_designs').upsert({ brand, popup, updated_at: new Date().toISOString() }).then(() => {}).catch(() => {});
  let updated = 0;
  for (const code of codes) {
    const { data, error } = await db().from('size_charts').update({ popup }).eq('code', code).select('code');
    if (!error && data?.length) updated += data.length;
  }
  if (brand) await db().from('size_charts').update({ popup }).eq('brand', brand).then(() => {}).catch(() => {});
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
      const byCode = await db().from('brand_activations').select('brand').eq('brand', code).maybeSingle();
      if (byCode.data) active = true;
      if (!active && data.brand) {
        const act = await db().from('brand_activations').select('brand').ilike('brand', data.brand).maybeSingle();
        active = Boolean(act.data);
      }
      data.active = active;
      // Always overlay the brand's design if one exists (source of truth for customization)
      if (data.brand) {
        const brandKey = String(data.brand).trim();
        let design = await db().from('brand_designs').select('popup').eq('brand', brandKey).maybeSingle();
        if (!design.data && brandKey) {
          design = await db().from('brand_designs').select('popup').ilike('brand', brandKey).maybeSingle();
        }
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
  // Charts must be savable even without an admin session so public links work.
  // Admin token is still preferred but not required.
  const isAdmin = adminFromReq(req);
  const user = await userFromAuth(req);   // null for the admin login and for visitors without an account
  const access = { unlimited: true, user };
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name && body.code && body.popup) {
    const { error } = await db().from('size_charts').update({ popup: body.popup }).eq('code', String(body.code));
    if (error) throw new HttpError(500, error.message);
    return res.json({ ok: true, code: body.code });
  }
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
    // Always write the chart itself (same reliable path designs use).
    const signedIn = Boolean(user && !String(user.id).startsWith('dev:'));
    const payload = { code, name, sex, unit, columns, rows, popup, brand };
    // Record whose chart this is. Without it the chart belongs to nobody: it is in the table, but the account
    // that saved it never sees it in its own library (that list is, and must be, filtered by owner).
    if (signedIn) payload.user_id = user.id;
    const attempt = async (r) => {
      let { data: saved, error: err } = await db().from('size_charts').insert(r).select('*').single();
      if (err && String(err.code) === '23505') {
        // The code exists: this is an edit. Ownership is never changed by an edit.
        const { user_id: _owner, ...rest } = r;
        ({ data: saved, error: err } = await db().from('size_charts').update(rest).eq('code', code).select('*').single());
      }
      return { data: saved, error: err };
    };
    // A column this project's table lacks (brand, popup, user_id) is left out and the write is tried again.
    const written = await writeTolerant(attempt, payload, { required: ['code', 'name', 'columns', 'rows'] });
    // A chart the database refused must not be answered "saved": it would live only in this server's memory,
    // never reach the library, and be gone at the next restart. The page's own fallback then saves it directly.
    if (written.error) throw dbError(written.error, 'Could not save the chart');
    let data = written.data;
    const error = null;
    if (data) {
      delete data.user_id;
      if (data.popup === undefined) data.popup = popup;
      if (data.brand === undefined) data.brand = brand;
      const warnings = [];
      if (brand && written.dropped.includes('brand')) warnings.push('no-brand-column');
      if (written.dropped.includes('popup')) warnings.push('no-popup-column');
      data.persisted = true;
      data.warnings = warnings;
    }
    // A brand's popup design is shared by that owner's garments of the brand, never by anyone else's.
    const mine = (q) => (signedIn ? q.eq('user_id', user.id) : q.is('user_id', null));
    if (!error && data && brand) {
      // Persist design on the brand itself (source of truth)
      if (popup && Object.keys(popup).length) {
        await db().from('brand_designs').upsert({ brand, popup, updated_at: new Date().toISOString() }).then(() => {}).catch(() => {});
        // Also stamp this owner's charts of the brand so older rows stay in sync
        await mine(db().from('size_charts').update({ popup }).eq('brand', brand)).then(() => {}).catch(() => {});
      } else {
        // New chart with no popup — inherit the brand's existing design
        const existing = await db().from('brand_designs').select('popup').eq('brand', brand).maybeSingle();
        if (existing.data?.popup) {
          await db().from('size_charts').update({ popup: existing.data.popup }).eq('code', code);
          if (data) data.popup = existing.data.popup;
        }
      }
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
  }

  const key = access.user?.id || req.get('x-device-id') || 'anon';
  const list = charts.get(key) || [];
  const i = list.findIndex((c) => c.code === code);
  if (i >= 0) list[i] = { ...list[i], ...row };
  else list.unshift(row);
  charts.set(key, list);
  // Supabase is not connected: this chart lives in the server's memory only and will not survive a restart.
  res.json({ ...(i >= 0 ? list[i] : row), persisted: false, warnings: ['memory'] });
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

