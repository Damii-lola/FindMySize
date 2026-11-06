/**
 * Size charts: what a store keeps, and what a shopper's link reads.
 *
 * One table, two sides of it:
 *
 *   - the store's own rows (list / save / remove) go straight to the table, and
 *     RLS keeps them to their owner — `auth.uid() = user_id` and nothing else;
 *   - the shopper's side goes through `chart_by_code()`, a SECURITY DEFINER
 *     function that returns one row by its code and no listing. A shopper has no
 *     account here, so the code in the link is the only thing that opens a chart
 *     — which is also why the code is random rather than an id anyone could count
 *     up from.
 *
 * The numbers are stored exactly as they were typed, in the unit they were typed
 * in, and the sizing engine converts. A chart also carries the columns it was
 * typed under — the store's own names, and which body measurement each one
 * stands for — so that a chart with a shoulder column is scored on the shoulder,
 * and a chart with a body-length column shows that length without pretending it
 * can be read off a body. This file does not do arithmetic on any of it: it moves
 * rows.
 */
import { supabaseClient } from './auth.js';

// Local fallback when not signed in (testing).
const LOCAL_KEY = "fms_charts_local";
function localList() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}

async function hasSession() {
  try {
    const { getSession } = await import('./auth.js');
    const s = await getSession();
    return !!s;
  } catch { return false; }
}

function hasAdminToken() {
  try { return Boolean(localStorage.getItem('fms-admin')); } catch { return false; }
}

function localSave(charts) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(charts));
}

/** Remove charts cached in this browser. Use on sign-in/sign-out to avoid cross-account leaks. */
export function clearLocalCharts() {
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
}

import { api } from './api.js';

/**
 * A link code: 12 characters, lowercase, from an alphabet with no `l` and no
 * `0`/`1`, because a code that gets read out over a phone or copied off a screen
 * should not have two characters that look alike. 31^12 is far past guessable.
 */
const CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

export function newCode(length = 12) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** True when the column a JSON row carries is a real number. */
const num = (v) => Number.isFinite(Number(v)) && String(v).trim() !== '';

/**
 * The columns a saved chart is scored on: the ones this app can measure, carried
 * by every row. Decided the same way the server decides it — the first such
 * column picks the size and the rest join the same comparison — so the
 * dashboard's "scored on…" line cannot disagree with the score.
 */
export function chartColumns(chart) {
  const rows = Array.isArray(chart?.rows) ? chart.rows : [];
  const cols = Array.isArray(chart?.columns) ? chart.columns : [];
  return cols
    .filter((c) => c && typeof c.label === 'string' && c.measure)
    .filter((c) => rows.every((r) => num(r?.[c.id])));
}

/* ---------- the store's side ---------- */

/**
 * The table or function this needs is not in the project yet. Supabase answers a
 * missing table with 42P01 (Postgres) or PGRST205 (its own schema cache), and a
 * missing function with 42883 / PGRST202 — all of which mean the same thing to
 * whoever is looking at the screen: run the SQL from the README, then reload.
 */
export function notSetUp(error) {
  const code = String(error?.code || '');
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true;
  return /does not exist|schema cache|not find the (table|function)/i.test(String(error?.message || ''));
}

/** The charts this account owns, newest first. Signed in = server (syncs across devices). */
export async function listCharts() {
  if (hasAdminToken()) {
    try {
      const result = await api('/api/charts/all');
      if (result && Array.isArray(result.charts)) return result.charts;
    } catch { /* fall through */ }
  }
  if (await hasSession()) {
    // Primary source of truth: server API (scoped by user_id). This keeps charts in sync across devices.
    try {
      const result = await api('/api/charts');
      if (result && Array.isArray(result.charts)) return result.charts;
    } catch { /* fall through to direct Supabase if available */ }
    const client = await supabaseClient();
    if (client) {
      let { data, error } = await client
        .from('size_charts')
        .select('id, code, name, sex, unit, columns, rows, popup, popup_uses, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error && /popup_uses/i.test(error.message || '')) {
        ({ data, error } = await client
          .from('size_charts')
          .select('id, code, name, sex, unit, columns, rows, popup, created_at, updated_at')
          .order('created_at', { ascending: false }));
      }
      if (error) throw error;
      return data || [];
    }
  }
  // Signed out: do not show device-local charts as the user's library (prevents cross-device confusion).
  return [];
}

