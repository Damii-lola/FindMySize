document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('activate-btn');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    var emailEl = document.getElementById('otp-email');
    var email = (emailEl && emailEl.textContent || '').trim();
    if (email.indexOf('@') === -1) {
      alert('Confirm your email first.');
      return;
    }
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Opening payment…';
    try {
      var cfg = await (await fetch('https://findmysize.onrender.com/api/public-config')).json();
      if (!cfg.wavyApi) {
        location.href = (cfg.selarCheckoutUrl || 'https://selar.com/1w89133gya') + '?email=' + encodeURIComponent(email);
        return;
      }
      var res = await fetch('https://findmysize.onrender.com/api/pay/wavy-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      });
      var data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
      location.href = data.url;
    } catch (err) {
      alert(err.message || 'Checkout failed. Try again.');
      btn.disabled = false;
      btn.textContent = label;
    }
  });
});