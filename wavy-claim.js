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

  const box = document.querySelector('.auth-lead') || document.querySelector('main') || document.body;
  const status = document.createElement('p');
  status.style.cssText = 'margin:12px 0;font-weight:600;';
  status.textContent = 'Confirming your payment…';
  if (box && box.parentNode) box.parentNode.insertBefore(status, box.nextSibling);

  if (!email.includes('@') || !reference) {
    status.textContent = 'Could not find the payment details. Go back and pay again.';
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
    status.textContent = 'Payment confirmed. Taking you to login…';
    setTimeout(() => { location.href = '/FindMySize/register/?paid=1'; }, 800);
  } catch (err) {
    status.textContent = err.message || 'Payment not confirmed yet. Refresh in a minute.';
  }
});
