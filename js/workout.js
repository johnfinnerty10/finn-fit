// Finn Fit — live workout logger + rest timer.
import { get, update, uid } from './store.js';
import * as L from './logic.js';
import { esc, icon, toast, buzz, openModal, confirmDialog, num } from './ui.js';

let onExit = () => {};
let clockTimer = null;

export function setExitHandler(fn) { onExit = fn; }

export function start(dayId) {
  const s = get();
  if (s.activeWorkout) { open(); return; }
  const day = s.programme.find((d) => d.id === dayId);
  if (!day) return;
  update((st) => {
    st.activeWorkout = {
      id: uid(), dayId: day.id, name: day.name, date: L.today(), startedAt: Date.now(),
      entries: day.exercises.map((e) => {
        const sug = L.suggest(e);
        return {
          exId: e.id, name: e.name, unit: e.unit, repMin: e.repMin, repMax: e.repMax,
          sug: { weight: sug.weight, reps: sug.reps, label: sug.label, detail: sug.detail, kind: sug.kind },
          sets: Array.from({ length: e.sets }, () => ({ w: sug.weight, r: null, done: false })),
        };
      }),
    };
  });
  open();
}

export function open() {
  const w = get().activeWorkout;
  if (!w) return;
  const el = document.getElementById('workout');
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  render();
  clearInterval(clockTimer);
  clockTimer = setInterval(tickClock, 1000);
  tickClock();
}

function hide() {
  document.getElementById('workout').hidden = true;
  document.body.style.overflow = '';
  clearInterval(clockTimer);
  onExit();
}

