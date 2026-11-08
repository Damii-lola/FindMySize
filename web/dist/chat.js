/**
 * FindMySize AI help — a button at the bottom-right that opens a small chat.
 * Answers come from Cloudflare Workers AI via /api/chat.
 * Hidden inside the store popup (?embed=1) so it never covers a shopper's page.
 */
(function () {
  'use strict';
  if (document.documentElement.classList.contains('embed')) return;
  if (location.search.indexOf('embed=1') !== -1) return;

  var API = (window.FMS_API_URL || 'https://findmysize.onrender.com').replace(/\/$/, '');

  var STYLE = [
    '.fms-chat-btn{position:fixed;right:18px;bottom:18px;z-index:2147482500;width:52px;height:52px;border:0;border-radius:50%;background:#f0521f;color:#fff;box-shadow:0 10px 24px rgba(240,82,31,.35);cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.fms-chat-btn:hover{filter:brightness(1.08)}',
    '.fms-chat-btn svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.fms-chat-panel{position:fixed;right:18px;bottom:80px;z-index:2147482500;width:min(340px,calc(100vw - 24px));height:min(440px,72vh);display:none;flex-direction:column;border-radius:16px;background:#1a1410;color:#f5e9d6;box-shadow:0 20px 50px rgba(0,0,0,.5);overflow:hidden;border:1px solid rgba(255,255,255,.08);font-family:ui-sans-serif,system-ui,sans-serif}',
    '.fms-chat-panel.open{display:flex}',
    '.fms-chat-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#221a15;font-weight:650;font-size:14px}',
    '.fms-chat-close{background:none;border:0;color:#f5e9d6;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}',
    '.fms-chat-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45}',
    '.fms-chat-msg{max-width:86%;padding:8px 11px;border-radius:12px;white-space:pre-wrap}',
    '.fms-chat-msg.user{align-self:flex-end;background:#f0521f;color:#fff}',
    '.fms-chat-msg.bot{align-self:flex-start;background:#2a221c}',
    '.fms-chat-form{display:flex;gap:6px;padding:10px;border-top:1px solid rgba(255,255,255,.08)}',
    '.fms-chat-input{flex:1;border:0;border-radius:8px;padding:9px 11px;background:#2a221c;color:#f5e9d6;font:inherit}',
    '.fms-chat-send{border:0;border-radius:8px;padding:9px 12px;background:#f0521f;color:#fff;font-weight:650;cursor:pointer}',
    '.fms-chat-send:disabled{opacity:.6;cursor:default}',
  ].join('');

  var style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.className = 'fms-chat-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Ask AI about FindMySize');
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>';
  document.body.appendChild(btn);
  // Keep clear of the Find My Size button on the shop preview.
  if (document.querySelector('.threeDG-float, .fms-preview-btn')) btn.style.bottom = '78px';

  var panel = document.createElement('div');
  panel.className = 'fms-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'FindMySize help');
  panel.innerHTML = [
    '<div class="fms-chat-head"><span>Ask about FindMySize</span><button class="fms-chat-close" type="button" aria-label="Close">×</button></div>',
    '<div class="fms-chat-msgs"><div class="fms-chat-msg bot">Hi. Ask me how sizing works, how to add a chart, or how the free plan works.</div></div>',
    '<form class="fms-chat-form"><input class="fms-chat-input" placeholder="Type a question…" maxlength="500" /><button class="fms-chat-send" type="submit">Send</button></form>',
  ].join('');
  document.body.appendChild(panel);

  var msgs = panel.querySelector('.fms-chat-msgs');
  var form = panel.querySelector('.fms-chat-form');
  var input = panel.querySelector('.fms-chat-input');
  var send = panel.querySelector('.fms-chat-send');
  var history = [];

  function addMsg(text, who) {
    var el = document.createElement('div');
    el.className = 'fms-chat-msg ' + who;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  btn.addEventListener('click', function () {
    panel.classList.toggle('open');
    btn.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
    if (panel.classList.contains('open')) input.focus();
  });
  panel.querySelector('.fms-chat-close').addEventListener('click', function () {
    panel.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q || send.disabled) return;
    input.value = '';
    addMsg(q, 'user');
    var thinking = addMsg('…', 'bot');
    send.disabled = true;
    try {
      var res = await fetch(API + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: history }),
      });
      var data = await res.json().catch(function () { return {}; });
      var reply = data.reply || data.error || 'No reply.';
      thinking.textContent = reply;
      if (data.reply) {
        history.push({ role: 'user', content: q }, { role: 'assistant', content: reply });
        if (history.length > 8) history = history.slice(-8);
      }
    } catch (err) {
      thinking.textContent = 'Could not reach the AI. Try again in a moment.';
    } finally {
      send.disabled = false;
      msgs.scrollTop = msgs.scrollHeight;
    }
  });
})();
