// Anonymous device limits: 3 size scans, 1 chart, 10 popup uses.
const KEY = "fms_device";

function getDeviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function counts() {
  const raw = localStorage.getItem(KEY + ":counts") || "{}";
  return JSON.parse(raw);
}

function saveCounts(c) {
  localStorage.setItem(KEY + ":counts", JSON.stringify(c));
}

export function canScan() {
  const c = counts();
  return (c.scans || 0) < 3;
}

export function recordScan() {
  const c = counts();
  c.scans = (c.scans || 0) + 1;
  saveCounts(c);
}

export function canCreateChart() {
  const c = counts();
  return (c.charts || 0) < 1;
}

export function recordChart() {
  const c = counts();
  c.charts = (c.charts || 0) + 1;
  saveCounts(c);
}

export function canUsePopup() {
  const c = counts();
  return (c.popup || 0) < 10;
}

export function recordPopup() {
  const c = counts();
  c.popup = (c.popup || 0) + 1;
  saveCounts(c);
}

export function isLoggedIn() {
  return !!localStorage.getItem("session");
}

export { getDeviceId };
