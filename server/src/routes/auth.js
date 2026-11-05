import crypto from 'node:crypto';
import { Router } from 'express';
import { db, supabaseConfigured } from '../lib/supabase.js';
import { HttpError, ah } from '../lib/errors.js';
import { config } from '../config.js';
import { isActive, subscriptionOf, rememberDevSub } from '../lib/limits.js';

const pending = new Map();

const emailOf = (v) => String(v || '').trim().toLowerCase();

async function savePending(email, password) {
  pending.set(email, { password, at: Date.now() });
  if (!supabaseConfigured()) return;
  const { error } = await db().from('pending_signups').upsert({
    email, password, created_at: new Date().toISOString(),
  });
  if (error) console.warn('[auth] pending signup not stored:', error.message);
}

async function takePending(email) {
  const mem = pending.get(email);
  if (mem?.password) pending.delete(email);
  if (!supabaseConfigured()) return mem?.password || null;
  const { data } = await db().from('pending_signups').select('password').eq('email', email).maybeSingle();
  if (data?.password) {
    await db().from('pending_signups').delete().eq('email', email);
    return data.password;
  }
  return mem?.password || null;
}

export const authRoutes = Router();

authRoutes.post('/signup', ah(async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = String(req.body?.password || '');
  const confirm = String(req.body?.confirm || '');
  if (!email.includes('@') || email.length > 200) throw new HttpError(400, 'Enter a real email');
  if (password.length < 6 || password.length > 200) throw new HttpError(400, 'Password must be at least 6 characters');
  if (password !== confirm) throw new HttpError(400, 'Passwords do not match');

  if (!supabaseConfigured()) {
    pending.set(email, { password, otp: '000000', at: Date.now() });
    return res.json({ ok: true, devOtp: '000000' });
  }

  await savePending(email, password);
  const { error } = await db().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new HttpError(400, error.message);
  res.json({ ok: true });
}));

authRoutes.post('/verify', ah(async (req, res) => {
  const email = emailOf(req.body?.email);
  const otp = String(req.body?.otp || '').trim();
  if (!otp) throw new HttpError(400, 'Enter the code from your email');

  if (!supabaseConfigured()) {
    const row = pending.get(email);
    if (!row || row.otp !== otp) throw new HttpError(400, 'That code is wrong');
    pending.set(`user:${email}`, { password: row.password, activated: false });
    return res.json({ ok: true });
  }

  const { data, error } = await db().auth.verifyOtp({ email, token: otp, type: 'email' });
  if (error) throw new HttpError(400, error.message);
  const password = await takePending(email);
  if (password && data?.user?.id) {
    const upd = await db().auth.admin.updateUserById(data.user.id, { password, email_confirm: true });
    if (upd.error) throw new HttpError(400, upd.error.message);
  }
  res.json({ ok: true });
}));

authRoutes.post('/login', ah(async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Enter your email and password');

  if (!supabaseConfigured()) {
    const row = pending.get(`user:${email}`);
    if (!row || row.password !== password) throw new HttpError(401, 'Email or password is wrong');
    pending.set(`login-otp:${email}`, '000000');
    return res.json({ ok: true, needsCode: !row.activated, devOtp: '000000' });
  }

  const signed = await db().auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data?.user) throw new HttpError(401, 'Email or password is wrong');
  const sub = await subscriptionOf(signed.data.user.id);
  const sent = await db().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (sent.error) throw new HttpError(400, sent.error.message);
  res.json({ ok: true, needsCode: !isActive(sub) });
}));

authRoutes.post('/login/finish', ah(async (req, res) => {
  const email = emailOf(req.body?.email);
  const otp = String(req.body?.otp || '').trim();
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!otp) throw new HttpError(400, 'Enter the code from your email');

  if (!supabaseConfigured()) {
    if (pending.get(`login-otp:${email}`) !== otp) throw new HttpError(400, 'That email code is wrong');
    const row = pending.get(`user:${email}`);
    if (!row) throw new HttpError(401, 'Log in again');
    if (!row.activated) {
      if (code !== 'DEVCODE') throw new HttpError(400, 'Activation code is wrong');
      row.activated = true;
      rememberDevSub(`dev:${email}`, { status: 'active', paid_until: new Date(Date.now() + 30 * 864e5).toISOString() });
    }
    return res.json({ ok: true, access_token: `dev-${email}`, email });
  }

  const { data, error } = await db().auth.verifyOtp({ email, token: otp, type: 'email' });
  if (error || !data?.user) throw new HttpError(400, error?.message || 'That email code is wrong');

  let sub = await subscriptionOf(data.user.id);
  if (!isActive(sub)) {
    const paid = await db().from('paid_emails').select('email').eq('email', email).maybeSingle();
    if (paid.error) throw new HttpError(500, paid.error.message);
    if (!paid.data) throw new HttpError(400, 'This email has not been paid for yet');
    const paidUntil = new Date();
    paidUntil.setMonth(paidUntil.getMonth() + 1);
    const up = await db().from('subscriptions').upsert({
      user_id: data.user.id,
      plan: 'unlimited',
      status: 'active',
      paid_until: paidUntil.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (up.error) throw new HttpError(500, up.error.message);
    await db().from('paid_emails').delete().eq('email', email);
  }

  res.json({
    ok: true,
    access_token: data.session?.access_token || null,
    refresh_token: data.session?.refresh_token || null,
    email: data.user.email,
  });
}));

export function markDevInactive(email) {
  const row = pending.get(`user:${emailOf(email)}`);
  if (row) row.activated = false;
}

export function makeActivationCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function adminToken(username) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ u: username, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.adminTokenSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function adminFromReq(req) {
  const header = String(req.get('authorization') || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', config.adminTokenSecret).update(body).digest('base64url');
  if (!timingSafe(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!data?.u || !data?.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function timingSafe(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

const adminOtps = new Map();

async function sendAdminOtp(email, code) {
  const user = config.gmail.user;
  const pass = config.gmail.pass;
  if (!user || !pass) throw new HttpError(503, 'Email is not configured');
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: `FindMySize <${user}>`,
    to: email,
    subject: 'Your FindMySize login code',
    text: `Your login code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your login code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}

authRoutes.post('/admin-login', ah(async (req, res) => {
  const email = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const otp = String(req.body?.otp || '').trim();
  if (!config.adminEmail || !config.adminPassword) throw new HttpError(503, 'Admin login is not configured');
  if (email !== config.adminEmail || password !== config.adminPassword) {
    throw new HttpError(401, 'Wrong email or password');
  }

  if (!otp) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    adminOtps.set(email, { code, exp: Date.now() + 10 * 60 * 1000 });
    await sendAdminOtp(email, code);
    return res.json({ ok: true, needsOtp: true });
  }

  const row = adminOtps.get(email);
  if (!row || row.exp < Date.now() || row.code !== otp) throw new HttpError(400, 'That code is wrong or expired');
  adminOtps.delete(email);
  res.json({ ok: true, token: adminToken(email), email });
}));

authRoutes.get('/admin-me', ah(async (req, res) => {
  const admin = adminFromReq(req);
  if (!admin) throw new HttpError(401, 'Not logged in');
  res.json({ ok: true, username: admin.u });
}));
