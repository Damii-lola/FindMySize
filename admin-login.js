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
  if (lead) lead.textContent = 'Your email and password, then the code we send you.';

  var emailInput = document.getElementById('login-email') || loginForm && loginForm.querySelector('input[type="email"], input[type="text"]');
  if (emailInput) {
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    emailInput.placeholder = 'you@example.com';
    var label = loginForm.querySelector('label[for="' + emailInput.id + '"]');
    if (label) label.textContent = 'Email';
  }
  var forgot = document.getElementById('forgot-btn');
  if (forgot) forgot.hidden = true;

  var otpWrap = document.createElement('label');
  otpWrap.hidden = true;
  otpWrap.innerHTML = 'Code from your email<input id="admin-otp" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />';
  var submit = loginForm.querySelector('button[type="submit"]');
  if (submit) loginForm.insertBefore(otpWrap, submit);

  if (!loginForm) return;
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var email = (emailInput && emailInput.value || '').trim();
    var password = (document.getElementById('login-password') && document.getElementById('login-password').value) || '';
    var otp = (document.getElementById('admin-otp') && document.getElementById('admin-otp').value || '').trim();
    var status = document.getElementById('status') || document.getElementById('auth-status');
    if (status) status.textContent = otp ? 'Checking the code…' : 'Sending a code…';
    try {
      var res = await fetch('https://findmysize.onrender.com/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, otp: otp }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      if (data.needsOtp) {
        otpWrap.hidden = false;
        if (status) status.textContent = 'Code sent. Enter it above.';
        document.getElementById('admin-otp').focus();
        return;
      }
      if (!data.token) throw new Error('Login failed');
      localStorage.setItem('fms-admin', data.token);
      location.href = '/FindMySize/dashboard/';
    } catch (err) {
      if (status) status.textContent = err.message || 'Login failed';
      else alert(err.message || 'Login failed');
    }
  }, true);
});
