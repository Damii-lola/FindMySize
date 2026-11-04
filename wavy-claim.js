document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const email = params.get('email') || '';
  const reference = params.get('reference') || params.get('tx_ref') || '';
  if (!email.includes('@')) return;

  const box = document.querySelector('.auth-lead') || document.querySelector('main') || document.body;
  const status = document.createElement('p');
  status.style.cssText = 'margin:12px 0;font-weight:600;';
  status.textContent = 'Confirming your payment…';
  box.parentNode.insertBefore(status, box.nextSibling);

  try {
    const res = await fetch('https://findmysize.onrender.com/api/pay/wavy-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reference }),
    });
    const data = await res.json();
    if (!res.ok || !data.code) throw new Error(data.error || 'Could not confirm payment');
    status.textContent = 'Your activation code: ' + data.code;
    status.style.color = '#f0521f';
  } catch (err) {
    status.textContent = err.message || 'Payment confirmed, but the code is delayed. Check your email or try again in a minute.';
  }
});
