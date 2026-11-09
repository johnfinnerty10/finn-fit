// Finn Fit — screens. Each view renders into `el` and wires its own events.
import { get, update, uid, exportJSON, importJSON, resetAll } from './store.js';
import * as L from './logic.js';
import * as W from './workout.js';
import { chart, ring } from './charts.js';
import { esc, icon, toast, openModal, confirmDialog, num } from './ui.js';
import { openAddFood } from './addfood.js';
import * as F from './food.js';

let rerender = () => {};
export function setRerender(fn) { rerender = fn; }

const ui = { trainDay: null, foodDate: null, actDate: null, lift: null, range: 12, histWeek: null };

/* ---------- backups ---------- */
function downloadBackup() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finn-fit-backup-${L.today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  update((s) => { s.settings.lastExport = L.today(); });
  toast('Backup saved — keep it in Files or iCloud');
}

/** Days since the last export, or null if never. */
function backupAge() {
  const last = get().settings.lastExport;
  return last ? Math.round((L.parse(L.today()) - L.parse(last)) / 864e5) : null;
}

function hasData() {
  const s = get();
  return s.sessions.length > 0 || Object.keys(s.foods).length > 0;
}

/* ======================================================= HOME */
export function home(el) {
  const s = get();
  const t = L.today();
  const next = L.nextSession();
  const mon = L.mondayOf(t);
  const weekSessions = L.sessionsInWeek(mon);
  const food = L.dayTotals(t);
  const sleep = s.activity[t]?.sleepMin;
  const avg = L.sleepAverage(t);
  const lastW = [...s.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const last = [...s.sessions].sort((a, b) => b.endedAt - a.endedAt)[0];
  const lastPRs = last ? L.sessionPRs(last) : [];
  const isToday = next && next.weekday === L.weekdayOf(t);

  el.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">${L.fmtLong(t)} · Week ${L.weekNumber(t)}</p>
      <h1>${L.greeting()}, ${esc(s.settings.name)}.</h1>
      <p class="sub">Your training, nutrition and recovery.</p>
    </div>

    ${s.activeWorkout ? `
      <div class="card section row between" style="border-color:var(--accent-2)">
        <div><p class="eyebrow accent">In progress</p><h3>${esc(s.activeWorkout.name)}</h3></div>
        <button class="btn primary" data-resume>${icon.play} Resume</button>
      </div>` : ''}

    ${hasData() && (backupAge() == null || backupAge() >= 7) ? `
      <div class="banner section" style="align-items:center">
        <span style="flex:1">${backupAge() == null ? 'Your data only lives on this device. Save a backup so you never lose it.' : `Last backup was ${backupAge()} days ago. Save a fresh one.`}</span>
        <button class="btn sm" data-backup>Back up</button>
      </div>` : ''}

    <section class="hero section">
      <svg class="glyph" viewBox="0 0 24 24">${icon.dumbbell.replace(/<\/?svg[^>]*>/g, '')}</svg>
      ${next ? `
        <div class="row between">
          <p class="eyebrow accent">${isToday ? 'Today' : `Up next · ${L.dayLong(next.weekday)}`}</p>
          <a class="btn sm ghost" href="#train/${next.id}">View session</a>
        </div>
        <h1>${esc(next.name)}</h1>
        <p class="sub">${esc(next.focus)}</p>
        <div class="meta"><span>⏱ ${esc(next.duration)}</span><span>🏋 ${next.exercises.length} exercises</span>${(() => { const n = next.exercises.filter((e) => L.suggest(e).kind === 'up').length; return n ? `<span>📈 ${n} ready to add weight</span>` : ''; })()}</div>
        <button class="btn primary lg" data-start="${next.id}">${icon.play} Start workout</button>`
      : `
        <p class="eyebrow accent">This week</p>
        <h1>Week complete.</h1>
        <p class="sub">All ${s.programme.length} sessions done. Rest, eat, sleep — next week starts Monday.</p>`}
    </section>

    <div class="grid two section">
      <section class="card">
        <div class="card-head"><h3>This week</h3><span class="pill ${weekSessions.length >= s.programme.length ? 'accent' : ''}">${weekSessions.length} / ${s.programme.length} sessions</span></div>
        ${weekStrip(mon)}
        <div class="grid three" style="margin-top:18px;grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="v num">${weekSessions.reduce((n, x) => n + L.totalSets(x), 0)}</div><div class="l">sets</div></div>
          <div class="stat"><div class="v num">${weekSessions.reduce((n, x) => n + x.durationMin, 0)}<small>min</small></div><div class="l">trained</div></div>
          <div class="stat"><div class="v num">${proteinHitDays(mon)}<small>/7</small></div><div class="l">protein days</div></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3>Today's nutrition</h3><a class="btn sm" href="#nutrition">Log food</a></div>
        <div class="rings">
          ${ring({ value: food.kcal, max: s.settings.kcal, size: 116, center: L.fmtInt(Math.max(0, s.settings.kcal - food.kcal)), sub: 'kcal left' })}
          <div class="macros">
            ${macroBar('Protein', food.protein, s.settings.protein, 'g')}
            ${macroBar('Water', (s.water[t] || 0) / 1000, s.settings.water / 1000, 'L', 1)}
            <p class="tiny muted" style="margin:0">${food.count} food entr${food.count === 1 ? 'y' : 'ies'} · ${L.fmtInt(food.kcal)} kcal eaten</p>
          </div>
        </div>
      </section>
    </div>

    <div class="grid three section">
      <a class="card stat" href="#activity" style="text-decoration:none">
        <p class="eyebrow">Sleep</p>
        <div class="v">${sleep != null ? L.fmtSleep(sleep) : avg.avg != null ? L.fmtSleep(avg.avg) : '—'}</div>
        <div class="l">${sleep != null ? 'last night' : avg.avg != null ? `7-night average · ${avg.count} nights` : 'Tap to log'}</div>
      </a>
      <a class="card stat" href="#activity" style="text-decoration:none">
        <p class="eyebrow">Steps</p>
        <div class="v num">${L.fmtInt(s.activity[t]?.steps)}</div>
        <div class="l">${s.activity[t]?.steps != null ? 'today' : 'Tap to log'}</div>
      </a>
      <a class="card stat" href="#progress" style="text-decoration:none">
        <p class="eyebrow">Bodyweight</p>
        <div class="v num">${lastW ? L.fmtKg(lastW.kg) : '—'}<small>kg</small></div>
        <div class="l">${lastW ? `logged ${L.fmtShort(lastW.date)}` : 'Log a weigh-in'}</div>
      </a>
    </div>

    <div class="grid two section">
      <section class="card">
        <div class="card-head"><h3>Your plan</h3><a class="btn sm ghost" href="#train">Open</a></div>
        <div class="list">
          ${[...s.programme].sort((a, b) => a.weekday - b.weekday).map((d, i) => {
            const done = weekSessions.some((x) => x.dayId === d.id);
            return `<a class="list-item" href="#train/${d.id}" style="text-decoration:none">
              <span class="pill ${done ? 'accent' : ''}">${done ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div style="flex:1"><strong>${esc(d.name)}</strong><div class="tiny muted">${L.dayLong(d.weekday)} · ${esc(d.focus)}</div></div>
              <span class="tiny muted">${d.exercises.length} ex</span></a>`;
          }).join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Last session</h3>${last ? `<span class="tiny muted">${L.fmtShort(last.date)}</span>` : ''}</div>
        ${last ? `
          <h2>${esc(last.name)}</h2>
          <p class="sub small">${last.durationMin} minutes · ${L.totalSets(last)} sets · ${L.fmtInt(L.sessionVolume(last))} kg volume</p>
          <div class="stack" style="gap:8px;margin-top:12px">
            ${lastPRs.length ? lastPRs.slice(0, 3).map((p) => `<div class="pr"><span class="medal">🏅</span><div><strong class="small">${esc(p.name)}</strong><div class="tiny muted">${esc(p.text)}</div></div></div>`).join('') : '<p class="tiny muted" style="margin:0">No new records — consistency is the record.</p>'}
          </div>`
        : '<p class="sub small">Finish your first workout and it will show up here.</p>'}
      </section>
    </div>`;

  el.querySelector('[data-start]')?.addEventListener('click', (e) => W.start(e.currentTarget.dataset.start));
  el.querySelector('[data-resume]')?.addEventListener('click', () => W.open());
  el.querySelector('[data-backup]')?.addEventListener('click', () => { downloadBackup(); rerender(); });
}

function weekStrip(mon) {
  const s = get();
  const t = L.today();
  const sessions = L.sessionsInWeek(mon);
  return `<div class="week">${Array.from({ length: 7 }, (_, i) => {
    const k = L.addDays(mon, i);
    const wd = L.weekdayOf(k);
    const planned = s.programme.find((d) => d.weekday === wd);
    const done = sessions.find((x) => x.date === k);
    const cls = done ? 'done' : planned ? 'planned' : '';
    const label = done ? '✓' : planned ? planned.name.split(' ').map((w) => w[0]).join('') : '';
    return `<div><div class="d">${L.dayShort(wd)}</div><div class="dot ${cls} ${k === t ? 'today' : ''}" title="${planned ? esc(planned.name) : 'Rest'}">${label}</div></div>`;
  }).join('')}</div>`;
}

function proteinHitDays(mon) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (L.dayTotals(L.addDays(mon, i)).protein >= get().settings.protein * 0.9) n++;
  return n;
}

function macroBar(label, v, max, unit, dp = 0) {
  const pct = max ? Math.min(100, (v / max) * 100) : 0;
  const f = (x) => (dp ? x.toFixed(dp) : L.fmtInt(x));
  return `<div class="macro"><div class="row between"><span>${label}</span><span class="num muted">${f(v)} / ${f(max)} ${unit}</span></div>
    <div class="bar-track" style="margin-top:5px"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

/* ======================================================= TRAIN */
export function train(el, param) {
  const s = get();
  const t = L.today();
  const ordered = [...s.programme].sort((a, b) => a.weekday - b.weekday);
  if (param && s.programme.some((d) => d.id === param)) ui.trainDay = param;
  if (!ui.trainDay || !s.programme.some((d) => d.id === ui.trainDay)) ui.trainDay = (L.nextSession() || ordered[0])?.id;
  const day = s.programme.find((d) => d.id === ui.trainDay);
  const mon = L.mondayOf(t);
  const doneIds = new Set(L.sessionsInWeek(mon).map((x) => x.dayId));
  const past = s.sessions.filter((x) => x.dayId === day.id).sort((a, b) => b.endedAt - a.endedAt).slice(0, 3);
  const idx = ordered.indexOf(day) + 1;

  el.innerHTML = `
    <div class="page-head row between wrap">
      <div><p class="eyebrow">Week ${L.weekNumber(t)} · ${L.fmtShort(mon)} – ${L.fmtShort(L.addDays(mon, 6))}</p><h1>Training</h1></div>
      <button class="btn" data-guide>How progression works</button>
    </div>
    ${s.activeWorkout ? `<div class="card row between" style="border-color:var(--accent-2);margin-bottom:16px"><div><p class="eyebrow accent">In progress</p><h3>${esc(s.activeWorkout.name)}</h3></div><button class="btn primary" data-resume>${icon.play} Resume</button></div>` : ''}
    <div class="days">
      ${ordered.map((d) => `<button class="day-tab ${d.id === day.id ? 'on' : ''}" data-day="${d.id}">
        <span class="eyebrow">${L.dayLong(d.weekday)}</span><strong>${esc(d.name)}</strong>
        <span class="tick">${doneIds.has(d.id) ? '✓ Done this week' : '&nbsp;'}</span></button>`).join('')}
    </div>

    <section class="hero section" style="padding:22px">
      <p class="eyebrow accent">Session ${idx} · ${esc(day.duration)}</p>
      <div class="row between wrap" style="align-items:flex-end">
        <div><h1 style="font-size:40px">${esc(day.name)}</h1><p class="sub">${esc(day.focus)}</p></div>
        <button class="btn primary lg" data-start>${icon.play} ${s.activeWorkout?.dayId === day.id ? 'Resume' : 'Start workout'}</button>
      </div>
    </section>

    <div class="row between section"><h3>${day.exercises.length} exercises</h3><button class="btn sm" data-add>${icon.plus} Add exercise</button></div>
    <div class="ex-list section">
      ${day.exercises.map((e, i) => {
        const sug = L.suggest(e);
        return `<div class="ex">
          <span class="idx">${i + 1}</span>
          <div style="min-width:0"><strong>${esc(e.name)}</strong><div class="tiny muted">${e.sets} × ${e.repMin}–${e.repMax} reps · ${L.unitLabel(e.unit)}</div></div>
          <div class="row" style="gap:12px">
            <div class="target"><strong class="num">${sug.weight != null ? `${L.fmtKg(sug.weight)} kg` : '—'}</strong><span class="suggest ${sug.kind}">${sug.kind === 'up' ? '▲ Add weight' : sug.kind === 'baseline' ? 'Find baseline' : sug.kind === 'start' ? 'Starting weight' : sug.kind === 'hold' ? 'Hold weight' : `Aim for ${sug.reps} reps`}</span></div>
            <button class="btn icon ghost" data-edit="${e.id}" aria-label="Edit ${esc(e.name)}">${icon.edit}</button>
          </div>
        </div>`;
      }).join('')}
    </div>

    ${past.length ? `
    <section class="card section">
      <h3 style="margin-bottom:8px">Recent ${esc(day.name)} sessions</h3>
      <div class="list">${past.map(sessionRow).join('')}</div>
    </section>` : ''}`;

  el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { location.hash = `#train/${b.dataset.day}`; }));
  el.querySelector('[data-start]').addEventListener('click', () => W.start(day.id));
  el.querySelector('[data-resume]')?.addEventListener('click', () => W.open());
  el.querySelector('[data-add]').addEventListener('click', () => exerciseModal(day));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => exerciseModal(day, day.exercises.find((e) => e.id === b.dataset.edit))));
  el.querySelector('[data-guide]').addEventListener('click', () => openModal(`
    <h2>How progression works</h2>
    <div class="stack small">
      <p class="sub">Finn Fit uses <strong>double progression</strong>. Each exercise has a rep range, like 8–12.</p>
      <p class="sub">1. Keep the same weight and add reps each session.</p>
      <p class="sub">2. When <em>every</em> set reaches the top of the range, the target goes up by 2.5 kg and you start again at the bottom.</p>
      <p class="sub">3. If a set falls below the bottom of the range, hold the weight until it doesn't.</p>
      <p class="sub">Leave 1–2 reps in the tank on most sets. Form first, always.</p>
    </div>
    <div class="sheet-actions"><button class="btn primary" data-close>Got it</button></div>`));
}

