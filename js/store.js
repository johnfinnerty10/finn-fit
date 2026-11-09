// Finn Fit — state, persistence and seed data.
// Everything lives in one JSON object in localStorage. Export/import in Settings.

import { isLegacy, mergeLegacy } from './legacy.js';

const KEY = 'finnfit.v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const ex = (name, sets, repMin, repMax, unit, weight = null) => ({
  id: uid(), name, sets, repMin, repMax, unit, weight,
});

function seed() {
  return {
    version: 1,
    settings: {
      name: 'John',
      kcal: 2600,
      protein: 160,
      water: 2500,
      startDate: '2026-11-02',
      cleared: true,
      restSec: 120,
    },
    programme: [
      {
        id: 'upperA', weekday: 1, name: 'Upper A', focus: 'Chest · back · shoulders', duration: '55–70 min',
        exercises: [
          ex('Barbell bench press', 3, 6, 10, 'total', 80),
          ex('Lat pulldown', 3, 8, 12, 'total', 70),        // live app showed 700 kg — corrected
          ex('Incline dumbbell press', 2, 8, 12, 'each', 22.5),
          ex('Seated cable row', 2, 8, 12, 'total', 55),
          ex('Dumbbell lateral raise', 2, 12, 15, 'each', 12.5),
          ex('Tricep push down', 2, 10, 15, 'stack', 50),   // live app showed 500 kg — corrected
          ex('Pull-ups', 3, 8, 12, 'total'),
        ],
      },
      {
        id: 'lowerA', weekday: 2, name: 'Lower A', focus: 'Quads · hamstrings · core', duration: '55–70 min',
        exercises: [
          ex('Back squat', 3, 6, 10, 'total', 70),
          ex('Leg extension', 3, 10, 15, 'total', 72.5),
          ex('Seated leg curl', 3, 10, 15, 'total', 52),
          ex('Seated calf raise', 3, 10, 15, 'total', 35),
          ex('Cable crunch', 2, 10, 15, 'stack'),
        ],
      },
      {
        id: 'upperB', weekday: 4, name: 'Upper B', focus: 'Back · chest · arms', duration: '55–70 min',
        exercises: [
          ex('Dumbbell shoulder press', 3, 8, 12, 'each', 25),
          ex('Chest-supported row', 3, 8, 12, 'each', 45),
          ex('Machine chest press', 3, 8, 12, 'total', 27.5),
          ex('Neutral-grip pulldown', 2, 8, 12, 'total', 65),
          ex('Cable lateral raise', 2, 12, 15, 'stack', 14),
          ex('Incline dumbbell curl', 3, 10, 15, 'each', 15),
        ],
      },
      {
        id: 'lowerB', weekday: 6, name: 'Lower B', focus: 'Glutes · legs · core', duration: '55–70 min',
        exercises: [
          ex('Hack squat', 3, 8, 12, 'total'),
          ex('Hip thrust', 3, 8, 12, 'total'),
          ex('Dumbbell reverse lunge', 2, 8, 12, 'each'),
          ex('Lying leg curl', 2, 10, 15, 'total'),
          ex('Seated calf raise', 3, 10, 15, 'total', 35),
          ex('Cable woodchop', 2, 10, 15, 'stack'),
        ],
      },
    ],
    sessions: [],          // finished workouts
    activeWorkout: null,   // in-progress workout (survives refresh)
    foods: {},             // { 'YYYY-MM-DD': [ {id, meal, name, qty, kcal, protein, carbs, fat} ] }
    library: [             // saved foods (macros are estimates — edit to match your labels)
      { id: uid(), name: 'Whole milk (Tesco)', qty: '500 ml', kcal: 330, protein: 17, carbs: 24, fat: 18 },
      { id: uid(), name: 'Sirloin steak (cooked)', qty: '220 g', kcal: 484, protein: 64, carbs: 0, fat: 25 },
      { id: uid(), name: 'Sourdough bread', qty: '2 slices (80 g)', kcal: 200, protein: 7, carbs: 40, fat: 1 },
      { id: uid(), name: 'Eggs', qty: '4 eggs', kcal: 288, protein: 25, carbs: 1, fat: 20 },
      { id: uid(), name: 'Bacon medallions (raw)', qty: '2 medallions (60 g)', kcal: 72, protein: 13, carbs: 0, fat: 2 },
      { id: uid(), name: 'Chicken thigh (cooked, skinless)', qty: '4 thighs (360 g)', kcal: 752, protein: 90, carbs: 0, fat: 42 },
    ],
    water: {},             // { date: ml }
    weights: [],           // [{ id, date, kg }]
    activity: {},          // { date: { steps, sleepMin, activeKcal } }
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('Could not read saved data', e); }
  return seed();
}

function migrate(s) {
  const base = seed();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
}

export function get() { return state; }

let saveTimer = null;
export function update(fn) {
  fn(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 150);
  listeners.forEach((l) => l(state));
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    setSaveStatus('All changes saved', true);
  } catch (e) {
    setSaveStatus('Not saved — export a backup', false);
  }
}

function setSaveStatus(text, ok) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('bad', !ok);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

/**
 * Restore a backup. A new-format backup replaces everything; a backup from the
 * old ChatGPT-hosted Finn Fit is merged in (returns a report of what came across).
 */
export function importJSON(text) {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  if (isLegacy(parsed)) {
    const report = mergeLegacy(state, parsed);
    persist();
    listeners.forEach((l) => l(state));
    return report;
  }
  if (!parsed || !Array.isArray(parsed.programme)) throw new Error('This file is not a Finn Fit backup.');
  state = migrate(parsed);
  persist();
  listeners.forEach((l) => l(state));
  return null;
}

export function resetAll() {
  state = seed();
  persist();
  listeners.forEach((l) => l(state));
}
