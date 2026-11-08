/**
 * Three small repairs to the GitHub Pages copy of the dashboard (the repo root's /assets), which is a built
 * copy that has been patched by hand. Idempotent; stops without writing if an expected place is not found once.
 *
 *  1. assets/dashboard-<hash>.js  be()  — draws the stats strip. It wrote to #stat-sizes and #stat-updated, which
 *     the page's HTML no longer has (it was redesigned to #stat-brands / #stat-garments / #stat-popups), so the moment
 *     an account had one garment it threw, the library's "catch" cleared the list, and a saved garment never appeared.
 *     Now each tile is filled only if it exists, and the new Brands / Last saved tiles are filled too.
 *
 *  2. assets/api-<hash>.js  — the request helper set  Content-Type: application/json  only when signing in with the
 *     admin token (a comma had attached it to that branch). A normal signed-in owner's JSON went out as text/plain,
 *     which the server's express.json() ignores, so their saves arrived empty. It is now set whenever there is a body,
 *     as the source (web/src/services/api.js) does.
 *
 *  3. assets/dashboard-<hash>.js  Y()  — after the cards are drawn it now fires `fms:list-rendered`, as web/src/dashboard.js
 *     does. brand-charts.js groups the cards by brand when it hears that; this older bundle never sent it, so a garment
 *     saved just now would sit ungrouped until something else triggered the grouping.
 *
 * Run from web/:  node scripts/patch-root-dashboard.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
const fail = (m) => { console.error(`STOPPED: ${m}`); process.exit(1); };
const file = (prefix) => {
  const found = readdirSync(assets).filter((f) => f.startsWith(prefix) && f.endsWith('.js'));
  if (found.length !== 1) fail(`expected exactly one ${prefix}*.js in /assets, found ${found.length}`);
  return join(assets, found[0]);
};

function patch(path, from, to, label) {
  const text = readFileSync(path, 'utf8');
  if (text.includes(to)) { console.log(`already  ${label}`); return; }
  const count = text.split(from).length - 1;
  if (count !== 1) fail(`${label}: expected to find the original text once, found ${count}`);
  writeFileSync(path, text.replace(from, to));
  console.log(`patched  ${label}`);
}

patch(
  file('dashboard-'),
  'fe.hidden=!1,$t.textContent=e.length,It.textContent=e.reduce((r,a)=>r+Number(a.popup_uses||0),0);const t=e.reduce((r,a)=>{const i=a.updated_at||a.created_at;return i&&(!r||String(i)>String(r))?i:r},null);At.textContent=t?new Date(t).toLocaleDateString():"—"}',
  'fe.hidden=!1;const S=(i,v)=>{const n=document.getElementById(i);n&&(n.textContent=v)};const t=e.reduce((r,a)=>{const i=a.updated_at||a.created_at;return i&&(!r||String(i)>String(r))?i:r},null),d=t?new Date(t).toLocaleDateString():"—";S("stat-garments",e.length),S("stat-sizes",e.reduce((r,a)=>r+Number(a.popup_uses||0),0)),S("stat-updated",d),S("stat-brands",new Set(e.map(a=>a.brand).filter(Boolean)).size),S("stat-popups",d)}',
  'dashboard bundle: stats strip no longer throws when a garment exists',
);

patch(
  file('api-'),
  'else if(ad)i.Authorization=`Bearer ${ad}`,n!==void 0&&(i["Content-Type"]="application/json");',
  'else if(ad)i.Authorization=`Bearer ${ad}`;n!==void 0&&(i["Content-Type"]="application/json");',
  'api helper: JSON content type for every signed-in request with a body',
);

patch(
  file('dashboard-'),
  't.forEach((r,a)=>j.append(Jt(r,a)))}',
  't.forEach((r,a)=>j.append(Jt(r,a))),window.dispatchEvent(new CustomEvent("fms:list-rendered"))}',
  'dashboard bundle: tells brand-charts.js when the list has been drawn',
);