function sessionRow(x) {
  const prs = L.sessionPRs(x);
  return `<div class="list-item">
    <div style="flex:1;min-width:0"><strong>${esc(x.name)}</strong> <span class="tiny muted">· ${L.fmtLong(x.date)}</span>
      <div class="tiny muted">${x.durationMin} min · ${L.totalSets(x)} sets · ${x.entries.map((e) => `${esc(e.name)} ${L.fmtKg(L.topWeightOf(e.sets))}×${Math.max(...e.sets.map((s) => s.r))}`).slice(0, 3).join(' · ')}${x.entries.length > 3 ? ' …' : ''}</div></div>
    ${prs.length ? `<span class="pill accent">🏅 ${prs.length}</span>` : ''}
  </div>`;
}

function exerciseModal(day, ex) {
  const e = ex || { name: '', sets: 3, repMin: 8, repMax: 12, unit: 'total', weight: null };
  openModal(`
    <h2>${ex ? 'Edit exercise' : `Add to ${esc(day.name)}`}</h2>
    <form class="form">
      <label class="field">Name<input type="text" name="name" required value="${esc(e.name)}" placeholder="e.g. Romanian deadlift"></label>
      <div class="cols three">
        <label class="field">Sets<input type="number" name="sets" min="1" max="10" value="${e.sets}"></label>
        <label class="field">Min reps<input type="number" name="repMin" min="1" value="${e.repMin}"></label>
        <label class="field">Max reps<input type="number" name="repMax" min="1" value="${e.repMax}"></label>
      </div>
      <div class="cols two">
        <label class="field">Weight is
          <select name="unit">
            <option value="total" ${e.unit === 'total' ? 'selected' : ''}>Total kg</option>
            <option value="each" ${e.unit === 'each' ? 'selected' : ''}>kg each (dumbbells)</option>
            <option value="stack" ${e.unit === 'stack' ? 'selected' : ''}>Stack kg (cable)</option>
          </select></label>
        <label class="field">Working weight (kg)<input type="number" name="weight" step="0.5" min="0" inputmode="decimal" value="${e.weight ?? ''}" placeholder="Leave blank to find it"></label>
      </div>
      <p class="warnline" data-warn hidden></p>
      <div class="sheet-actions">
        ${ex ? '<button type="button" class="btn danger ghost" data-del>Remove</button><span class="spacer"></span><button type="button" class="btn ghost" data-up>Move up</button>' : ''}
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`, (sheet, close) => {
    const form = sheet.querySelector('form');
    const warnEl = sheet.querySelector('[data-warn]');
    form.weight.addEventListener('input', () => {
      const w = L.weightWarning(form.name.value.trim(), num(form.weight.value));
      warnEl.hidden = !w; warnEl.textContent = w ? `⚠ ${w}` : '';
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const data = {
        name: form.name.value.trim(), sets: Math.max(1, num(form.sets.value) || 3),
        repMin: num(form.repMin.value) || 8, repMax: num(form.repMax.value) || 12,
        unit: form.unit.value, weight: num(form.weight.value),
      };
      if (!data.name) return;
      if (data.repMax < data.repMin) [data.repMin, data.repMax] = [data.repMax, data.repMin];
      update((s) => {
        const d = s.programme.find((x) => x.id === day.id);
        if (ex) Object.assign(d.exercises.find((x) => x.id === ex.id), data);
        else d.exercises.push({ id: uid(), ...data });
      });
      close(); rerender(); toast(ex ? 'Exercise updated' : 'Exercise added');
    });
    sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (await confirmDialog(`Remove ${ex.name}?`, 'Past sessions keep their logged sets.', 'Remove', true)) {
        update((s) => { const d = s.programme.find((x) => x.id === day.id); d.exercises = d.exercises.filter((x) => x.id !== ex.id); });
        rerender();
      }
    });
    sheet.querySelector('[data-up]')?.addEventListener('click', () => {
      update((s) => {
        const d = s.programme.find((x) => x.id === day.id);
        const i = d.exercises.findIndex((x) => x.id === ex.id);
        if (i > 0) [d.exercises[i - 1], d.exercises[i]] = [d.exercises[i], d.exercises[i - 1]];
      });
      close(); rerender();
    });
  });
}

