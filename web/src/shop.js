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
  document.querySelectorAll('.threeDG-float').forEach((el) => el.remove());

  const style = (el) => {
    el.textContent = button.label || 'Find My Size';
    el.style.borderRadius = `${button.radius}px`;
    el.style.background = button.bg;
    el.style.color = button.textColor;
  };

  const inline = document.getElementById('fms-inline') || inlineSlot?.querySelector('button');
  if (inline) style(inline);

  if (button.float) {
    const wrap = document.createElement('div');
    wrap.className = 'threeDG-float' + (button.side === 'left' ? ' threeDG-left' : '');
    wrap.style.cssText = `position:fixed;${button.side === 'left' ? 'left' : 'right'}:18px;bottom:18px;z-index:50`;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'fms-preview-btn';
    style(el);
    wrap.append(el);
    document.body.append(wrap);
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const message = event.data;
  if (message && message.source === '3dg-preview' && message.type === 'config') paint(message.config);
});

paint({});
if (window.parent !== window) window.parent.postMessage({ source: '3dg-preview', type: 'ready', phase: 'button' }, location.origin);
