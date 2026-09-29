// Weekly loop logic: meals per slot, scaling to calorie targets, shopping needs,
// prep sessions, container plan, cook timeline.
import { COOK, READY_G_PER_CUP } from './foods.js';
import { fmtQty } from './engine.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
export const KIND_LABEL = { prep: 'Prepped', fresh: 'Cook fresh', easy: 'Easy' };
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ---------- Dates (local, no time zones) ---------- */
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}
export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function dayDate(week, i) {
  return parseIso(addDays(week.start, i));
}
export function shortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
/** Index of today within the week (0 to 6), or -1 before it, 7 after it. */
export function todayIndex(week) {
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = Math.round((today - parseIso(week.start)) / 86400000);
  return diff < 0 ? -1 : diff > 6 ? 7 : diff;
}

/* ---------- Templates ---------- */
export function slotKcal(settings, slot) {
  const split = settings.split || { breakfast: 25, lunch: 35, dinner: 40 };
  const total = (split.breakfast || 0) + (split.lunch || 0) + (split.dinner || 0) || 100;
  return ((+settings.kcal || 2000) * (split[slot] || 0)) / total;
}

export function templateBase(t, foods) {
  const tot = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of t.items || []) {
    const f = foods.get(it.foodId);
    if (!f) continue;
    for (const k of ['kcal', 'p', 'c', 'f']) tot[k] += (it.g * f[k]) / 100;
  }
  return tot;
}

/** Scale a template to a calorie target (if it scales). Returns per-serving numbers. */
export function scaleTemplate(t, targetKcal, foods) {
  const base = templateBase(t, foods);
  const factor = t.scale && targetKcal > 0 && base.kcal > 0 ? targetKcal / base.kcal : 1;
  const items = (t.items || [])
    .map((it) => {
      const food = foods.get(it.foodId);
      if (!food) return null;
      const g = it.g * factor;
      const cooks = !!(food.cookHow && food.cookHow.how !== 'No cook');
      const readyG = g * (food.yield || 1);
      return { food, g, readyG, cooks, kcal: (g * food.kcal) / 100, p: (g * food.p) / 100, c: (g * food.c) / 100, f: (g * food.f) / 100 };
    })
    .filter(Boolean);
  const totals = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  const extras = (t.extras || []).map((x) => ({ ...x, qty: x.qty != null ? x.qty * (t.scaleExtras ? factor : 1) : null }));
  return { factor, items, totals, extras };
}

export function volumeCups(sc) {
  let cups = 0;
  for (const i of sc.items) {
    const gpc = READY_G_PER_CUP[i.food.id] || i.food.gPerCup || 150;
    cups += i.readyG / gpc;
  }
  return cups;
}

/* ---------- Week ---------- */
export function mealAt(week, i, slot, tmap) {
  const cell = week.days[i] && week.days[i][slot];
  if (!cell || cell.out || !cell.t) return null;
  return tmap.get(cell.t) || null;
}

export function dayTotals(week, i, ctx) {
  const tot = { kcal: 0, p: 0, c: 0, f: 0, out: false, planned: 0 };
  for (const slot of SLOTS) {
    const cell = week.days[i][slot];
    if (cell && cell.out) { tot.out = true; continue; }
    const t = mealAt(week, i, slot, ctx.tmap);
    if (!t) continue;
    const sc = scaleTemplate(t, slotKcal(ctx.settings, slot), ctx.foods);
    for (const k of ['kcal', 'p', 'c', 'f']) tot[k] += sc.totals[k];
    tot.planned++;
  }
  return tot;
}

/** Shopping needs for the whole week, for buildList(). */
export function weekNeeds(week, ctx, { fromDay = 0 } = {}) {
  const people = Math.max(1, +ctx.settings.people || 1);
  const needs = [];
  for (let i = fromDay; i < 7; i++) {
    for (const slot of SLOTS) {
      const t = mealAt(week, i, slot, ctx.tmap);
      if (!t) continue;
      const sc = scaleTemplate(t, slotKcal(ctx.settings, slot), ctx.foods);
      for (const it of sc.items) {
        needs.push({ key: 'f:' + it.food.id, foodId: it.food.id, name: it.food.short || it.food.name, section: it.food.section, grams: it.g * people, perDay: null, source: t.name });
      }
      for (const x of sc.extras) {
        needs.push({ key: 'n:' + String(x.name).toLowerCase() + '|' + (x.unit || ''), foodId: null, name: x.name[0].toUpperCase() + x.name.slice(1), section: x.section || 'pantry', grams: null, qty: x.qty != null ? x.qty * people : null, unit: x.unit || '', source: t.name, once: true });
      }
    }
  }
  return needs;
}

