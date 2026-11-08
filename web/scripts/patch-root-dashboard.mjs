/**
 * Repairs to the GitHub Pages copy of the dashboard (the repo root's /assets), which is a built copy that has
 * been patched by hand. Idempotent; stops without writing if an expected place is not found exactly once.
 *
 *  1. dashboard  be()  — the stats strip wrote to #stat-sizes and #stat-updated, which the page's HTML no longer
 *     has, so with one or more garments it threw and the library was cleared. Each tile is now filled only if it
 *     exists, and the new Brands / Last saved tiles are filled too.
 *
 *  2. api  — the request helper set  Content-Type: application/json  only on the admin-token branch (a comma had
 *     attached it there). A signed-in owner's JSON went out as text/plain, which express.json() ignores.
 *
 *  3. dashboard  Y()  — fires `fms:list-rendered` (with the charts it drew, also left on window.__fmsCharts for a script
 *     that starts later) so brand-charts.js can group the cards and count garments from what the SERVER returned,
 *     not from this device's own record of brands.
 *
 *  4. charts  listCharts()  — it asked through a helper that sends the signed-in session token even when the owner
 *     is logged in as admin, then hid any error and fell back to an empty device cache: a failed list looked
 *     exactly like "No clothing yet". It now sends the admin token explicitly (the way brand-charts.js reaches
 *     /api/pay/brands), falls back to the signed-in route, and throws the real error so the page can show it.
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

/** `froms` are the texts this place may currently hold (the original, or an earlier version of this patch). */
function patch(path, froms, to, label) {
  const text = readFileSync(path, 'utf8');
  if (text.includes(to)) { console.log(`already  ${label}`); return; }
  const from = froms.find((f) => text.split(f).length - 1 === 1);
  if (!from) fail(`${label}: expected to find one of the original texts exactly once`);
  writeFileSync(path, text.replace(from, to));
  console.log(`patched  ${label}`);
}

const dashboard = file('dashboard-');

patch(
  dashboard,
  ['fe.hidden=!1,$t.textContent=e.length,It.textContent=e.reduce((r,a)=>r+Number(a.popup_uses||0),0);const t=e.reduce((r,a)=>{const i=a.updated_at||a.created_at;return i&&(!r||String(i)>String(r))?i:r},null);At.textContent=t?new Date(t).toLocaleDateString():"—"}'],
  'fe.hidden=!1;const S=(i,v)=>{const n=document.getElementById(i);n&&(n.textContent=v)};const t=e.reduce((r,a)=>{const i=a.updated_at||a.created_at;return i&&(!r||String(i)>String(r))?i:r},null),d=t?new Date(t).toLocaleDateString():"—";S("stat-garments",e.length),S("stat-sizes",e.reduce((r,a)=>r+Number(a.popup_uses||0),0)),S("stat-updated",d),S("stat-brands",new Set(e.map(a=>a.brand).filter(Boolean)).size),S("stat-popups",d)}',
  'dashboard: stats strip no longer throws when a garment exists',
);

patch(
  dashboard,
  ['t.forEach((r,a)=>j.append(Jt(r,a)))}', 't.forEach((r,a)=>j.append(Jt(r,a))),window.dispatchEvent(new CustomEvent("fms:list-rendered"))}', 't.forEach((r,a)=>j.append(Jt(r,a))),window.dispatchEvent(new CustomEvent("fms:list-rendered",{detail:{charts:e}}))}'],
  't.forEach((r,a)=>j.append(Jt(r,a))),window.__fmsCharts=e,window.dispatchEvent(new CustomEvent("fms:list-rendered",{detail:{charts:e}}))}',
  'dashboard: announces the drawn list, with the charts the server returned',
);

patch(
  dashboard,
  ['if(!e.length){j.append(re("No clothing yet. Add a garment above and it will appear here with its link."));return}', 'if(!e.length){j.append(re("No clothing yet. Add a garment above and it will appear here with its link.")),window.dispatchEvent(new CustomEvent("fms:list-rendered",{detail:{charts:[]}}));return}'],
  'if(!e.length){j.append(re("No clothing yet. Add a garment above and it will appear here with its link.")),window.__fmsCharts=[],window.dispatchEvent(new CustomEvent("fms:list-rendered",{detail:{charts:[]}}));return}',
  'dashboard: announces an empty library too',
);

patch(
  file('api-'),
  ['else if(ad)i.Authorization=`Bearer ${ad}`,n!==void 0&&(i["Content-Type"]="application/json");'],
  'else if(ad)i.Authorization=`Bearer ${ad}`;n!==void 0&&(i["Content-Type"]="application/json");',
  'api helper: JSON content type for every request with a body',
);

patch(
  file('charts-'),
  ['async function k(){const ad=localStorage.getItem("fms-admin");const path=ad?"/api/charts/all":"/api/charts";try{const r=await f(path,{method:"GET"});if(r&&Array.isArray(r.charts)){const seen=new Set();return r.charts.filter(c=>{if(!c||!c.code)return true;if(seen.has(c.code))return false;seen.add(c.code);return true});}return d()}catch{return d();}}'],
  'async function k(){const ad=localStorage.getItem("fms-admin");const dedupe=a=>{const seen=new Set();return a.filter(c=>{if(!c||!c.code)return true;if(seen.has(c.code))return false;seen.add(c.code);return true})};let err=null;if(ad){try{const r=await fetch("https://findmysize.onrender.com/api/charts/all",{headers:{Authorization:"Bearer "+ad}});const j=await r.json().catch(()=>({}));if(r.ok&&Array.isArray(j.charts))return dedupe(j.charts);err=new Error(j.error||"Request failed ("+r.status+")")}catch(e){err=e}}try{const r=await f("/api/charts",{method:"GET"});if(r&&Array.isArray(r.charts))return dedupe(r.charts)}catch(e){err=err||e}if(err)throw err;return d()}',
  'charts: the library is read from the server with the admin token, and a failure is raised, not hidden',
);
