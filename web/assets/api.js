export function deviceId() {
  let id = localStorage.getItem('fms_device');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('fms_device', id);
  }
  return id;
}

export function token() {
  return localStorage.getItem('fms_token') || '';
}

export function setSession(access, email) {
  if (access) localStorage.setItem('fms_token', access);
  else localStorage.removeItem('fms_token');
  if (email) localStorage.setItem('fms_email', email);
  else localStorage.removeItem('fms_email');
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'X-Device-Id': deviceId() };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export function mountUserMenu() {
  const btn = document.getElementById('user-btn');
  const menu = document.getElementById('user-menu');
  if (!btn || !menu) return;
  const logged = Boolean(token());
  menu.innerHTML = logged
    ? `<a href="/settings/">Settings</a><button type="button" id="logout">Log out</button>`
    : `<a href="/login/">Log in</a>`;
  btn.onclick = () => menu.classList.toggle('open');
  document.addEventListener('pointerdown', (e) => {
    if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
  });
  document.getElementById('logout')?.addEventListener('click', () => {
    setSession('', '');
    location.href = '/';
  });
}
