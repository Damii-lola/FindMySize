/**
 * Login screen.
 *
 * Email + password, then the code emailed to that address. The activation code
 * is only required the first time (or after a cancel). Signup lives on the
 * unlinked /register page.
 */
import './nav.js';
import { API_URL } from './services/config.js';
import { requestPasswordReset, updatePassword, getSession } from './services/auth.js';

const SCANNER = '../size/';
const API = (API_URL || (location.origin.includes('github.io') ? 'https://findmysize.onrender.com' : location.origin)).replace(/\/$/, '');

const byId = (id) => document.getElementById(id);
const titleEl = byId('auth-title');
const leadEl = byId('auth-lead');
const entryEl = byId('auth-entry');
const tabsEl = byId('auth-tabs');
const loginForm = byId('login-form');
const loginSubmit = byId('login-submit');
const codeStep = byId('auth-code');
const codeInput = byId('code-input');
const codeSubmit = byId('code-submit');
const codeResend = byId('code-resend');
const codeBack = byId('code-back');
const statusEl = byId('auth-status');

let pendingEmail = '';
let needsCode = false;
let busy = false;

function say(message, kind = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.dataset.kind = kind;
}

function setBusy(on, message = '') {
  busy = on;
  if (loginSubmit) loginSubmit.disabled = on;
  if (codeSubmit) codeSubmit.disabled = on;
  if (message) say(message);
}

function showLogin() {
  if (entryEl) entryEl.hidden = false;
  if (codeStep) codeStep.hidden = true;
  if (tabsEl) tabsEl.hidden = true;
  if (titleEl) titleEl.textContent = 'Log in';
  if (leadEl) leadEl.textContent = 'Your email and password, then the code we send to your inbox.';
  say('');
}

function showCode(email, needs) {
  pendingEmail = email;
  needsCode = needs;
  if (entryEl) entryEl.hidden = true;
  if (codeStep) codeStep.hidden = false;
  if (titleEl) titleEl.textContent = 'Check your inbox';
  if (leadEl) leadEl.textContent = needs
    ? 'Enter the code from your email and the activation code from your payment.'
    : 'Enter the code we just emailed you.';
  // Show or hide the activation code field
  const codeField = byId('activation-field');
  if (codeField) codeField.hidden = !needs;
  if (codeInput) codeInput.focus();
  say(needs ? 'Activation code required this time.' : '');
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const email = byId('login-email')?.value?.trim() || '';
  const password = byId('login-password')?.value || '';
  if (!email || !password) return say('Enter your email and password', 'err');
  setBusy(true, 'Sending code…');
  try {
    const data = await post('/api/auth/login', { email, password });
    showCode(email, Boolean(data.needsCode));
    if (data.devOtp) say(`Dev code: ${data.devOtp}`);
  } catch (err) {
    say(err.message, 'err');
  } finally {
    setBusy(false);
  }
});

codeSubmit?.addEventListener('click', async () => {
  if (busy || !pendingEmail) return;
  const otp = codeInput?.value?.trim() || '';
  const code = byId('activation-input')?.value?.trim() || '';
  if (!otp) return say('Enter the code from your email', 'err');
  setBusy(true, 'Checking…');
  try {
    const data = await post('/api/auth/login/finish', { email: pendingEmail, otp, code });
    if (data.access_token) {
      localStorage.setItem('fms_token', data.access_token);
      localStorage.setItem('fms_email', data.email || pendingEmail);
    }
    say('Signed in. Taking you to the dashboard…');
    location.href = '../dashboard/';
  } catch (err) {
    say(err.message, 'err');
  } finally {
    setBusy(false);
  }
});

codeResend?.addEventListener('click', async () => {
  if (!pendingEmail) return;
  setBusy(true, 'Sending again…');
  try {
    await post('/api/auth/login', { email: pendingEmail, password: byId('login-password')?.value || '' });
    say('New code sent');
  } catch (err) {
    say(err.message, 'err');
  } finally {
    setBusy(false);
  }
});

codeBack?.addEventListener('click', () => {
  pendingEmail = '';
  showLogin();
});


const forgotBtn = byId('forgot-btn');
const recoverStep = byId('auth-recover');
const sentStep = byId('auth-sent');
const sentNote = byId('sent-note');
const recoveryForm = byId('recovery-form');

function showStep(which) {
  if (entryEl) entryEl.hidden = which !== 'entry';
  if (codeStep) codeStep.hidden = which !== 'code';
  if (sentStep) sentStep.hidden = which !== 'sent';
  if (recoverStep) recoverStep.hidden = which !== 'recover';
}

forgotBtn?.addEventListener('click', async () => {
  const email = byId('login-email')?.value?.trim() || '';
  if (!email) return say('Enter your email first', 'err');
  setBusy(true, 'Sending the reset email…');
  try {
    await requestPasswordReset(email);
    if (titleEl) titleEl.textContent = 'Check your email';
    if (leadEl) leadEl.textContent = 'A link to choose a new password is on its way.';
    if (sentNote) sentNote.textContent = `We sent a reset link to ${email}. Open it on this device.`;
    showStep('sent');
    say('');
  } catch (err) {
    say(err.message || 'Could not send the reset email', 'err');
  } finally {
    setBusy(false);
  }
});

byId('sent-back')?.addEventListener('click', () => {
  showLogin();
  showStep('entry');
});

byId('sent-resend')?.addEventListener('click', () => forgotBtn?.click());

recoveryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = byId('recovery-password')?.value || '';
  const confirm = byId('recovery-confirm')?.value || '';
  if (password.length < 6) return say('Password must be at least 6 characters', 'err');
  if (password !== confirm) return say('Passwords do not match', 'err');
  setBusy(true, 'Setting the password…');
  try {
    await updatePassword(password);
    say('Password set. Log in with it.');
    showLogin();
    showStep('entry');
    if (titleEl) titleEl.textContent = 'Log in';
  } catch (err) {
    say(err.message || 'Could not set the password', 'err');
  } finally {
    setBusy(false);
  }
});

// A reset link lands here with ?reset=1 and a session in the URL.
const isReset = new URLSearchParams(location.search).get('reset') === '1'
  || location.hash.includes('type=recovery');
if (isReset) {
  getSession().then((session) => {
    if (!session) {
      say('That reset link has expired. Ask for a new one.', 'err');
      return;
    }
    if (titleEl) titleEl.textContent = 'Choose a new password';
    if (leadEl) leadEl.textContent = 'This replaces the password on your account.';
    showStep('recover');
  });
}

// Start on the login form. Signup lives on /register.
showLogin();
if (loginForm) loginForm.hidden = false;
const signupForm = byId('signup-form');
if (signupForm) signupForm.hidden = true;
