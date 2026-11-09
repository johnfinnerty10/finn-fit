// Finn Fit — pure helpers: dates, progression, strength maths, totals.
import { get } from './store.js';

/* ---------- dates (local time, keys are YYYY-MM-DD) ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => key(new Date());
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
export const mondayOf = (k) => { const d = parse(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return key(d); };
export const weekdayOf = (k) => parse(k).getDay(); // 0 Sun … 6 Sat
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayShort = (wd) => DAY[wd];
export const dayLong = (wd) => DAY_LONG[wd];
export const fmtShort = (k) => { const d = parse(k); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export const fmtLong = (k) => { const d = parse(k); return `${DAY_LONG[d.getDay()]}, ${d.getDate()} ${MON_LONG[d.getMonth()]}`; };
export const weekNumber = (k) => {
  const start = mondayOf(get().settings.startDate || k);
  const diff = Math.round((parse(mondayOf(k)) - parse(start)) / 864e5);
  return Math.floor(diff / 7) + 1;
};
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/* ---------- numbers ---------- */
export const round = (n, step = 0.5) => Math.round(n / step) * step;
export const fmtKg = (n) => (n == null ? '—' : `${+n.toFixed(2)}`.replace(/\.0+$/, ''));
export const fmtInt = (n) => (n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('en-GB'));
export const fmtSleep = (min) => (min == null ? '—' : `${Math.floor(min / 60)}h ${pad(Math.round(min % 60))}m`);
export const unitLabel = (u) => ({ total: 'total kg', each: 'kg each', stack: 'stack kg' }[u] || 'kg');

/* ---------- strength ---------- */
// Epley estimated one-rep max. Above 12 reps the estimate gets loose, but it's
// consistent, which is what matters for a trend line.
export const e1rm = (w, r) => (!w || !r ? 0 : r === 1 ? w : w * (1 + r / 30));

const doneSets = (entry) => (entry?.sets || []).filter((s) => s.done && s.w > 0 && s.r > 0);

/** All logged entries for an exercise name, oldest first: [{date, sets, sessionId}] */
export function history(name) {
  const out = [];
  for (const s of [...get().sessions].sort((a, b) => a.date.localeCompare(b.date) || a.endedAt - b.endedAt)) {
    for (const e of s.entries) {
      if (e.name === name) {
        const sets = doneSets(e);
        if (sets.length) out.push({ date: s.date, sets, sessionId: s.id });
      }
    }
  }
  return out;
}

export const lastPerformance = (name) => history(name).at(-1) || null;
export const bestE1rmOf = (sets) => Math.max(0, ...sets.map((s) => e1rm(s.w, s.r)));
export const topWeightOf = (sets) => Math.max(0, ...sets.map((s) => s.w));

const INCREMENT = { total: 2.5, each: 2.5, stack: 2.5 };

/**
 * Double progression: work inside the rep range at one weight. When every
 * working set reaches the top of the range, add weight and drop to the bottom.
 */
export function suggest(exercise) {
  const last = lastPerformance(exercise.name);
  if (!last) {
    if (exercise.weight == null) {
      return { kind: 'baseline', weight: null, reps: exercise.repMin, label: 'Find baseline', detail: 'First session — pick a weight you could lift for a few more reps.' };
    }
    return { kind: 'start', weight: exercise.weight, reps: exercise.repMin, label: `${fmtKg(exercise.weight)} kg × ${exercise.repMin}–${exercise.repMax}`, detail: 'Starting weight.' };
  }
  const top = topWeightOf(last.sets);
  const atTop = last.sets.filter((s) => s.w === top);
  const minReps = Math.min(...atTop.map((s) => s.r));
  if (atTop.length >= exercise.sets && minReps >= exercise.repMax) {
    const w = top + (INCREMENT[exercise.unit] || 2.5);
    return { kind: 'up', weight: w, reps: exercise.repMin, label: `${fmtKg(w)} kg × ${exercise.repMin}+`, detail: `You hit ${exercise.repMax} on every set — add weight.` };
  }
  if (minReps < exercise.repMin) {
    return { kind: 'hold', weight: top, reps: exercise.repMin, label: `${fmtKg(top)} kg × ${exercise.repMin}+`, detail: `Stay at ${fmtKg(top)} kg until every set reaches ${exercise.repMin}.` };
  }
  const reps = Math.min(exercise.repMax, minReps + 1);
  return { kind: 'reps', weight: top, reps, label: `${fmtKg(top)} kg × ${reps}`, detail: `Beat last time by a rep (last: ${last.sets.map((s) => s.r).join(', ')}).` };
}

