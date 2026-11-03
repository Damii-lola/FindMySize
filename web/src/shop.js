/**
 * The store page behind the customiser's "Phase 0": a plain product page with the
 * FindMySize button on it. The button is drawn here so the preview never depends
 * on the embed script succeeding, and embed.js is still loaded so the real one
 * can take over when it does.
 */
import { buttonAttributes, normalizePopup } from './popup-config.js';

const inlineSlot = document.getElementById('inline-slot');

function paint(rawConfig) {
  const { button } = normalizePopup(rawConfig);
  const attrs = buttonAttributes(rawConfig);
  document.querySelectorAll('.threeDG-float, .fms-preview-btn').forEach((el) => el.remove());
  if (inlineSlot) inlineSlot.replaceChildren();

  const make = () => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'fms-preview-btn';
    el.textContent = button.label || 'Find My Size';
    el.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:8px',
      'padding:12px 18px',
      'border:0',
      `border-radius:${button.radius}px`,
      `background:${button.bg}`,
      `color:${button.textColor}`,
      'font:650 15px/1.2 system-ui,sans-serif',
      'cursor:pointer',
      'box-shadow:0 10px 24px rgba(0,0,0,.18)',
    ].join(';');
    return el;
  };

  if (button.float) {
    const wrap = document.createElement('div');
    wrap.className = 'threeDG-float' + (button.side === 'left' ? ' threeDG-left' : '');
    wrap.style.cssText = `position:fixed;${button.side === 'left' ? 'left' : 'right'}:18px;bottom:18px;z-index:50`;
    wrap.append(make());
    document.body.append(wrap);
  } else if (inlineSlot) {
    inlineSlot.append(make());
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const message = event.data;
  if (message && message.source === '3dg-preview' && message.type === 'config') paint(message.config);
});

paint({});
if (window.parent !== window) window.parent.postMessage({ source: '3dg-preview', type: 'ready', phase: 'button' }, location.origin);
