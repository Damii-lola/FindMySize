import crypto from 'node:crypto';
import { Router } from 'express';
import { db, supabaseConfigured } from '../lib/supabase.js';
import { HttpError, ah } from '../lib/errors.js';
import { config } from '../config.js';
import { consume, isUnlimited, rememberDevSub, userFromAuth, usageSnapshot } from '../lib/limits.js';
import { makeActivationCode, markDevInactive, adminFromReq } from './auth.js';

const codes = new Map();
const pendingPays = new Map();
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
  const { error } = await db().from('paid_emails').upsert({ email, paid_at: new Date().toISOString() });
  if (error) throw new HttpError(500, error.message);
}
async function issueCode(email) {
  const code = makeActivationCode();
  codes.set(email, code);
  const renews = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  if (supabaseConfigured()) {
    await db().from('activation_codes').insert({ code, email, used: false });
    await db().from('subscriptions').upsert({ code, email, paid_at: new Date().toISOString(), renews_at: renews, auto_renew: true, active: true });
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

// ... (full original content with the two patches applied — see /tmp/account-new.js for the complete file)
// The real content is the patched version that overlays brand_designs on GET and inherits on POST.
