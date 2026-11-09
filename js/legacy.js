// Finn Fit — import data from the original ChatGPT-hosted app.
// Accepts either the raw /api/journal response ({ data, revision }) or its `data` object,
// which is also what the old app's "Export backup" produced.

const UNIT = { 'total kg': 'total', 'kg each': 'each', 'stack kg': 'stack' };

export function isLegacy(obj) {
  const d = obj?.data ?? obj;
  return !!d && Array.isArray(d.plan) && Array.isArray(d.sessions) && typeof d.plan[0]?.weekday === 'string';
}

/** Fix weights typed with an extra zero: a set exactly 10× another set of the same exercise. */
function fixTypos(name, logs, fixes, date) {
  const base = logs.map((l) => l.kg).filter((k) => k > 0);
  return logs.map((l) => {
    if (l.kg > 0 && base.some((k) => k * 10 === l.kg)) {
      fixes.push(`${date} ${name}: ${l.kg} kg → ${l.kg / 10} kg`);
      return { ...l, kg: l.kg / 10 };
    }
    return l;
  });
}

/**
 * Merge legacy data into `state` (mutates). Returns a report of what was imported.
 * The current programme is kept; sessions are matched to it by session name.
 * Safe to run twice: records already present (same id / date) are skipped.
 */
export function mergeLegacy(state, obj) {
  const d = obj.data ?? obj;
  const report = { sessions: 0, foods: 0, library: 0, activityDays: 0, sleepNights: 0, weights: 0, fixes: [] };
  const dayByName = new Map(state.programme.map((p) => [p.name, p]));

  if (d.settings) {
    const s = state.settings;
    if (d.settings.calories) s.kcal = d.settings.calories;
    if (d.settings.protein) s.protein = d.settings.protein;
    if (d.settings.water) s.water = d.settings.water;
    if (d.settings.start) s.startDate = d.settings.start.slice(0, 10);
    if (typeof d.settings.cleared === 'boolean') s.cleared = d.settings.cleared;
  }

  // workouts
  const have = new Set(state.sessions.map((x) => x.id));
  for (const s of d.sessions || []) {
    if (!s.finished || have.has(s.id)) continue;
    const day = dayByName.get(s.name);
    const start = new Date(`${s.date}T12:00:00`).getTime();
    const entries = (s.exercises || []).map((e) => {
      const pe = day?.exercises.find((x) => x.name === e.name);
      const logs = fixTypos(e.name, (e.logs || []).filter((l) => l.done && l.kg != null && l.reps), report.fixes, s.date);
      return {
        exId: pe?.id || e.id, name: e.name, unit: UNIT[e.unit] || 'total',
        sets: logs.map((l) => ({ w: l.kg, r: l.reps, done: true, ...(l.rir != null ? { rir: l.rir } : {}) })),
      };
    }).filter((e) => e.sets.length);
    if (!entries.length) continue;
    state.sessions.push({
      id: s.id, dayId: day?.id || s.dayId, name: s.name, date: s.date,
      startedAt: start, endedAt: start + (s.minutes || 60) * 60000, durationMin: s.minutes || 60,
      entries, ...(s.note ? { note: s.note } : {}), imported: true,
    });
    report.sessions++;
  }
  state.sessions.sort((a, b) => a.date.localeCompare(b.date));

  // food log
  const foodIds = new Set(Object.values(state.foods).flat().map((f) => f.id));
  for (const m of d.meals || []) {
    if (foodIds.has(m.id)) continue;
    (state.foods[m.date] ||= []).push({
      id: m.id, meal: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'].includes(m.slot) ? m.slot : 'Snacks',
      name: m.name, qty: m.quantity || '', kcal: m.calories ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0,
    });
    report.foods++;
  }

  // saved foods
  const libNames = new Set(state.library.map((f) => f.name.toLowerCase()));
  for (const f of d.foodLibrary || []) {
    if (libNames.has(f.name.toLowerCase())) continue;
    state.library.unshift({ id: f.id, name: f.name, qty: f.servingLabel || `${f.base} ${f.unit}`, kcal: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
    report.library++;
  }

  // water
  for (const [date, ml] of Object.entries(d.water || {})) state.water[date] = Math.max(state.water[date] || 0, ml);

  // bodyweight
  const wDates = new Set(state.weights.map((w) => w.date));
  for (const w of d.weights || []) {
    const date = (w.date || '').slice(0, 10);
    const kg = w.kg ?? w.weight;
    if (!date || !kg || wDates.has(date)) continue;
    state.weights.push({ id: w.id || `${date}-w`, date, kg });
    report.weights++;
  }

  // Apple Health days + sleep
  for (const h of d.health?.days || []) {
    const rec = { ...(state.activity[h.date] || {}) };
    if (h.steps != null) rec.steps = Math.round(h.steps);
    if (h.activeCalories != null) rec.activeKcal = Math.round(h.activeCalories);
    if (h.restingCalories != null) rec.restingKcal = Math.round(h.restingCalories);
    if (h.exerciseMinutes != null) rec.exerciseMin = Math.round(h.exerciseMinutes);
    state.activity[h.date] = rec;
    report.activityDays++;
  }
  for (const sl of d.health?.sleep || []) {
    if (sl.asleepMinutes == null) continue;
    state.activity[sl.date] = { ...(state.activity[sl.date] || {}), sleepMin: Math.round(sl.asleepMinutes) };
    report.sleepNights++;
  }

  // keep programme weights in line with the most recent logged top set
  for (const day of state.programme) {
    for (const ex of day.exercises) {
      const last = [...state.sessions].reverse().flatMap((s) => s.entries).find((e) => e.name === ex.name);
      if (last) ex.weight = Math.max(...last.sets.map((x) => x.w));
    }
  }
  return report;
}
