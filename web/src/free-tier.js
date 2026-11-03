/** Paints the free-tier countdown from /api/usage and keeps it fresh. */
import { API_URL } from './config.js';
import { deviceId } from './device.js';

const API = (API_URL || (location.origin.includes('github.io') ? 'https://findmysize.onrender.com' : location.origin)).replace(/\/$/, '');

function paint(snap) {
  if (!snap || snap.unlimited) {
    const note = document.getElementById('free-tier');
    if (note) note.hidden = true;
    return;
  }
  const left = snap.left || {};
  for (const el of document.querySelectorAll('#free-scans')) {
    el.textContent = String(left.scans ?? 3);
  }
  for (const el of document.querySelectorAll('#free-popups')) {
    el.textContent = String(left.popups ?? 5);
  }
}

export async function refreshFreeTier() {
  if (localStorage.getItem('fms_token')) {
    const note = document.getElementById('free-tier');
    if (note) note.hidden = true;
    return;
  }
  try {
    const res = await fetch(`${API}/api/usage`, { headers: { 'X-Device-Id': deviceId() } });
    if (!res.ok) return;
    paint(await res.json());
  } catch {
    /* leave the starting numbers */
  }
}

refreshFreeTier();
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFreeTier(); });
window.addEventListener('fms:usage', refreshFreeTier);