/* ======================================================= NUTRITION */
export function nutrition(el) {
  const s = get();
  const t = L.today();
  const d = ui.foodDate || t;
  const tot = L.dayTotals(d);
  const items = s.foods[d] || [];
  const water = s.water[d] || 0;
  const mon = L.mondayOf(d);
  const week = Array.from({ length: 7 }, (_, i) => L.addDays(mon, i));

  el.innerHTML = `
    <div class="page-head row between wrap">
      <div><p class="eyebrow">${d === t ? 'Today' : L.fmtLong(d)}</p><h1>Nutrition</h1><p class="sub">Fuel your training. Keep logging simple.</p></div>
      <div class="row">
        <button class="btn icon" data-nav="-1" aria-label="Previous day">${icon.left}</button>
        <button class="btn sm" data-nav="0" ${d === t ? 'disabled' : ''}>Today</button>
        <button class="btn icon" data-nav="1" aria-label="Next day" ${d >= t ? 'disabled' : ''}>${icon.right}</button>
      </div>
    </div>

    <section class="card">
      <div class="rings">
        ${ring({ value: tot.kcal, max: s.settings.kcal, size: 132, stroke: 11, center: L.fmtInt(Math.abs(s.settings.kcal - tot.kcal)), sub: tot.kcal > s.settings.kcal ? 'kcal over' : 'kcal left' })}
        ${ring({ value: tot.protein, max: s.settings.protein, size: 132, stroke: 11, center: `${L.fmtInt(tot.protein)}g`, sub: `of ${s.settings.protein}g protein` })}
        <div class="macros">
          <div class="stat"><div class="v num">${L.fmtInt(tot.kcal)}<small>/ ${L.fmtInt(s.settings.kcal)} kcal</small></div><div class="l">eaten</div></div>
          ${macroBar('Protein', tot.protein, s.settings.protein, 'g')}
          <div class="row between small"><span>Carbs</span><span class="num muted">${L.fmtInt(tot.carbs)} g</span></div>
          <div class="row between small"><span>Fat</span><span class="num muted">${L.fmtInt(tot.fat)} g</span></div>
          ${tot.protein < s.settings.protein && tot.count ? `<p class="tiny" style="margin:0;color:var(--accent)">${L.fmtInt(s.settings.protein - tot.protein)} g protein to go</p>` : ''}
        </div>
      </div>
    </section>

    <section class="card section quicklog">
      <button class="ql-search" data-open="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span>Search any food or brand…</span></button>
      <div class="ql-actions">
        <button data-open="scan"><svg viewBox="0 0 24 24"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>Scan</button>
        <button data-open="photo"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Photo AI</button>
        <button data-open="voice"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Speak</button>
        <button data-open="manual"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>Manual</button>
      </div>
      ${F.recents(8).length ? `<div class="ql-chips">${F.recents(8).map((c) => `<button class="pill" data-qa="${esc(c.key)}">${c.fav ? '★ ' : ''}${esc(c.name.length > 26 ? `${c.name.slice(0, 24)}…` : c.name)}</button>`).join('')}</div>` : ''}
    </section>

    <div class="grid two section" style="align-items:start">
      <section class="card">
        <div class="card-head"><h3>Meals</h3><button class="btn sm primary" data-add="">${icon.plus} Add food</button></div>
        ${L.MEALS.map((m) => {
          const mi = items.filter((f) => f.meal === m);
          const lm = mi.length ? null : L.lastMeal(m, d);
          return `<div class="meal">
            <div class="row between"><strong>${m}</strong><span class="tiny muted num">${mi.length ? `${L.fmtInt(mi.reduce((n, f) => n + (+f.kcal || 0), 0))} kcal · ${L.fmtInt(mi.reduce((n, f) => n + (+f.protein || 0), 0))} g P` : ''}</span></div>
            ${mi.map((f) => `<div class="food"><div class="name">${esc(f.name)}<small>${esc(f.qty || '')}${f.protein != null ? ` · ${L.fmtInt(f.protein)} g protein` : ''}</small></div><span class="k">${L.fmtInt(f.kcal)}</span><button class="x-btn" data-rm="${f.id}" aria-label="Remove ${esc(f.name)}">×</button></div>`).join('')}
            <div class="row wrap" style="margin-top:6px;gap:6px">
              <button class="btn sm ghost" data-add="${m}">${icon.plus} Add</button>
              ${lm ? `<button class="btn sm ghost" data-repeat="${m}" data-from="${lm.date}">${icon.copy} Repeat ${L.fmtShort(lm.date)} (${L.fmtInt(lm.items.reduce((n, f) => n + (+f.kcal || 0), 0))} kcal)</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </section>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Hydration</h3><span class="num muted small">${(water / 1000).toFixed(2)} / ${(s.settings.water / 1000).toFixed(1)} L</span></div>
          <div class="water-glass" aria-hidden="true">${Array.from({ length: Math.ceil(s.settings.water / 250) }, (_, i) => `<span class="${i < Math.round(water / 250) ? 'f' : ''}"></span>`).join('')}</div>
          <div class="row wrap" style="margin-top:14px;gap:6px">
            <button class="btn sm" data-water="-250">−250</button>
            <button class="btn sm" data-water="250">+250 ml</button>
            <button class="btn sm" data-water="500">+500 ml</button>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>This week · calories</h3><span class="tiny muted">dashed = target</span></div>
          ${chart({ type: 'bar', label: 'Calories per day this week', height: 150, target: s.settings.kcal, fmt: L.fmtInt,
            data: week.map((k) => { const v = L.dayTotals(k).kcal; return { label: L.dayShort(L.weekdayOf(k)), value: v || null, dim: k !== d, tip: `${L.fmtShort(k)}: ${v ? `${L.fmtInt(v)} kcal` : 'nothing logged'}` }; }) })}
        </section>
        <section class="card">
          <div class="card-head"><h3>This week · protein</h3><span class="tiny muted">target ${s.settings.protein} g</span></div>
          ${chart({ type: 'bar', label: 'Protein per day this week', height: 130, target: s.settings.protein, fmt: (v) => `${L.fmtInt(v)}`,
            data: week.map((k) => { const v = L.dayTotals(k).protein; return { label: L.dayShort(L.weekdayOf(k)), value: v || null, dim: k !== d, tip: `${L.fmtShort(k)}: ${v ? `${L.fmtInt(v)} g protein` : 'nothing logged'}` }; }) })}
        </section>
        <section class="card">
          <div class="card-head"><h3>My foods</h3><span class="tiny muted">${s.library.length} saved · ★ = favourite</span></div>
          <div class="list">${F.recents(10).map((c) => {
            const p = c.per100 ? F.portion(c, c.serving ? 1 : 100, c.serving ? 'serving' : 'g') : F.portion(c, 1, 'serving');
            return `<div class="list-item small">
              <button class="star-btn ${c.fav ? 'on' : ''}" data-star="${c.id}" aria-label="${c.fav ? 'Unfavourite' : 'Favourite'} ${esc(c.name)}">★</button>
              <div style="flex:1;min-width:0">${esc(c.name)}<div class="tiny muted">${esc(p.qty)} · ${p.kcal} kcal · ${L.fmtInt(p.protein)} g P</div></div>
              <button class="x-btn" data-unlib="${c.id}" aria-label="Delete ${esc(c.name)} from my foods">×</button></div>`;
          }).join('') || '<p class="tiny muted">Foods you log are saved here automatically.</p>'}</div>
        </section>
      </div>
    </div>`;

  el.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.nav;
    ui.foodDate = n === 0 ? t : L.addDays(d, n) > t ? t : L.addDays(d, n);
    rerender();
  }));
  const openSheet = (opts) => openAddFood({ date: d, onChange: rerender, ...opts });
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openSheet({ meal: b.dataset.add || undefined })));
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openSheet({ start: b.dataset.open })));
  el.querySelectorAll('[data-qa]').forEach((b) => b.addEventListener('click', () => {
    const c = F.myFoods().find((x) => x.key === b.dataset.qa);
    if (c) openSheet({ start: c });
  }));
  el.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', () => {
    update((st) => { const f = st.library.find((x) => x.id === b.dataset.star); if (f) f.fav = !f.fav; });
    rerender();
  }));
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    update((st) => { st.foods[d] = st.foods[d].filter((f) => f.id !== b.dataset.rm); });
    rerender();
  }));
  el.querySelectorAll('[data-repeat]').forEach((b) => b.addEventListener('click', () => {
    const src = (s.foods[b.dataset.from] || []).filter((f) => f.meal === b.dataset.repeat);
    update((st) => { st.foods[d] = [...(st.foods[d] || []), ...src.map((f) => ({ ...f, id: uid() }))]; });
    toast(`${b.dataset.repeat} copied from ${L.fmtShort(b.dataset.from)}`);
    rerender();
  }));
  el.querySelectorAll('[data-water]').forEach((b) => b.addEventListener('click', () => {
    update((st) => { st.water[d] = Math.max(0, (st.water[d] || 0) + +b.dataset.water); });
    rerender();
  }));
  el.querySelectorAll('[data-unlib]').forEach((b) => b.addEventListener('click', () => {
    update((st) => { st.library = st.library.filter((f) => f.id !== b.dataset.unlib); });
    rerender();
  }));
}

