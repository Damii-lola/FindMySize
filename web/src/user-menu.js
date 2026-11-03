import { isLoggedIn } from "./limits.js";

export function mountUserMenu() {
  const el = document.getElementById("user-menu");
  if (!el) return;
  if (isLoggedIn()) {
    el.innerHTML = `<a href="/settings/">Settings</a>`;
  } else {
    el.innerHTML = `<a href="/login/">Log in</a>`;
  }
}
