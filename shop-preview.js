/**
 * The store page behind the customiser's "Button" tab: a plain product page with the
 * FindMySize button on it. The button is drawn by embed.js itself — the very code a store's
 * page runs — so what is shown here is what a shopper gets, down to the hover and the motion.
 * If embed.js has not loaded, a plain stand-in button is drawn so the page is never empty.
 */
import { normalizePopup } from './popup-config.js';

const inlineSlot = document.getElementById('inline-slot');

function standIn(button) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = button.label || 'Find My Size';
  el.style.cssText = [
    'display:inline-flex', 'align-items:center', 'gap:8px', 'padding:12px 18px', 'border:0', `border-radius:${button.radius}px`,
    `background:${button.bg}`, `color:${button.textColor}`, 'font:650 15px/1.2 system-ui,sans-serif', 'cursor:pointer', 'box-shadow:0 10px 24px rgba(0,0,0,.18)',
  ].join(';');
  return el;
}

function paint(rawConfig) {
  const { button } = normalizePopup(rawConfig);
  document.querySelectorAll('.threeDG-float').forEach((el) => el.remove());
  if (inlineSlot) inlineSlot.replaceChildren();

  if (window.ThreeDG && typeof window.ThreeDG.mount === 'function') {
    // the page's own space, or the corner, exactly as the store's tag would choose
    const target = !button.float && inlineSlot ? inlineSlot : null;
    if (target || button.float) {
      window.ThreeDG.mount(target, { ...button, fromDesign: true, preview: true });
      return;
    }
  }

  const el = standIn(button);
  if (!button.float && inlineSlot) {
    inlineSlot.append(el);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'threeDG-float' + (button.side === 'left' ? ' threeDG-left' : '');
  wrap.style.cssText = `position:fixed;${button.side === 'left' ? 'left' : 'right'}:18px;bottom:18px;z-index:50`;
  wrap.append(el);
  document.body.append(wrap);
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const message = event.data;
  if (message && message.source === '3dg-preview' && message.type === 'config') paint(message.config);
});

paint({});
if (window.parent !== window) window.parent.postMessage({ source: '3dg-preview', type: 'ready', phase: 'button' }, location.origin);
