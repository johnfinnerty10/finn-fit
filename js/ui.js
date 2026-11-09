// Finn Fit — shared UI helpers.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24"><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/></svg>',
};

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function buzz(pattern = 15) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/** Open a modal sheet. `mount(sheetEl, close)` wires up behaviour. */
export function openModal(html, mount) {
  const root = document.getElementById('modal');
  root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  const sheet = root.firstElementChild;
  const close = () => { root.hidden = true; root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.onclick = (e) => { if (e.target === root) close(); };
  sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  mount?.(sheet, close);
  const first = sheet.querySelector('input, select, textarea');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
  return close;
}

export function confirmDialog(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    openModal(`
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(body)}</p>
      <div class="sheet-actions">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>
      </div>`, (sheet, close) => {
      sheet.querySelector('[data-ok]').onclick = () => { answered = true; close(); resolve(true); };
      const obs = new MutationObserver(() => { if (!sheet.isConnected) { obs.disconnect(); if (!answered) resolve(false); } });
      obs.observe(document.getElementById('modal'), { childList: true });
    });
  });
}

/* Chart tooltips: any element with data-tip. */
export function initTooltips() {
  const tip = document.getElementById('tooltip');
  const show = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    const r = t.getBoundingClientRect();
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    const x = Math.min(window.innerWidth - 12 - tip.offsetWidth / 2, Math.max(12 + tip.offsetWidth / 2, r.left + r.width / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${r.top + 8}px`;
  };
  document.addEventListener('pointerover', show);
  document.addEventListener('pointerdown', show);
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
}

export function num(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
