// Finn Fit — entry point: router + boot.
import { get } from './store.js';
import * as V from './views.js';
import * as W from './workout.js';
import { hydrate } from './charts.js';
import { initTooltips } from './ui.js';

const routes = {
  home: V.home,
  train: V.train,
  nutrition: V.nutrition,
  progress: V.progress,
  activity: V.activity,
  settings: V.settings,
};

const view = document.getElementById('view');
let current = null;

function parseHash() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: routes[name] ? name : 'home', param };
}

function render({ keepScroll = false } = {}) {
  const { name, param } = parseHash();
  const y = window.scrollY;
  const focusName = document.activeElement?.name;
  routes[name](view, param);
  hydrate(view);
  V.sideWeek(document.getElementById('side-week'));
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  if (current !== name) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
  else if (keepScroll) {
    window.scrollTo(0, y);
    if (focusName) view.querySelector(`[name="${focusName}"]`)?.focus({ preventScroll: true });
  }
  current = name;
}

V.setRerender(() => setTimeout(() => render({ keepScroll: true }), 0));
W.setExitHandler(() => render({ keepScroll: true }));

window.addEventListener('hashchange', () => {
  const m = document.getElementById('modal');
  m.hidden = true; m.innerHTML = '';
  render();
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => hydrate(view), 120); });

initTooltips();
render();

// Reopen an unfinished workout after a refresh.
if (get().activeWorkout) W.open();

// Ask the browser not to evict saved data (the phone holds the only copy).
navigator.storage?.persist?.().catch(() => {});

// Offline support when served over http(s).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
