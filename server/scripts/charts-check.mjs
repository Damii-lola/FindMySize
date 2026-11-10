/**
 * The size-chart and brand routes, run for real against a stand-in for Supabase that answers the way
 * PostgREST does, including its exact errors for columns and tables a project does not have.
 *
 * It exists because several different faults looked identical to the owner — "it saved, but it is not
 * there when I refresh or open it on my phone":
 *   - the save sent `fitStyle` to a column named `fit_style`, the database refused, and the server kept the
 *     chart in its own memory and said it had saved;
 *   - the list asked for a column (`brand`) the table did not have, the database answered with an error
 *     instead of rows, and the page hid the error;
 *   - brands could only be saved by the admin login, into one shared row, in tables the schema file never
 *     created, and every failure was ignored — so for a normal account a brand lived only in the browser.
 *
 *   cd server && npm run check:charts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';

const FULL = ['id', 'user_id', 'code', 'name', 'sex', 'unit', 'columns', 'rows', 'popup', 'popup_uses', 'fit_style', 'brand', 'created_at', 'updated_at'];

/** A Supabase stand-in. `tables.brandMeta` false = that table was never created in the project. */
function fakeSupabase(columns, tables = { brandMeta: true }) {
  const rows = [];
  const meta = new Map();
  let seq = 0;
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const matches = (row, url) => {
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'or', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false;
      if (v === 'is.null' && row[k] != null) return false;
    }
    return true;
  };
  const handle = (req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      const accept = req.headers.accept || '';
      if (url.pathname === '/auth/v1/user') {
        const t = (req.headers.authorization || '').slice(7);
        // like the real thing: only a genuine account token is accepted (an admin token is not one)
        return t.startsWith('jwt-') ? send(res, 200, { id: t, email: 'owner@example.com' }) : send(res, 401, { message: 'invalid JWT' });
      }
      if (url.pathname === '/rest/v1/brand_meta') {
        if (!tables.brandMeta) return send(res, 404, { code: 'PGRST205', message: "Could not find the table 'public.brand_meta' in the schema cache" });
        if (req.method === 'GET') {
          const hit = [...meta.values()].filter((r) => matches(r, url));
          if (accept.includes('vnd.pgrst.object')) return hit.length === 1 ? send(res, 200, hit[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
          return send(res, 200, hit);
        }
        meta.set(body.key, body);
        return send(res, 201);
      }
      if (url.pathname !== '/rest/v1/size_charts') return send(res, 200, []);
      const select = url.searchParams.get('select');
      const cols = select && select !== '*' ? select.split(',').map((s) => s.trim()) : columns;
      const unknown = (list) => list.find((c) => !columns.includes(c));
      const project = (r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));
      if (req.method === 'GET') {
        const miss = unknown(cols);
        if (miss) return send(res, 400, { code: '42703', message: `column size_charts.${miss} does not exist` });
        let out = rows.filter((r) => matches(r, url)).reverse();
        const or = url.searchParams.get('or');
        if (or) { const m = /user_id\.eq\.([^,)]+)/.exec(or); out = out.filter((r) => r.user_id == null || r.user_id === (m && m[1])); }
        return send(res, 200, out.map(project));
      }
      const items = Array.isArray(body) ? body : [body];
      for (const it of items) {
        const miss = unknown(Object.keys(it));
        if (miss) return send(res, 400, { code: 'PGRST204', message: `Could not find the '${miss}' column of 'size_charts' in the schema cache` });
      }
      let touched = [];
      if (req.method === 'POST') {
        for (const it of items) {
          if (rows.some((r) => r.code === it.code)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
          const r = { id: `id-${(seq += 1)}`, created_at: new Date().toISOString(), ...it };
          rows.push(r);
          touched.push(r);
        }
      } else {
        touched = rows.filter((r) => matches(r, url));
        touched.forEach((r) => Object.assign(r, items[0]));
      }
      const miss2 = unknown(cols);
      if (miss2) return send(res, 400, { code: '42703', message: `column size_charts.${miss2} does not exist` });
      const out = touched.map(project);
      if (accept.includes('vnd.pgrst.object')) return out.length === 1 ? send(res, 200, out[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      return send(res, 200, out);
    });
  };
  return { handle, rows, meta };
}

// One gateway for the whole run; each scenario points it at its own database.
let current = null;
const gateway = await new Promise((ok) => {
  const s = http.createServer((req, res) => current.handle(req, res));
  s.listen(0, '127.0.0.1', () => ok(s));
});
process.env.SUPABASE_URL = `http://127.0.0.1:${gateway.address().port}`;
process.env.SUPABASE_SECRET_KEY = 'test-key';
process.env.NODE_ENV = 'production';
const { chartRoutes, payRoutes } = await import('../src/routes/account.js');
const { config } = await import('../src/config.js');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use('/api/charts', chartRoutes);
app.use('/api/pay', payRoutes);
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.status >= 500 && !err.expose ? 'Internal error' : err.message }));
const api = app.listen(0);
const base = `http://127.0.0.1:${api.address().port}`;

