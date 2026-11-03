import { db, supabaseConfigured } from './supabase.js';

const mem = new Map();
const CAPS = { scans: 3, charts: 1, popups: 5 };

export function deviceId(req) {
  const id = String(req.get('x-device-id') || '').trim().slice(0, 80);
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : `ip:${req.ip || 'unknown'}`;
}

export async function userFromAuth(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  if (token.startsWith('dev-')) {
    const email = token.slice(4);
    return { id: `dev:${email}`, email };
  }
  if (!supabaseConfigured()) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function subscriptionOf(userId) {
  if (String(userId).startsWith('dev:')) return mem.get(`sub:${userId}`) || null;
  if (!supabaseConfigured()) return null;
  const { data } = await db().from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  return data;
}

export function isActive(sub) {
  if (!sub || sub.status !== 'active') return false;
  if (sub.paid_until && new Date(sub.paid_until).getTime() < Date.now()) return false;
  return true;
}

export async function isUnlimited(req) {
  const user = await userFromAuth(req);
  if (!user) return { unlimited: false, user: null };
  const sub = await subscriptionOf(user.id);
  return { unlimited: isActive(sub), user, sub };
}

async function readUsage(id) {
  if (!supabaseConfigured()) return mem.get(`devuse:${id}`) || { scans: 0, charts: 0, popups: 0 };
  const { data, error } = await db().from('device_usage').select('scans,charts,popups').eq('device_id', id).maybeSingle();
  if (error) return mem.get(`devuse:${id}`) || { scans: 0, charts: 0, popups: 0 };
  return data || { scans: 0, charts: 0, popups: 0 };
}

async function writeUsage(id, row) {
  mem.set(`devuse:${id}`, row);
  if (!supabaseConfigured()) return;
  const { error } = await db().from('device_usage').upsert({
    device_id: id,
    scans: row.scans,
    charts: row.charts,
    popups: row.popups,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('[limits] usage write failed:', error.message);
}

const MESSAGES = {
  scans: 'You have used your 3 free scans on this device. Activate an account to continue.',
  charts: 'This device can keep one free size chart. Activate an account for more.',
  popups: 'This free chart has been used 5 times and is now off. Activate an account to turn it back on.',
};

export async function consume(req, kind) {
  const access = await isUnlimited(req);
  if (access.unlimited) return { ok: true, unlimited: true };
  const id = deviceId(req);
  const row = await readUsage(id);
  const cap = CAPS[kind];
  const used = Number(row[kind] || 0);
  if (used >= cap) return { ok: false, error: MESSAGES[kind], used, cap };
  const next = { scans: Number(row.scans || 0), charts: Number(row.charts || 0), popups: Number(row.popups || 0) };
  next[kind] = used + 1;
  await writeUsage(id, next);
  return { ok: true, used: next[kind], cap };
}

/** Remaining free uses for this device. Unlimited accounts report nulls. */
export async function usageSnapshot(req) {
  const access = await isUnlimited(req);
  if (access.unlimited) return { unlimited: true, scans: null, charts: null, popups: null, caps: CAPS };
  const row = await readUsage(deviceId(req));
  const used = {
    scans: Number(row.scans || 0),
    charts: Number(row.charts || 0),
    popups: Number(row.popups || 0),
  };
  return {
    unlimited: false,
    used,
    left: {
      scans: Math.max(0, CAPS.scans - used.scans),
      charts: Math.max(0, CAPS.charts - used.charts),
      popups: Math.max(0, CAPS.popups - used.popups),
    },
    caps: CAPS,
  };
}

export const consumeScan = (req) => consume(req, 'scans');

export function rememberDevSub(userId, sub) {
  mem.set(`sub:${userId}`, sub);
}

export function devUsage() {
  return mem;
}
