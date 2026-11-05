document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  let email = params.get('email') || '';
  let reference = params.get('reference') || params.get('tx_ref') || params.get('merchant_reference') || '';
  try {
    const stored = JSON.parse(sessionStorage.getItem('fms-pay') || 'null');
    if (stored) {
      if (!email) email = stored.email || '';
      if (!reference) reference = stored.reference || '';
    }
  } catch (e) {}
  if (!params.get('paid') && !reference) return;

  const box = document.querySelector('main') || document.querySelector('h1') || document.body;
  const status = document.createElement('p');
  status.style.cssText = 'margin:12px auto;max-width:420px;font-weight:600;text-align:center;';
  status.textContent = 'Confirming your payment…';
  if (box && box.parentNode) box.parentNode.insertBefore(status, box);

  if (!email.includes('@') || !reference) {
    status.textContent = 'Payment received. Log in with the email you paid with.';
    return;
  }
  try {
    const res = await fetch('https://findmysize.onrender.com/api/pay/wavy-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reference }),
    });
    const data = await res.json();
    if (!res.ok || !data.paid) throw new Error(data.error || 'Could not confirm payment');
    try { sessionStorage.removeItem('fms-pay'); } catch (e) {}
    status.textContent = 'Payment confirmed. Log in with ' + email + ' and the code from your email.';
    const emailInput = document.querySelector('input[type="email"]');
    if (emailInput && !emailInput.value) emailInput.value = email;
  } catch (err) {
    status.textContent = err.message || 'Payment not confirmed yet. Refresh in a minute.';
  }
});