/** Flag obviously mistyped weights (e.g. 700 instead of 70). Returns a warning or null. */
export function weightWarning(name, w) {
  if (!w) return null;
  if (w > 400) return `${fmtKg(w)} kg looks too heavy — check for a typo.`;
  const prev = history(name).flatMap((h) => h.sets.map((s) => s.w));
  const ex = get().programme.flatMap((d) => d.exercises).find((e) => e.name === name);
  const ref = Math.max(0, ...prev, ex?.weight || 0);
  if (ref && w > ref * 2 && w - ref >= 20) return `${fmtKg(w)} kg is more than double your usual ${fmtKg(ref)} kg — typo?`;
  return null;
}

/** Personal bests set in a session compared with everything before it. */
export function sessionPRs(session) {
  const prs = [];
  for (const e of session.entries) {
    const sets = doneSets(e);
    if (!sets.length) continue;
    const prior = history(e.name).filter((h) => h.sessionId !== session.id && h.date <= session.date);
    if (!prior.length) continue; // first time isn't a PR, it's a baseline
    const prevE = Math.max(...prior.map((h) => bestE1rmOf(h.sets)));
    const prevW = Math.max(...prior.map((h) => topWeightOf(h.sets)));
    const nowE = bestE1rmOf(sets);
    const nowW = topWeightOf(sets);
    if (nowW > prevW) prs.push({ name: e.name, text: `Heaviest: ${fmtKg(nowW)} kg (was ${fmtKg(prevW)})` });
    else if (nowE > prevE + 0.01) prs.push({ name: e.name, text: `Est. 1RM ${fmtKg(round(nowE))} kg (was ${fmtKg(round(prevE))})` });
  }
  return prs;
}

/* ---------- week / programme ---------- */
export function sessionsInWeek(monday) {
  const end = addDays(monday, 6);
  return get().sessions.filter((s) => s.date >= monday && s.date <= end);
}

export function nextSession() {
  const s = get();
  const done = new Set(sessionsInWeek(mondayOf(today())).map((x) => x.dayId));
  const ordered = [...s.programme].sort((a, b) => a.weekday - b.weekday);
  const todays = (weekdayOf(today()) + 6) % 7; // 0 = Monday
  // Prefer today's or the next scheduled session that isn't done; else any undone.
  const sched = (d) => (d.weekday + 6) % 7;
  return ordered.find((d) => !done.has(d.id) && sched(d) >= todays)
    || ordered.find((d) => !done.has(d.id))
    || null;
}

export function totalSets(session) {
  return session.entries.reduce((n, e) => n + doneSets(e).length, 0);
}

export function sessionVolume(session) {
  return session.entries.reduce((n, e) => n + doneSets(e).reduce((m, s) => m + s.w * s.r, 0), 0);
}

/* ---------- nutrition ---------- */
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export function dayTotals(k) {
  const items = get().foods[k] || [];
  return items.reduce((t, f) => ({
    kcal: t.kcal + (+f.kcal || 0),
    protein: t.protein + (+f.protein || 0),
    carbs: t.carbs + (+f.carbs || 0),
    fat: t.fat + (+f.fat || 0),
    count: t.count + 1,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 });
}

/** Most recent earlier day that has this meal logged: { date, items } */
export function lastMeal(meal, before) {
  const days = Object.keys(get().foods).filter((d) => d < before).sort().reverse();
  for (const d of days) {
    const items = get().foods[d].filter((f) => f.meal === meal);
    if (items.length) return { date: d, items };
  }
  return null;
}

/* ---------- activity ---------- */
export function sleepAverage(endKey, nights = 7) {
  const vals = [];
  for (let i = 0; i < nights; i++) {
    const v = get().activity[addDays(endKey, -i)]?.sleepMin;
    if (v != null) vals.push(v);
  }
  return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, count: vals.length };
}