/* ======================================================= PROGRESS */
export function progress(el) {
  const s = get();
  const t = L.today();
  const names = [...new Set([...s.programme.flatMap((d) => d.exercises.map((e) => e.name)), ...s.sessions.flatMap((x) => x.entries.map((e) => e.name))])];
  if (!ui.lift || !names.includes(ui.lift)) ui.lift = names.find((n) => L.history(n).length) || names[0];
  const cutoff = ui.range === 0 ? '0000' : L.addDays(t, -7 * ui.range);
  const hist = L.history(ui.lift).filter((h) => h.date >= cutoff);
  const pts = hist.map((h) => ({ label: L.fmtShort(h.date), y: L.round(L.bestE1rmOf(h.sets)), tip: `${L.fmtShort(h.date)}: est. 1RM ${L.fmtKg(L.round(L.bestE1rmOf(h.sets)))} kg · best set ${h.sets.map((x) => `${L.fmtKg(x.w)}×${x.r}`).sort().at(-1)}` }));
  const first = pts[0]?.y, lastP = pts.at(-1)?.y;
  const change = first && lastP ? ((lastP - first) / first) * 100 : null;
  const allTimeBest = L.history(ui.lift).reduce((b, h) => Math.max(b, L.bestE1rmOf(h.sets)), 0);

  const mon = L.mondayOf(t);
  const weeks = Array.from({ length: 8 }, (_, i) => L.addDays(mon, -7 * (7 - i)));
  const weights = [...s.weights].sort((a, b) => a.date.localeCompare(b.date));
  const hw = ui.histWeek || mon;
  const histSessions = L.sessionsInWeek(hw).sort((a, b) => b.endedAt - a.endedAt);

  const board = names.map((n) => {
    const h = L.history(n);
    if (!h.length) return null;
    const best = h.reduce((b, x) => { const e = L.bestE1rmOf(x.sets); return e > b.e ? { e, date: x.date } : b; }, { e: 0 });
    return { n, ...best, top: Math.max(...h.map((x) => L.topWeightOf(x.sets))) };
  }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = `
    <div class="page-head"><p class="eyebrow">Week ${L.weekNumber(t)}</p><h1>Progress</h1><p class="sub">Strength over time.</p></div>

    <section class="card">
      <div class="row between wrap" style="margin-bottom:14px;gap:12px">
        <select data-lift style="max-width:320px" aria-label="Exercise">${names.map((n) => `<option ${n === ui.lift ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <div class="seg" role="group" aria-label="Time range">${[[8, '8 wk'], [12, '12 wk'], [26, '26 wk'], [0, 'All']].map(([v, l]) => `<button data-range="${v}" class="${ui.range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <div class="grid three" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
        <div class="stat"><div class="v num">${lastP ? L.fmtKg(lastP) : '—'}<small>kg</small></div><div class="l">est. 1RM now</div></div>
        <div class="stat"><div class="v num" style="${change > 0 ? 'color:var(--accent)' : ''}">${change == null || pts.length < 2 ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}</div><div class="l">change in range</div></div>
        <div class="stat"><div class="v num">${allTimeBest ? L.fmtKg(L.round(allTimeBest)) : '—'}<small>kg</small></div><div class="l">all-time best</div></div>
      </div>
      ${pts.length ? chart({ type: 'line', label: `Estimated one-rep max for ${ui.lift}`, height: 200, points: pts, fmt: (v) => L.fmtKg(Math.round(v)) })
        : '<div class="chart-empty" style="height:160px">Log this exercise in a workout to start its chart.</div>'}
      <p class="tiny muted" style="margin:10px 0 0">Estimated 1-rep max (Epley) from your best set each session. It lets heavier-for-fewer and lighter-for-more compare fairly.</p>
    </section>

    <div class="grid two section">
      <section class="card">
        <div class="card-head"><h3>Sessions by week</h3><span class="tiny muted">${s.sessions.length} all time · ${L.fmtInt(s.sessions.reduce((n, x) => n + x.durationMin, 0))} min</span></div>
        ${chart({ type: 'bar', label: 'Completed sessions per week, last 8 weeks', height: 150, target: s.programme.length, max: Math.max(s.programme.length, 1), fmt: (v) => `${Math.round(v)}`,
          data: weeks.map((w) => { const c = L.sessionsInWeek(w).length; return { label: L.fmtShort(w), value: c || null, tip: `Week of ${L.fmtShort(w)}: ${c} session${c === 1 ? '' : 's'}` }; }) })}
      </section>
      <section class="card">
        <div class="card-head"><h3>Bodyweight</h3><button class="btn sm" data-weigh>${icon.plus} Log weigh-in</button></div>
        ${weights.length >= 2 ? chart({ type: 'line', label: 'Bodyweight trend', height: 150, points: weights.slice(-20).map((w) => ({ label: L.fmtShort(w.date), y: w.kg, tip: `${L.fmtShort(w.date)}: ${L.fmtKg(w.kg)} kg` })), fmt: (v) => v.toFixed(1) })
          : `<div class="chart-empty" style="height:120px">${weights.length ? `${L.fmtKg(weights[0].kg)} kg on ${L.fmtShort(weights[0].date)} — log another to see a trend` : 'No weigh-ins yet'}</div>`}
        <p class="tiny muted" style="margin:10px 0 0">Weigh in under the same conditions each time and judge the weekly trend, not single days.</p>
      </section>
    </div>

    <section class="card section">
      <div class="card-head"><h3>Best lifts</h3><span class="tiny muted">most recent first</span></div>
      ${board.length ? `<div class="list">${board.map((b) => `<div class="list-item"><div style="flex:1;min-width:0"><strong class="small">${esc(b.n)}</strong><div class="tiny muted">heaviest ${L.fmtKg(b.top)} kg · best on ${L.fmtShort(b.date)}</div></div><span class="num"><strong>${L.fmtKg(L.round(b.e))}</strong> <span class="tiny muted">kg e1RM</span></span></div>`).join('')}</div>`
        : '<p class="sub small">Your best lifts appear here after your first workout.</p>'}
    </section>

    <section class="card section">
      <div class="card-head">
        <h3>Session history</h3>
        <div class="row"><button class="btn icon" data-hw="-1" aria-label="Previous week">${icon.left}</button><span class="small muted">${L.fmtShort(hw)} – ${L.fmtShort(L.addDays(hw, 6))}</span><button class="btn icon" data-hw="1" aria-label="Next week" ${hw >= mon ? 'disabled' : ''}>${icon.right}</button></div>
      </div>
      ${histSessions.length ? `<div class="list">${histSessions.map(sessionRow).join('')}</div>` : '<p class="sub small">No sessions this week.</p>'}
    </section>`;

  el.querySelector('[data-lift]').addEventListener('change', (e) => { ui.lift = e.target.value; rerender(); });
  el.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { ui.range = +b.dataset.range; rerender(); }));
  el.querySelectorAll('[data-hw]').forEach((b) => b.addEventListener('click', () => { ui.histWeek = L.addDays(hw, 7 * +b.dataset.hw); rerender(); }));
  el.querySelector('[data-weigh]').addEventListener('click', () => openModal(`
    <h2>Log weigh-in</h2>
    <form class="form">
      <div class="cols two">
        <label class="field">Date<input type="date" name="date" value="${t}" max="${t}"></label>
        <label class="field">Weight (kg)<input type="number" name="kg" step="0.1" min="20" max="400" inputmode="decimal" required></label>
      </div>
      <div class="sheet-actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div>
    </form>`, (sheet, close) => {
    const f = sheet.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const kg = num(f.kg.value);
      if (!kg) return;
      update((st) => { st.weights = st.weights.filter((w) => w.date !== f.date.value); st.weights.push({ id: uid(), date: f.date.value, kg }); });
      close(); rerender(); toast('Weigh-in saved');
    });
  }));
}