function tickClock() {
  const w = get().activeWorkout;
  const c = document.getElementById('w-clock');
  if (!w || !c) return;
  const sec = Math.floor((Date.now() - w.startedAt) / 1000);
  c.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function prevSetText(name, i) {
  const last = L.lastPerformance(name);
  const s = last?.sets[i];
  return s ? `${L.fmtKg(s.w)}×${s.r}` : '—';
}

function entryHTML(e, ei) {
  const doneCount = e.sets.filter((s) => s.done).length;
  const complete = doneCount === e.sets.length && e.sets.length > 0;
  const warn = e.sets.map((s) => L.weightWarning(e.name, s.w)).find(Boolean);
  return `
  <section class="w-ex ${complete ? 'complete' : ''}" data-ei="${ei}">
    <div class="row between">
      <h3>${esc(e.name)}</h3>
      <span class="pill ${complete ? 'accent' : ''}">${doneCount}/${e.sets.length}</span>
    </div>
    <p class="hint"><span class="suggest ${e.sug.kind}">Target: ${esc(e.sug.label)}</span> · ${esc(e.sug.detail)} <span class="muted">(${L.unitLabel(e.unit)}, ${e.repMin}–${e.repMax} reps)</span></p>
    <div class="set-head"><span>Set</span><span>Last</span><span>kg</span><span>Reps</span><span></span></div>
    <div class="sets">
      ${e.sets.map((s, si) => `
        <div class="set ${s.done ? 'done' : ''}" data-si="${si}">
          <span class="n">${si + 1}</span>
          <span class="prev">${prevSetText(e.name, si)}</span>
          <input type="number" inputmode="decimal" step="0.5" min="0" aria-label="Set ${si + 1} weight" data-f="w" value="${s.w ?? ''}" placeholder="kg">
          <input type="number" inputmode="numeric" step="1" min="0" aria-label="Set ${si + 1} reps" data-f="r" value="${s.r ?? ''}" placeholder="${e.sug.reps ?? e.repMin}">
          <button class="done-btn" data-done aria-label="Mark set ${si + 1} done" aria-pressed="${s.done}">${icon.check}</button>
        </div>`).join('')}
    </div>
    ${warn ? `<p class="warnline">⚠ ${esc(warn)}</p>` : ''}
    <div class="row" style="margin-top:10px">
      <button class="btn sm ghost" data-addset>${icon.plus} Add set</button>
      ${e.sets.length > 1 ? '<button class="btn sm ghost" data-rmset>Remove set</button>' : ''}
    </div>
  </section>`;
}

function render() {
  const w = get().activeWorkout;
  const el = document.getElementById('workout');
  if (!w) { hide(); return; }
  const total = w.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  el.innerHTML = `
    <div class="w-head">
      <button class="btn icon ghost" data-min aria-label="Minimise workout">${icon.left}</button>
      <div style="flex:1;min-width:0">
        <h2>${esc(w.name)}</h2>
        <div class="tiny muted"><span id="w-clock" class="num">0:00</span> · ${done}/${total} sets</div>
      </div>
      <button class="btn primary" data-finish>Finish</button>
    </div>
    <div class="bar-track" style="border-radius:0;height:3px"><div class="bar-fill" style="width:${total ? (done / total) * 100 : 0}%;border-radius:0"></div></div>
    <div class="w-body">
      ${w.entries.map(entryHTML).join('')}
      <button class="btn ghost" data-discard style="justify-self:center;color:var(--bad)">Discard workout</button>
    </div>`;
  tickClock();
  wire(el);
}

function rerenderEntry(ei) {
  const w = get().activeWorkout;
  const el = document.querySelector(`.w-ex[data-ei="${ei}"]`);
  if (!el) return render();
  const tmp = document.createElement('div');
  tmp.innerHTML = entryHTML(w.entries[ei], ei);
  el.replaceWith(tmp.firstElementChild);
  // update header counts
  const total = w.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const head = document.querySelector('.w-head .tiny');
  if (head) head.innerHTML = `<span id="w-clock" class="num"></span> · ${done}/${total} sets`;
  const fill = document.querySelector('#workout .bar-fill');
  if (fill) fill.style.width = `${total ? (done / total) * 100 : 0}%`;
  tickClock();
}

function wire(el) {
  el.onclick = async (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-min')) { hide(); toast('Workout minimised — resume any time'); return; }
    if (t.hasAttribute('data-finish')) { finish(); return; }
    if (t.hasAttribute('data-discard')) {
      if (await confirmDialog('Discard this workout?', 'Nothing from this session will be saved.', 'Discard', true)) {
        update((s) => { s.activeWorkout = null; });
        stopRest();
        hide();
      }
      return;
    }
    const exEl = t.closest('.w-ex');
    if (!exEl) return;
    const ei = +exEl.dataset.ei;
    if (t.hasAttribute('data-addset')) {
      update((s) => { const e = s.activeWorkout.entries[ei]; const last = e.sets.at(-1); e.sets.push({ w: last?.w ?? e.sug.weight, r: null, done: false }); });
      rerenderEntry(ei);
      return;
    }
    if (t.hasAttribute('data-rmset')) {
      update((s) => { s.activeWorkout.entries[ei].sets.pop(); });
      rerenderEntry(ei);
      return;
    }
    if (t.hasAttribute('data-done')) {
      const si = +t.closest('.set').dataset.si;
      let becameDone = false;
      update((s) => {
        const e = s.activeWorkout.entries[ei];
        const set = e.sets[si];
        if (!set.done) {
          if (set.r == null) set.r = e.sug.reps ?? e.repMin;
          if (set.w == null || !(set.w >= 0)) { toast('Enter the weight first'); return; }
          set.done = true; becameDone = true;
          // carry weight forward to later empty/undone sets
          for (let k = si + 1; k < e.sets.length; k++) if (!e.sets[k].done && e.sets[k].w == null) e.sets[k].w = set.w;
        } else set.done = false;
      });
      rerenderEntry(ei);
      if (becameDone) {
        const row = document.querySelector(`.w-ex[data-ei="${ei}"] .set[data-si="${si}"]`);
        row?.classList.add('just-done');
        buzz(20);
        const w = get().activeWorkout;
        const allDone = w.entries.every((e) => e.sets.every((s) => s.done));
        if (allDone) { stopRest(); toast('All sets done — hit Finish 💪'); } else startRest();
      }
    }
  };
  el.oninput = (ev) => {
    const inp = ev.target;
    if (!inp.matches('input[data-f]')) return;
    const ei = +inp.closest('.w-ex').dataset.ei;
    const si = +inp.closest('.set').dataset.si;
    const v = num(inp.value);
    update((s) => { s.activeWorkout.entries[ei].sets[si][inp.dataset.f] = v; });
  };
  el.onchange = (ev) => {
    if (!ev.target.matches('input[data-f="w"]')) return;
    const exEl = ev.target.closest('.w-ex');
    const ei = +exEl.dataset.ei;
    const e = get().activeWorkout.entries[ei];
    const warn = e.sets.map((s) => L.weightWarning(e.name, s.w)).find(Boolean);
    let wl = exEl.querySelector('.warnline');
    if (warn && !wl) { wl = document.createElement('p'); wl.className = 'warnline'; exEl.querySelector('.sets').after(wl); }
    if (wl) { if (warn) wl.textContent = `⚠ ${warn}`; else wl.remove(); }
  };
}

async function finish() {
  const w = get().activeWorkout;
  const doneSets = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const total = w.entries.reduce((n, e) => n + e.sets.length, 0);
  if (!doneSets) {
    if (await confirmDialog('No sets logged', 'Tick off at least one set to save the workout, or discard it.', 'Discard workout', true)) {
      update((s) => { s.activeWorkout = null; });
      hide();
    }
    return;
  }
  if (doneSets < total && !(await confirmDialog('Finish early?', `${total - doneSets} set(s) aren't ticked off. Only completed sets will be saved.`, 'Finish workout'))) return;

  const endedAt = Date.now();
  const session = {
    id: w.id, dayId: w.dayId, name: w.name, date: w.date, startedAt: w.startedAt, endedAt,
    durationMin: Math.max(1, Math.round((endedAt - w.startedAt) / 60000)),
    entries: w.entries.map((e) => ({ exId: e.exId, name: e.name, unit: e.unit, sets: e.sets.filter((s) => s.done).map(({ w: kg, r }) => ({ w: kg, r, done: true })) }))
      .filter((e) => e.sets.length),
  };
  update((s) => {
    s.sessions.push(session);
    s.activeWorkout = null;
    // keep the programme's working weights current
    for (const e of session.entries) {
      for (const d of s.programme) for (const pe of d.exercises) if (pe.name === e.name) pe.weight = L.topWeightOf(e.sets);
    }
  });
  stopRest();
  hide();
  const prs = L.sessionPRs(session);
  buzz([30, 60, 30]);
  openModal(`
    <p class="eyebrow accent">Workout saved</p>
    <h2 style="font-size:28px">${esc(session.name)} done 🎉</h2>
    <div class="summary-stats">
      <div class="stat"><div class="v">${session.durationMin}</div><div class="l">minutes</div></div>
      <div class="stat"><div class="v">${L.totalSets(session)}</div><div class="l">sets</div></div>
      <div class="stat"><div class="v">${L.fmtInt(L.sessionVolume(session))}</div><div class="l">kg volume</div></div>
    </div>
    ${prs.length ? `<h3 style="margin-bottom:8px">Personal bests</h3><div class="stack" style="gap:8px">${prs.map((p) => `<div class="pr"><span class="medal">🏅</span><div><strong>${esc(p.name)}</strong><div class="tiny muted">${esc(p.text)}</div></div></div>`).join('')}</div>`
      : '<p class="sub">No new records this time. Showing up is the win; the numbers follow.</p>'}
    <div class="sheet-actions"><button class="btn primary" data-close>Nice</button></div>`);
}

/* ---------- rest timer ---------- */
let rest = null; // { endAt, total, timer }

export function startRest(sec = get().settings.restSec || 120) {
  stopRest();
  rest = { endAt: Date.now() + sec * 1000, total: sec, alerted: false };
  const bar = document.getElementById('rest-bar');
  bar.hidden = false;
  bar.innerHTML = `
    <div><div class="tiny muted">Rest</div><div class="time" id="rest-time">0:00</div></div>
    <div class="spacer"></div>
    <button class="btn sm" data-r="-15">−15s</button>
    <button class="btn sm" data-r="30">+30s</button>
    <button class="btn sm primary" data-r="skip">Skip</button>
    <div class="prog" id="rest-prog"></div>`;
  bar.onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b || !rest) return;
    if (b.dataset.r === 'skip') return stopRest();
    const d = +b.dataset.r;
    rest.endAt += d * 1000; rest.total = Math.max(1, rest.total + d); rest.alerted = false;
    tickRest();
  };
  rest.timer = setInterval(tickRest, 250);
  tickRest();
}

function tickRest() {
  if (!rest) return;
  const left = Math.round((rest.endAt - Date.now()) / 1000);
  const bar = document.getElementById('rest-bar');
  const t = document.getElementById('rest-time');
  const p = document.getElementById('rest-prog');
  if (left <= 0) {
    bar.classList.add('over');
    t.textContent = 'Go!';
    p.style.width = '100%';
    if (!rest.alerted) { rest.alerted = true; buzz([200, 100, 200]); beep(); }
    if (left < -8) stopRest();
    return;
  }
  bar.classList.remove('over');
  t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  p.style.width = `${(1 - left / rest.total) * 100}%`;
}

export function stopRest() {
  if (rest) clearInterval(rest.timer);
  rest = null;
  const bar = document.getElementById('rest-bar');
  if (bar) { bar.hidden = true; bar.classList.remove('over'); }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch { /* audio unavailable */ }
}
