/** Stable id for this browser. Free-tier limits are counted against it. */
const KEY = 'fms_device';

export function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (id && /^[a-zA-Z0-9_-]{8,80}$/.test(id)) return id;
    id = `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'dunknown';
  }
}
