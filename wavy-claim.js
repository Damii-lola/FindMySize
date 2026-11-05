document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  let email = params.get('email') || '';
  let reference = params.get('reference') || params.get('tx_ref') || params.get('merchant_reference') || '';

  // Wavy keeps our page inside its own URL. Read the email from the parent if we can.
  try {
    const parentParams = new URLSearchParams(window.top.location.search);
    if (!email) email = parentParams.get('email') || '';
  } catch (e) {}
  try {
    const stored = JSON.parse(sessionStorage.getItem('fms-pay') || 'null');
    if (stored) {
      if (!email) email = stored.email || '';
      if (!reference) reference = stored.reference || '';
    }
  } catch (e) {}

  const box = document.querySelector('main') || document.querySelector('h1') || document.body;
  const status = document.createElement('p');
  status.style.cssText = 'margin:12px auto;max-width:420px;font-weight:600;text-align:center;';
  status.textContent = 'Confirming your payment…';
  if (box && box.parentNode) box.parentNode.insertBefore(status, box);

  if (!email.includes('@')) {
    status.textContent = 'Payment received. Enter the email you paid with, then log in.';
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
    status.innerHTML = 'Payment confirmed. Your activation code is <strong>' + (data.code || '') + '</strong>. Send it to FindMySize.';
    var next = 'https://damii-lola.github.io/FindMySize/auth/?paid=1&email=' + encodeURIComponent(email) + '&code=' + encodeURIComponent(data.code || '');
    setTimeout(function () { try { window.top.location.href = next; } catch (e) { location.href = next; } }, 8000);
  } catch (err) {
    status.textContent = err.message || 'Payment not confirmed yet. Refresh in a minute.';
  }
});