const payload = Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 1e9 })).toString('base64url');
const ADMIN = `${payload}.${crypto.createHmac('sha256', config.adminTokenSecret).update(payload).digest('base64url')}`;
const call = async (method, path, token, body) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const chart = (name, extra = {}) => ({ name, sex: 'male', unit: 'in', fitStyle: 'regular', columns: [{ id: 'c1', label: 'Chest', measure: 'chest' }], rows: [{ size: 'M', c1: 20 }], popup: {}, brand: 'Good', ...extra });
const A = 'jwt-account-a';
const B = 'jwt-account-b';

let passed = 0;
async function scenario(name, columns, tables, check) {
  const db = fakeSupabase(columns, tables);
  current = db;
  try {
    await check(db);
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n${e.stack}`);
    process.exitCode = 1;
  }
}

/* ---------- garments ---------- */
const FIRST = ['code', 'name', 'sex', 'unit', 'columns', 'rows', 'created_at'];
for (const [label, columns] of [
  ['a table with every column', FULL],
  ['a table with no brand column', FULL.filter((c) => c !== 'brand')],
  ['a table with no brand, popup or popup_uses column', FULL.filter((c) => !['brand', 'popup', 'popup_uses'].includes(c))],
  ['a table with only the original columns', ['id', 'user_id', ...FIRST]],
]) {
  await scenario(`${label}: a saved garment is in the database, belongs to its account, and is in the library`, columns, { brandMeta: true }, async (db) => {
    const saved = await call('POST', '/api/charts', A, chart('Linen Tee'));
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.persisted, true);
    assert.equal(db.rows.length, 1, 'the row is really in Supabase (not only in server memory)');
    assert.equal(db.rows[0].user_id, 'jwt-account-a', 'the chart records which account saved it');
    assert.ok(!('user_id' in saved.json), 'the owner id is not echoed back');
    const mine = await call('GET', '/api/charts', A);
    assert.deepEqual(mine.json.charts.map((c) => c.name), ['Linen Tee'], 'the account sees its own chart');
    assert.deepEqual((await call('GET', '/api/charts', B)).json.charts, [], 'another account does not');
    const all = await call('GET', '/api/charts/all', ADMIN);
    assert.equal(all.status, 200, JSON.stringify(all.json));
    assert.deepEqual(all.json.charts.map((c) => c.name), ['Linen Tee'], 'the admin library lists it even when optional columns are missing');
    if (!columns.includes('brand')) assert.ok(saved.json.warnings.includes('no-brand-column'), 'the owner is told the brand could not be stored with the garment');
  });
}

await scenario('the admin saves a chart too: it is stored, listed in the admin library, and owned by nobody', FULL.filter((c) => c !== 'brand'), { brandMeta: true }, async (db) => {
  const saved = await call('POST', '/api/charts', ADMIN, chart('Oxford Shirt'));
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].user_id ?? null, null);
  assert.deepEqual((await call('GET', '/api/charts/all', ADMIN)).json.charts.map((c) => c.name), ['Oxford Shirt']);
});

await scenario('editing a chart never hands it to someone else', FULL, { brandMeta: true }, async (db) => {
  const first = await call('POST', '/api/charts', A, chart('Chinos'));
  const edit = await call('POST', '/api/charts', B, { ...chart('Chinos (slim)'), code: first.json.code });
  assert.equal(edit.status, 200, JSON.stringify(edit.json));
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].user_id, 'jwt-account-a', 'ownership is unchanged by an edit');
});

await scenario('editing a chart by its code updates it, it does not duplicate it', FULL.filter((c) => c !== 'brand'), { brandMeta: true }, async (db) => {
  const first = await call('POST', '/api/charts', ADMIN, chart('Chinos'));
  const again = await call('POST', '/api/charts', ADMIN, { ...chart('Chinos (slim)'), code: first.json.code });
  assert.equal(again.status, 200, JSON.stringify(again.json));
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].name, 'Chinos (slim)');
});

await scenario('a save the database truly cannot take is an error the owner sees, never a silent "saved"', ['id', 'code', 'name', 'sex', 'unit', 'rows', 'created_at'], { brandMeta: true }, async (db) => {
  const saved = await call('POST', '/api/charts', ADMIN, chart('Hoodie'));
  assert.equal(saved.status, 500);
  assert.match(saved.json.error, /Could not save the chart/);
  assert.equal(db.rows.length, 0);
});

/* ---------- brands ---------- */
await scenario('brands: any signed-in account saves a brand with its garment, and gets it back on another device', FULL, { brandMeta: true }, async (db) => {
  const saved = await call('POST', '/api/charts', A, chart('man', { brand: 'Good' }));
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(db.rows[0].brand, 'Good', 'the brand is stored on the garment row');
  assert.deepEqual(saved.json.warnings, []);
  // a brand-new phone: nothing local, only the account
  const phone = await call('GET', '/api/pay/brands', A);
  assert.equal(phone.status, 200, JSON.stringify(phone.json));
  assert.deepEqual(phone.json.brands, { man: 'Good' });
  assert.deepEqual(phone.json.warnings, []);
  // and what the dashboard syncs is kept for that account alone
  assert.equal((await call('POST', '/api/pay/brands', A, { brands: { 'linen tee': 'Zed' } })).json.ok, true);
  assert.equal(db.meta.get('user:jwt-account-a').brands['linen tee'], 'Zed');
  assert.deepEqual((await call('GET', '/api/pay/brands', A)).json.brands, { man: 'Good', 'linen tee': 'Zed' });
});

await scenario('brands: one account never sees, or changes, another account\'s brands', FULL, { brandMeta: true }, async (db) => {
  await call('POST', '/api/charts', A, chart('man', { brand: 'Good' }));
  await call('POST', '/api/pay/brands', A, { brands: { shirt: 'Zed' } });
  assert.deepEqual((await call('GET', '/api/pay/brands', B)).json.brands, {});
  const stamp = await call('POST', '/api/charts/brand-stamp', B, { items: [{ code: db.rows[0].code, brand: 'Stolen' }] });
  assert.equal(stamp.json.stamped, 0, 'B cannot label A\'s garment');
  assert.equal(db.rows[0].brand, 'Good');
  const mine = await call('POST', '/api/charts/brand-stamp', A, { items: [{ code: db.rows[0].code, brand: 'Better' }] });
  assert.equal(mine.json.stamped, 1);
  assert.equal(db.rows[0].brand, 'Better');
});

await scenario('brands: a popup design shared by a brand is applied to that owner\'s garments only', FULL, { brandMeta: true }, async (db) => {
  await call('POST', '/api/charts', B, chart('B shirt', { brand: 'Good', popup: { v: 2, theme: { accent: '#00ff00' } } }));
  await call('POST', '/api/charts', A, chart('A shirt', { brand: 'Good' }));
  await call('POST', '/api/charts', A, chart('A tee', { brand: 'Good', popup: { v: 2, theme: { accent: '#ff0000' } } }));
  const byName = Object.fromEntries(db.rows.map((r) => [r.name, r.popup]));
  assert.equal(byName['B shirt'].theme.accent, '#00ff00', 'B\'s design is untouched by A saving a design for her own "Good"');
  assert.equal(byName['A shirt'].theme.accent, '#ff0000');
});

await scenario('brands: with no brand column, the brand still survives a refresh (kept per account), and the owner is told', FULL.filter((c) => c !== 'brand'), { brandMeta: true }, async () => {
  const saved = await call('POST', '/api/charts', A, chart('man', { brand: 'Good' }));
  assert.ok(saved.json.warnings.includes('no-brand-column'));
  assert.equal((await call('POST', '/api/pay/brands', A, { brands: { man: 'Good' } })).status, 200);
  const phone = await call('GET', '/api/pay/brands', A);
  assert.deepEqual(phone.json.brands, { man: 'Good' });
  assert.ok(phone.json.warnings.includes('no-brand-column'));
});

await scenario('brands: with no brand column and no brand_meta table, nothing crashes and the owner is told what to run', FULL.filter((c) => c !== 'brand'), { brandMeta: false }, async () => {
  await call('POST', '/api/charts', A, chart('man', { brand: 'Good' }));
  const put = await call('POST', '/api/pay/brands', A, { brands: { man: 'Good' } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json.warnings, ['no-brand-meta-table']);
  const get = await call('GET', '/api/pay/brands', A);
  assert.equal(get.status, 200);
  assert.deepEqual(get.json.warnings.sort(), ['no-brand-column', 'no-brand-meta-table']);
  assert.deepEqual((await call('GET', '/api/charts', A)).json.charts.map((c) => c.name), ['man'], 'the garment itself is unaffected');
});

await scenario('brands: the admin keeps working exactly as before, in the shared "admin" row', FULL, { brandMeta: true }, async (db) => {
  await call('POST', '/api/pay/brands', ADMIN, { brands: { chinos: 'Nord' }, designs: { nord: { v: 2 } } });
  assert.ok(db.meta.has('admin'));
  const got = await call('GET', '/api/pay/brands', ADMIN);
  assert.equal(got.json.brands.chinos, 'Nord');
  assert.deepEqual(got.json.designs, { nord: { v: 2 } });
});

await scenario('brands: signed out is a 401 on every brand route', FULL, { brandMeta: true }, async () => {
  assert.equal((await call('GET', '/api/pay/brands', null)).status, 401);
  assert.equal((await call('POST', '/api/pay/brands', null, { brands: {} })).status, 401);
  assert.equal((await call('POST', '/api/charts/brand-stamp', null, { items: [] })).status, 401);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
api.close();
gateway.close();
process.exit(process.exitCode || 0);
