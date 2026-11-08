/**
 * The size-chart routes, run for real against a stand-in for Supabase that answers the way PostgREST does,
 * including its exact errors for columns a project's table does not have.
 *
 * It exists because two bugs looked identical to the owner — "it saved, but it is not in my library":
 *   - the save sent `fitStyle` to a column named `fit_style`, the database refused, and the server kept the
 *     chart in its own memory and said it had saved;
 *   - the list asked for a column (`brand`) the table did not have, the database answered with an error
 *     instead of rows, and the page hid the error.
 *
 *   cd server && npm run check:charts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';

const FULL = ['id', 'user_id', 'code', 'name', 'sex', 'unit', 'columns', 'rows', 'popup', 'popup_uses', 'fit_style', 'brand', 'created_at', 'updated_at'];

function fakeSupabase(columns) {
  const rows = [];
  let seq = 0;
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const handle = (req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      const accept = req.headers.accept || '';
      if (url.pathname === '/auth/v1/user') return send(res, 200, { id: 'user-1', email: 'owner@example.com' });
      if (url.pathname !== '/rest/v1/size_charts') return send(res, 200, []);
      const select = url.searchParams.get('select');
      const cols = select && select !== '*' ? select.split(',').map((s) => s.trim()) : columns;
      const unknown = (list) => list.find((c) => !columns.includes(c));
      const project = (r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));
      if (req.method === 'GET') {
        const miss = unknown(cols);
        if (miss) return send(res, 400, { code: '42703', message: `column size_charts.${miss} does not exist` });
        let out = rows.slice().reverse();
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
        const code = (url.searchParams.get('code') || '').replace('eq.', '');
        touched = rows.filter((r) => r.code === code);
        touched.forEach((r) => Object.assign(r, items[0]));
      }
      const miss2 = unknown(cols);
      if (miss2) return send(res, 400, { code: '42703', message: `column size_charts.${miss2} does not exist` });
      const out = touched.map(project);
      if (accept.includes('vnd.pgrst.object')) return out.length === 1 ? send(res, 200, out[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      return send(res, 200, out);
    });
  };
  return { handle, rows };
}

// One fake database for the whole run; each scenario gets its own table shape.
let current = null;
const gateway = await new Promise((ok) => {
  const s = http.createServer((req, res) => current.handle(req, res));
  s.listen(0, '127.0.0.1', () => ok(s));
});
process.env.SUPABASE_URL = `http://127.0.0.1:${gateway.address().port}`;
process.env.SUPABASE_SECRET_KEY = 'test-key';
process.env.NODE_ENV = 'production';
const { chartRoutes } = await import('../src/routes/account.js');
const { config } = await import('../src/config.js');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use('/api/charts', chartRoutes);
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.status >= 500 && !err.expose ? 'Internal error' : err.message }));
const api = app.listen(0);
const base = `http://127.0.0.1:${api.address().port}`;

const payload = Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 1e9 })).toString('base64url');
const ADMIN = `${payload}.${crypto.createHmac('sha256', config.adminTokenSecret).update(payload).digest('base64url')}`;
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const chart = (name, extra = {}) => ({ name, sex: 'male', unit: 'in', fitStyle: 'regular', columns: [{ id: 'c1', label: 'Chest', measure: 'chest' }], rows: [{ size: 'M', c1: 20 }], popup: {}, brand: 'Good', ...extra });

let passed = 0;
async function scenario(name, columns, check) {
  const db = fakeSupabase(columns);
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

const FIRST = ['code', 'name', 'sex', 'unit', 'columns', 'rows', 'created_at'];
for (const [label, columns] of [
  ['a table with every column', FULL],
  ['a table with no brand column', FULL.filter((c) => c !== 'brand')],
  ['a table with no brand or fit_style column', FULL.filter((c) => !['brand', 'fit_style'].includes(c))],
  ['a table with no brand, popup or popup_uses column', FULL.filter((c) => !['brand', 'popup', 'popup_uses'].includes(c))],
  ['a table with only the original columns', ['id', 'user_id', ...FIRST]],
]) {
  await scenario(`${label}: a saved garment is in the database and in the library, for the admin and for a signed-in owner`, columns, async (db) => {
    const saved = await call('POST', '/api/charts', ADMIN, chart('Oxford Shirt'));
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(db.rows.length, 1, 'the row is really in Supabase (not only in server memory)');
    assert.equal(db.rows[0].name, 'Oxford Shirt');
    if (columns.includes('fit_style')) assert.equal(db.rows[0].fit_style, 'regular', 'fit style goes to the fit_style column');
    assert.ok(!('fitStyle' in db.rows[0]), 'no camelCase key reaches the table');
    const all = await call('GET', '/api/charts/all', ADMIN);
    assert.equal(all.status, 200, JSON.stringify(all.json));
    assert.deepEqual(all.json.charts.map((c) => c.name), ['Oxford Shirt']);
    assert.equal(all.json.charts[0].fitStyle, 'regular');
    const owner = await call('POST', '/api/charts', 'a-supabase-jwt', chart('Linen Tee'));
    assert.equal(owner.status, 200, JSON.stringify(owner.json));
    const mine = await call('GET', '/api/charts', 'a-supabase-jwt');
    assert.deepEqual(mine.json.charts.map((c) => c.name).sort(), ['Linen Tee', 'Oxford Shirt']);
    if (columns.includes('brand')) assert.equal(all.json.charts[0].brand, 'Good');
  });
}

await scenario('editing a chart by its code updates it, it does not duplicate it', FULL.filter((c) => c !== 'brand'), async (db) => {
  const first = await call('POST', '/api/charts', ADMIN, chart('Chinos'));
  const again = await call('POST', '/api/charts', ADMIN, { ...chart('Chinos (slim)'), code: first.json.code });
  assert.equal(again.status, 200, JSON.stringify(again.json));
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].name, 'Chinos (slim)');
});

await scenario('a save the database truly cannot take is an error the owner sees, never a silent "saved"', ['id', 'code', 'name', 'sex', 'unit', 'rows', 'created_at'], async (db) => {
  const saved = await call('POST', '/api/charts', ADMIN, chart('Hoodie'));
  assert.equal(saved.status, 500);
  assert.match(saved.json.error, /Could not save the chart/);
  assert.match(saved.json.error, /columns/, 'says what is wrong');
  assert.equal(db.rows.length, 0);
});

await scenario('a library nobody is signed in to is a clear 401, not a crash', FULL, async () => {
  const r = await fetch(`${base}/api/charts`);
  assert.equal(r.status, 401);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
api.close();
gateway.close();
process.exit(process.exitCode || 0);