/* ---------- Prep sessions ---------- */
export function sessionDefs(mode) {
  if (mode === 'twice') {
    return [
      { id: 'A', name: 'Sunday prep', short: 'Sun', prepDay: -1, days: [0, 1, 2] },
      { id: 'B', name: 'Wednesday prep', short: 'Wed', prepDay: 2, days: [3, 4, 5, 6] },
    ];
  }
  return [{ id: 'A', name: 'Sunday prep', short: 'Sun', prepDay: -1, days: [0, 1, 2, 3, 4, 5, 6] }];
}

function fillText(text, cups, water) {
  return text.replace('{cups}', fmtQty(Math.round(cups * 4) / 4)).replace('{water}', fmtQty(Math.round(water * 4) / 4));
}

export function prepPlan(week, ctx) {
  const people = Math.max(1, +ctx.settings.people || 1);
  const fridgeDays = Math.max(1, +ctx.settings.fridgeDays || 4);
  const cap = Math.max(1, +ctx.settings.containers || 8);
  const capCups = (+ctx.settings.containerOz || 30) / 8;
  return sessionDefs(ctx.settings.prepMode).map((s) => {
    const meals = [];
    for (const i of s.days) {
      for (const slot of SLOTS) {
        const t = mealAt(week, i, slot, ctx.tmap);
        if (!t || t.kind !== 'prep') continue;
        const sc = scaleTemplate(t, slotKcal(ctx.settings, slot), ctx.foods);
        const age = i - s.prepDay; // days after cooking
        let storage = 'fridge';
        if (age > fridgeDays) storage = t.freezable === false ? 'late' : 'freeze';
        for (let n = 0; n < people; n++) meals.push({ day: i, slot, t, sc, age, storage, container: t.usesContainer !== false });
      }
    }
    // Aggregate raw amounts to cook
    const agg = new Map();
    for (const m of meals) {
      for (const it of m.sc.items) {
        const a = agg.get(it.food.id) || { food: it.food, g: 0, readyG: 0 };
        a.g += it.g;
        a.readyG += it.readyG;
        agg.set(it.food.id, a);
      }
    }
    const steps = [];
    for (const a of agg.values()) {
      const ck = a.food.cookHow || COOK[a.food.id];
      if (!ck || ck.how === 'No cook') continue;
      const cups = a.food.gPerCup ? a.g / a.food.gPerCup : 0;
      steps.push({ food: a.food, g: a.g, readyG: a.readyG, how: ck.how, temp: ck.temp || '', min: ck.min || 10, text: fillText(ck.text, cups, cups * (ck.water || 0)), alt: ck.alt || '' });
    }
    steps.sort((x, y) => y.min - x.min);
    const total = steps.length ? steps[0].min : 0;
    for (const st of steps) {
      st.startAt = total - st.min;
      const share = steps.filter((o) => o !== st && o.how === st.how && o.temp && o.temp === st.temp);
      const names = share.map((o) => (o.food.short || o.food.name).toLowerCase());
      const joined = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      st.shares = share.length ? `Shares the ${st.temp} ${st.how.toLowerCase()} with ${joined}.` : '';
    }
    // Portion groups: same template in the same slot share one recipe card
    const groups = new Map();
    for (const m of meals) {
      const k = m.t.id + '|' + m.slot;
      const g = groups.get(k) || { t: m.t, slot: m.slot, sc: m.sc, meals: [], cups: volumeCups(m.sc) };
      g.meals.push(m);
      groups.set(k, g);
    }
    const containers = meals.filter((m) => m.container).length;
    return { ...s, meals, steps, total, groups: [...groups.values()], containers, cap, capCups, over: containers > cap, raw: [...agg.values()] };
  });
}

/** Label for a container, e.g. "Thu lunch". */
export function mealLabel(m) {
  return `${DAY_NAMES[m.day]} ${m.slot}`;
}