/**
 * Write one chart — a new one, or the one being edited. The code is generated
 * here rather than by the database, so the store can be handed its link the
 * moment the row lands; a collision (essentially impossible, but a unique index
 * is a unique index) is answered by asking for another code once.
 */
export async function saveChart({ id, name, sex, unit, columns, rows, popup }) {
  const body = { name: name.trim().slice(0, 60), sex, unit, columns, rows, popup: popup || {} };
  if (id) body.id = id;

  // Signed-in users: save via server API so charts are tied to the user and sync across devices.
  if (await hasSession()) {
    const saved = await api('/api/charts', { method: 'POST', body });
    if (saved && saved.code) {
      // Keep a local cache only as a convenience; never treat it as the source of truth.
      try {
        const charts = localList();
        const existing = charts.find((c) => c.code === saved.code || c.id === (saved.id || id));
        const row = { ...body, ...saved };
        if (existing) {
          charts[charts.indexOf(existing)] = { ...existing, ...row };
        } else {
          charts.unshift(row);
        }
        localSave(charts);
      } catch { /* ignore cache errors */ }
      return saved;
    }
    throw new Error('Could not save the chart.');
  }

  // Signed out: do not create device-local charts. Charts must belong to an account to sync.
  // (Public embed reads charts by code from the server; saving requires sign-in.)
  const err = new Error('Log in to save charts so they sync across your devices.');
  err.status = 401;
  throw err;
}

/**
 * Ask the server to read a chart's column names the way a shopper would: is each
 * one spelt correctly, and does it say what it measures? A bare "length" does
 * not, and a name nobody can parse is a column nobody can trust.
 *
 * `{ ok: false, problem }` is the only answer that stops a save. A checker that
 * cannot run — no Cloudflare key, no network, a model that rambles — comes back
 * as `{ ok: true, skipped: true }`, because the AI is a second opinion, not a
 * gate that can lock a store out of its own dashboard.
 */
export async function checkChartColumns(labels) {
  try {
    const result = await api('/api/chart-check', {
      method: 'POST',
      body: { labels },
      timeout: 15_000,
    });
    if (result && result.ok === false && typeof result.problem === 'string') {
      return { ok: false, problem: result.problem };
    }
    return { ok: true };
  } catch {
    return { ok: true, skipped: true };
  }
}

export async function removeChart(id, code) {
  // Always drop the local copy, so a logged-out chart actually disappears.
  const charts = localList().filter((c) => c.id !== id && c.code !== code);
  localSave(charts);
  // Tell the server so the public link dies too.
  if (code) {
    try { await api(`/api/charts/code/${encodeURIComponent(code)}`, { method: 'DELETE' }); } catch { /* still gone locally */ }
  }
  const client = await supabaseClient();
  if (client && (await hasSession()) && id) {
    const { error } = await client.from('size_charts').delete().eq('id', id);
    if (error && !notSetUp(error)) throw error;
  }
}

/**
 * The shopper's side: one chart, by code. No session, no account — the function
 * is granted to `anon`, which is the role a stranger's browser is. Returns null
 * for a code that matches nothing (a link that has been deleted, or a typo).
 */
export async function chartByCode(code) {
  if (!code) return null;
  const delays = [0, 2000, 4000];
  for (let i = 0; i < delays.length; i += 1) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const row = await api(`/api/charts/code/${encodeURIComponent(code)}`);
      if (!row) continue;
      return {
        code: typeof row.code === 'string' ? row.code : code,
        name: typeof row.name === 'string' ? row.name : '',
        sex: row.sex === 'female' || row.sex === 'male' ? row.sex : 'unisex',
        unit: row.unit === 'cm' ? 'cm' : 'in',
        columns: Array.isArray(row.columns) ? row.columns : [],
        rows: Array.isArray(row.rows) ? row.rows : [],
        popup: row.popup && typeof row.popup === 'object' && !Array.isArray(row.popup) ? row.popup : {},
      };
    } catch (e) {
      console.warn('[charts] chartByCode attempt', i + 1, 'failed:', e.message);
    }
  }
  return null;
}
