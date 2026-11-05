document.addEventListener('DOMContentLoaded', function () {
  var signupTab = document.getElementById('tab-signup');
  var loginTab = document.getElementById('tab-login');
  var signupForm = document.getElementById('signup-form');
  var loginForm = document.getElementById('login-form');
  var title = document.getElementById('auth-title');
  var lead = document.getElementById('auth-lead');
  var tabs = document.querySelector('.auth-tabs');
  if (signupTab) signupTab.hidden = true;
  if (signupForm) signupForm.hidden = true;
  if (tabs) tabs.hidden = true;
  if (loginTab) loginTab.classList.add('on');
  if (loginForm) loginForm.hidden = false;
  if (title) title.textContent = 'Log in';
  if (lead) lead.textContent = 'Your account.';

  // Username field: the login form uses email. Relabel it.
  var emailInput = document.getElementById('login-email') || loginForm && loginForm.querySelector('input[type="email"]');
  if (emailInput) {
    emailInput.type = 'text';
    emailInput.autocomplete = 'username';
    emailInput.placeholder = 'Username';
    var label = loginForm.querySelector('label[for="' + emailInput.id + '"]');
    if (label) label.textContent = 'Username';
  }
  var forgot = document.getElementById('forgot-btn');
  if (forgot) forgot.hidden = true;

  if (!loginForm) return;
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var username = (emailInput && emailInput.value || '').trim();
    var password = (document.getElementById('login-password') && document.getElementById('login-password').value) || '';
    var status = document.getElementById('status') || document.getElementById('auth-status');
    if (status) status.textContent = 'Checking…';
    try {
      var res = await fetch('https://findmysize.onrender.com/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
      });
      var data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.error || 'Wrong username or password');
      localStorage.setItem('fms-admin', data.token);
      location.href = '/FindMySize/dashboard/';
    } catch (err) {
      if (status) status.textContent = err.message || 'Login failed';
      else alert(err.message || 'Login failed');
    }
  }, true);
});