/* ======================================================= ACTIVITY */
export function activity(el) {
  const s = get();
  const t = L.today();
  const d = ui.actDate || t;
  const a = s.activity[d] || {};
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(d, i - 6));
  const avg = L.sleepAverage(d);
  const steps = days.map((k) => s.activity[k]?.steps).filter((v) => v != null);

  el.innerHTML = `
    <div class="page-head row between wrap">
      <div><p class="eyebrow">${d === t ? 'Today' : L.fmtLong(d)}</p><h1>Activity &amp; sleep</h1><p class="sub">Recovery is where the gains are made.</p></div>
      <div class="row">
        <button class="btn icon" data-nav="-1" aria-label="Previous day">${icon.left}</button>
        <button class="btn sm" data-nav="0" ${d === t ? 'disabled' : ''}>Today</button>
        <button class="btn icon" data-nav="1" aria-label="Next day" ${d >= t ? 'disabled' : ''}>${icon.right}</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h3>Log ${d === t ? 'today' : L.fmtShort(d)}</h3><span class="tiny muted">saves as you type</span></div>
      <form class="form" data-act>
        <div class="cols">
          <label class="field">Steps<input type="number" name="steps" min="0" inputmode="numeric" value="${a.steps ?? ''}" placeholder="—"></label>
          <label class="field">Sleep h<input type="number" name="sh" min="0" max="16" inputmode="numeric" value="${a.sleepMin != null ? Math.floor(a.sleepMin / 60) : ''}" placeholder="—"></label>
          <label class="field">Sleep min<input type="number" name="sm" min="0" max="59" inputmode="numeric" value="${a.sleepMin != null ? Math.round(a.sleepMin % 60) : ''}" placeholder="—"></label>
          <label class="field">Active kcal<input type="number" name="active" min="0" inputmode="numeric" value="${a.activeKcal ?? ''}" placeholder="—"></label>
        </div>
      </form>
      <p class="tiny muted" style="margin:12px 0 0">Sleep belongs to the morning you woke up. Copy the numbers from the Health app on your iPhone. A web app can't read Apple Health directly.</p>
    </section>

    <div class="grid two section">
      <section class="card">
        <div class="card-head"><h3>Sleep · 7 nights</h3><span class="small muted num">${avg.avg != null ? `avg ${L.fmtSleep(avg.avg)} · ${avg.count}/7` : 'no data'}</span></div>
        ${chart({ type: 'bar', label: 'Hours of sleep, last 7 nights', height: 160, target: 8, max: 10, fmt: (v) => `${Math.round(v)}h`,
          data: days.map((k) => { const m = s.activity[k]?.sleepMin; return { label: L.dayShort(L.weekdayOf(k)), value: m != null ? m / 60 : null, tip: `${L.fmtShort(k)}: ${m != null ? L.fmtSleep(m) : 'no record'}` }; }) })}
        <p class="tiny muted" style="margin:8px 0 0">Dashed line = 8 hours. Missing nights are left blank and excluded from the average.</p>
      </section>
      <section class="card">
        <div class="card-head"><h3>Steps · 7 days</h3><span class="small muted num">${steps.length ? `avg ${L.fmtInt(steps.reduce((x, y) => x + y, 0) / steps.length)}` : 'no data'}</span></div>
        ${chart({ type: 'bar', label: 'Steps, last 7 days', height: 160, target: 8000, fmt: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`),
          data: days.map((k) => { const v = s.activity[k]?.steps; return { label: L.dayShort(L.weekdayOf(k)), value: v ?? null, tip: `${L.fmtShort(k)}: ${v != null ? `${L.fmtInt(v)} steps` : 'no record'}` }; }) })}
        <p class="tiny muted" style="margin:8px 0 0">Dashed line = 8,000 steps.</p>
      </section>
    </div>`;

  el.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.nav;
    ui.actDate = n === 0 ? t : L.addDays(d, n) > t ? t : L.addDays(d, n);
    rerender();
  }));
  const form = el.querySelector('[data-act]');
  form.addEventListener('input', () => {
    const sh = num(form.sh.value), sm = num(form.sm.value);
    update((st) => {
      const rec = { ...(st.activity[d] || {}) };
      rec.steps = num(form.steps.value);
      rec.activeKcal = num(form.active.value);
      rec.sleepMin = sh == null && sm == null ? null : (sh || 0) * 60 + (sm || 0);
      Object.keys(rec).forEach((k) => rec[k] == null && delete rec[k]);
      if (Object.keys(rec).length) st.activity[d] = rec; else delete st.activity[d];
    });
  });
  form.addEventListener('change', () => rerender()); // rerender keeps scroll + focus
}

/* ======================================================= SETTINGS */
export function settings(el) {
  const s = get();
  el.innerHTML = `
    <div class="page-head"><h1>Settings</h1></div>
    <div class="grid two" style="align-items:start">
      <section class="card">
        <h3>Your daily targets</h3>
        <p class="sub small" style="margin-bottom:14px">Starting points, not prescriptions. Check your weight trend and recovery before changing them.</p>
        <form class="form" data-targets>
          <label class="field">Your name<input type="text" name="name" value="${esc(s.settings.name)}"></label>
          <div class="cols two">
            <label class="field">Calories (kcal)<input type="number" name="kcal" min="1000" step="50" value="${s.settings.kcal}"></label>
            <label class="field">Protein (g)<input type="number" name="protein" min="0" step="5" value="${s.settings.protein}"></label>
            <label class="field">Water (ml)<input type="number" name="water" min="0" step="250" value="${s.settings.water}"></label>
            <label class="field">Rest timer (sec)<input type="number" name="restSec" min="15" step="15" value="${s.settings.restSec}"></label>
          </div>
          <label class="field">Programme start date<input type="date" name="startDate" value="${s.settings.startDate}"></label>
          <label class="check"><input type="checkbox" name="cleared" ${s.settings.cleared ? 'checked' : ''}> I'm ready for resistance training and have clearance for any recent injury.</label>
          <p class="tiny muted" style="margin:0">If your hand or another injury is still healing, adapt the plan with your physio before loading it.</p>
        </form>
      </section>

      <div class="stack">
        <section class="card">
          <h3>Backups</h3>
          <p class="sub small" style="margin-bottom:6px">Your data is saved on this device only. Export a copy regularly, and before you restore one.</p>
          <p class="tiny muted" style="margin:0 0 14px">Last backup: ${backupAge() == null ? 'never' : backupAge() === 0 ? 'today' : `${backupAge()} day${backupAge() === 1 ? '' : 's'} ago`}</p>
          <div class="row wrap">
            <button class="btn primary" data-export>Export backup</button>
            <label class="btn">Restore…<input type="file" accept="application/json,.json" data-import hidden></label>
          </div>
        </section>
        <section class="card">
          <h3>AI food estimates</h3>
          <p class="sub small" style="margin-bottom:12px">Photo AI and full-sentence voice logging use Claude through your own Anthropic API key. Get one at console.anthropic.com → API keys. It stays on this device and is never included in backups. Each estimate costs roughly 2–4 cents.</p>
          ${F.aiKey() ? `
            <p class="small" style="margin:0 0 10px">✓ Key saved (…${esc(F.aiKey().slice(-4))})</p>
            <button class="btn danger" data-aikey-rm>Remove key</button>`
          : `<div class="row" style="gap:8px">
              <input type="password" data-aikey placeholder="sk-ant-…" autocomplete="off" aria-label="Anthropic API key">
              <button class="btn primary" data-aikey-save>Save</button>
            </div>`}
        </section>
        <section class="card">
          <h3>Install Finn Fit</h3>
          <p class="sub small">On iPhone, open this page in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. It opens full-screen like an app.</p>
        </section>
        <section class="card">
          <h3>Start over</h3>
          <p class="sub small" style="margin-bottom:12px">Erase all sessions, food and settings on this device and reload your original programme.</p>
          <button class="btn danger" data-reset>Reset all data</button>
        </section>
      </div>
    </div>`;

  const f = el.querySelector('[data-targets]');
  f.addEventListener('input', () => {
    update((st) => {
      st.settings.name = f.name.value.trim() || 'there';
      for (const k of ['kcal', 'protein', 'water', 'restSec']) { const v = num(f[k].value); if (v != null && v > 0) st.settings[k] = v; }
      if (f.startDate.value) st.settings.startDate = f.startDate.value;
      st.settings.cleared = f.cleared.checked;
    });
  });
  el.querySelector('[data-export]').addEventListener('click', () => { downloadBackup(); rerender(); });
  el.querySelector('[data-aikey-save]')?.addEventListener('click', () => {
    const k = el.querySelector('[data-aikey]').value.trim();
    if (!k.startsWith('sk-ant-')) { toast('That doesn\'t look like an Anthropic key (starts with sk-ant-)'); return; }
    F.setAiKey(k); toast('AI estimates switched on'); rerender();
  });
  el.querySelector('[data-aikey-rm]')?.addEventListener('click', async () => {
    if (await confirmDialog('Remove API key?', 'Photo AI and sentence-style voice logging will switch off until you add a key again.', 'Remove', true)) { F.setAiKey(''); rerender(); }
  });
  el.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmDialog('Restore this backup?', 'A Finn Fit backup replaces everything on this device. A backup from the old Finn Fit is merged in.', 'Restore'))) { e.target.value = ''; return; }
    try {
      const rep = importJSON(await file.text());
      if (rep) {
        openModal(`<h2>Old data imported</h2>
          <p class="sub">${rep.sessions} workouts · ${rep.foods} food entries · ${rep.library} saved foods · ${rep.activityDays} activity days · ${rep.sleepNights} sleep nights${rep.weights ? ` · ${rep.weights} weigh-ins` : ''}</p>
          ${rep.fixes.length ? `<p class="small" style="margin-top:12px">Fixed likely typos:</p><ul class="small muted">${rep.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
          <div class="sheet-actions"><button class="btn primary" data-close>Done</button></div>`);
      } else toast('Backup restored');
      rerender();
    } catch (err) { toast(err.message || 'Could not read that file'); }
  });
  el.querySelector('[data-reset]').addEventListener('click', async () => {
    if (await confirmDialog('Reset all data?', 'This erases everything on this device. Export a backup first if you want to keep it.', 'Reset everything', true)) {
      resetAll(); toast('Reset complete'); rerender();
    }
  });
}

/* ======================================================= sidebar week */
export function sideWeek(el) {
  const mon = L.mondayOf(L.today());
  el.innerHTML = `<p class="eyebrow" style="margin-bottom:10px">Your week</p>${weekStrip(mon)}`;
}
