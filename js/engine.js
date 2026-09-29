// Pure logic: formatting, plan math, package rounding, list building,
// recipe parsing and scaling, price estimates. No DOM access except
// extractRecipeFromHtml (uses DOMParser).
import { sectionOrder } from './foods.js';

export const LB = 453.592;
export const OZ = 28.3495;

/* ---------------- Formatting ---------------- */
function trimNum(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
export function fmtNum(n, d = 0) {
  if (n == null || !isFinite(n)) return '';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}
export function fmtWeight(g, units) {
  if (g == null || !isFinite(g)) return '';
  if (g < 0) g = 0;
  if (units === 'metric') {
    if (g >= 1000) return trimNum((g / 1000).toFixed(g >= 10000 ? 1 : 2)) + ' kg';
    return Math.round(g) + ' g';
  }
  const oz = g / OZ;
  if (oz >= 16) {
    const lb = oz / 16;
    return trimNum(lb.toFixed(lb >= 10 ? 1 : 2)) + ' lb';
  }
  return trimNum(oz.toFixed(oz >= 10 ? 0 : 1)) + ' oz';
}
export function fmtMoney(n) {
  if (n == null || !isFinite(n)) return '';
  return '$' + n.toFixed(2);
}
const FRACS = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'], [1, '']];
export function fmtQty(q) {
  if (q == null || !isFinite(q)) return '';
  if (q >= 10) return fmtNum(q, q >= 100 ? 0 : 1);
  const whole = Math.floor(q);
  const frac = q - whole;
  let best = FRACS[0];
  for (const f of FRACS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  if (Math.abs(best[0] - frac) > 0.06) return trimNum(q.toFixed(2));
  const w = best[0] === 1 ? whole + 1 : whole;
  if (!best[1]) return String(w);
  return (w ? w : '') + best[1];
}

/** A food portion in the most natural unit, e.g. "3 eggs", "6.5 oz", "1¼ cups". */
export function fmtPortion(food, g, units, { withWeight = true } = {}) {
  if (!food || g == null) return fmtWeight(g, units);
  const w = fmtWeight(g, units);
  if (food.unit && food.unit.show) {
    const n = Math.round((g / food.unit.g) * 4) / 4;
    const q = fmtQty(n);
    return `${q} ${n > 1 ? food.unit.plural : food.unit.name}` + (withWeight ? ` (${w})` : '');
  }
  return w;
}

/* ---------------- Plan math ---------------- */
export function computePlan(plan, foods) {
  const items = plan.items
    .map((it) => ({ ...it, food: foods.get(it.foodId) }))
    .filter((it) => it.food && it.food.kcal > 0);
  const sum = items.reduce((a, it) => a + Math.max(0, +it.share || 0), 0);
  const T = Math.max(0, +plan.kcal || 0);
  const meals = Math.max(1, +plan.mealsPerDay || 1);
  const rows = items.map((it) => {
    const pct = sum > 0 ? Math.max(0, +it.share || 0) / sum : 0;
    const kcal = T * pct;
    const g = (kcal / it.food.kcal) * 100;
    return {
      foodId: it.foodId,
      food: it.food,
      share: it.share,
      pct,
      kcal,
      g,
      perMeal: g / meals,
      cooked: g * (it.food.yield || 1),
      p: (g * it.food.p) / 100,
      c: (g * it.food.c) / 100,
      f: (g * it.food.f) / 100,
    };
  });
  const totals = rows.reduce((a, r) => ({ kcal: a.kcal + r.kcal, p: a.p + r.p, c: a.c + r.c, f: a.f + r.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  return { rows, totals, missing: plan.items.length - items.length };
}

function projectSimplex(y, floor) {
  // Project y onto { s_i >= floor, sum s_i = 1 }.
  const n = y.length;
  const R = 1 - n * floor;
  const z = y.map((v) => v - floor);
  const u = z.slice().sort((a, b) => b - a);
  let css = 0;
  let theta = 0;
  for (let i = 0; i < n; i++) {
    css += u[i];
    const t = (css - R) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return z.map((v) => Math.max(v - theta, 0) + floor);
}

/**
 * Adjust shares so macros land near targets while total calories stay fixed.
 * Minimizes weighted squared relative error plus a small pull toward the
 * current shares, over the probability simplex (every food keeps at least 2%).
 * Returns { shares, achieved } or null when there are no macro targets.
 */
export function fitShares(plan, foods) {
  const items = plan.items.map((it) => foods.get(it.foodId));
  if (items.some((f) => !f || !(f.kcal > 0))) return null;
  const n = items.length;
  if (n < 2) return null;
  const T = +plan.kcal || 0;
  const targets = [];
  if (+plan.protein > 0) targets.push({ k: 'p', t: +plan.protein, w: 4, min: !!plan.proteinMin });
  if (+plan.carbs > 0) targets.push({ k: 'c', t: +plan.carbs, w: 1 });
  if (+plan.fat > 0) targets.push({ k: 'f', t: +plan.fat, w: 1 });
  if (!targets.length || T <= 0) return null;
  const dens = items.map((f) => ({ p: f.p / f.kcal, c: f.c / f.kcal, f: f.f / f.kcal }));
  const sum0 = plan.items.reduce((a, it) => a + Math.max(0, +it.share || 0), 0) || 1;
  const floor = Math.min(0.02, 0.5 / n);
  const s0 = projectSimplex(plan.items.map((it) => Math.max(0, +it.share || 0) / sum0), floor);
  let s = s0.slice();
  const lambda = 0.02;
  const lr = 0.01;
  for (let iter = 0; iter < 6000; iter++) {
    const grad = new Array(n).fill(0);
    for (const tg of targets) {
      let M = 0;
      for (let i = 0; i < n; i++) M += T * s[i] * dens[i][tg.k];
      let r = (M - tg.t) / tg.t;
      if (tg.min && r > 0) r = 0; // a minimum is satisfied once reached
      if (r === 0) continue;
      for (let i = 0; i < n; i++) grad[i] += 2 * tg.w * r * ((T * dens[i][tg.k]) / tg.t);
    }
    for (let i = 0; i < n; i++) grad[i] += 2 * lambda * (s[i] - s0[i]);
    s = projectSimplex(s.map((v, i) => v - lr * grad[i]), floor);
  }
  const achieved = { p: 0, c: 0, f: 0 };
  for (let i = 0; i < n; i++) for (const k of ['p', 'c', 'f']) achieved[k] += T * s[i] * dens[i][k];
  return { shares: s.map((v) => Math.round(v * 1000) / 10), achieved };
}

/** Cooked food keeps about 3 to 4 days in the fridge, so split prep into sessions. */
export function prepSchedule(plan, rows, fridgeDays = 4) {
  const days = Math.max(1, +plan.days || 1);
  const people = Math.max(1, +plan.people || 1);
  const span = Math.max(1, Math.min(7, +fridgeDays || 4));
  const sessions = [];
  for (let d = 1; d <= days; d += span) {
    const end = Math.min(days, d + span - 1);
    const n = end - d + 1;
    sessions.push({
      day: d,
      end,
      n,
      items: rows
        .filter((r) => r.food.cook)
        .map((r) => ({ food: r.food, raw: r.g * n * people, cooked: r.cooked * n * people })),
    });
  }
  return sessions;
}

/* ---------------- Needs (what a plan or recipe requires) ---------------- */
export function needsFromPlan(plan, foods) {
  const { rows } = computePlan(plan, foods);
  const days = Math.max(1, +plan.days || 1);
  const people = Math.max(1, +plan.people || 1);
  return rows.map((r) => ({
    key: 'f:' + r.foodId,
    foodId: r.foodId,
    name: r.food.short || r.food.name,
    section: r.food.section,
    grams: r.g * days * people,
    perDay: r.g * people,
    perMeal: r.perMeal,
    rate: `at ${fmtNum(+plan.kcal)} kcal/day` + (people > 1 ? ` for ${people} people` : ''),
    source: plan.name || 'Meal plan',
  }));
}

export function needsFromRecipe(recipe, foods) {
  const sc = scaleRecipe(recipe, foods);
  const prepDays = recipe.mode === 'prep' ? Math.max(1, +recipe.days || 1) : 0;
  return sc.ingredients.map((ing) => {
    const food = ing.foodId ? foods.get(ing.foodId) : null;
    if (food && ing.grams != null) {
      return {
        key: 'f:' + food.id,
        foodId: food.id,
        name: food.short || food.name,
        section: food.section,
        grams: ing.grams,
        perDay: prepDays ? ing.grams / prepDays : null,
        rate: prepDays ? `of ${recipe.name || 'this recipe'}` : null,
        source: recipe.name || 'Recipe',
      };
    }
    const unit = ing.unit || '';
    return {
      key: 'n:' + normName(ing.name) + '|' + unit,
      foodId: null,
      name: cap(ing.name),
      section: ing.section || guessSection(ing.name),
      grams: null,
      qty: ing.qty,
      unit,
      source: recipe.name || 'Recipe',
    };
  });
}

/* ---------------- Packages and list building ---------------- */
export function pickPackage(food, g, units) {
  if (!food || g == null) return null;
  if (g <= 0.5) return { text: 'None needed', grams: 0, count: 0 };
  if (food.loose) {
    const step = units === 'metric' ? 100 : LB / 4;
    const buy = Math.ceil(g / step - 1e-9) * step;
    return { text: fmtWeight(buy, units), grams: buy, count: null, loose: true };
  }
  const pk = food.pkgs || [];
  if (!pk.length) {
    if (food.unit) {
      const n = Math.ceil(g / food.unit.g - 0.05);
      const nn = Math.max(1, n);
      return { text: `${nn} ${nn === 1 ? food.unit.name : food.unit.plural}`, grams: nn * food.unit.g, count: nn, each: true };
    }
    const step = units === 'metric' ? 100 : LB / 4;
    const buy = Math.ceil(g / step - 1e-9) * step;
    return { text: fmtWeight(buy, units), grams: buy, count: null, loose: true };
  }
  // Try single sizes and pairs of sizes; score = waste + small per-package penalty.
  const cands = [];
  const penalty = 15;
  for (const a of pk) {
    const n = Math.ceil(g / a.g - 1e-9);
    cands.push({ parts: [[n, a]], total: n * a.g });
  }
  for (let i = 0; i < pk.length; i++) {
    for (let j = 0; j < pk.length; j++) {
      if (i === j || pk[i].g <= pk[j].g) continue;
      const A = pk[i];
      const B = pk[j];
      const maxA = Math.ceil(g / A.g);
      for (let a = 1; a <= maxA; a++) {
        const rest = g - a * A.g;
        const b = rest > 0 ? Math.ceil(rest / B.g - 1e-9) : 0;
        if (b === 0) continue;
        cands.push({ parts: [[a, A], [b, B]], total: a * A.g + b * B.g });
      }
    }
  }
  let best = null;
  for (const c of cands) {
    const count = c.parts.reduce((x, p) => x + p[0], 0);
    c.count = count;
    c.score = c.total - g + Math.max(penalty, 0.08 * g) * count + (c.parts.length > 1 ? 0.15 * g : 0);
    if (!best || c.score < best.score) best = c;
  }
  const text = best.parts.map(([n, p]) => (n === 1 ? p.label : `${n} × ${p.label}`)).join(' + ');
  return { text, grams: best.total, count: best.count, parts: best.parts.map(([n, p]) => ({ n, label: p.label, g: p.g })) };
}

function fmtSources(map) {
  return 'For ' + [...map].map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(', ');
}

export function buildList(needs, { foods, pantry = [], subtract = true, units = 'imperial', name = 'Grocery List', uid }) {
  const merged = new Map();
  for (const n of needs) {
    let m = merged.get(n.key);
    if (!m) {
      m = { key: n.key, foodId: n.foodId, name: n.name, section: n.section, grams: null, perDay: 0, perDayOk: true, perMeal: n.perMeal ?? null, qty: null, unit: n.unit || '', sources: new Map(), rates: new Set(), count: 0 };
      merged.set(n.key, m);
    }
    m.count++;
    m.sources.set(n.source, (m.sources.get(n.source) || 0) + 1);
    if (n.grams != null) {
      m.grams = (m.grams || 0) + n.grams;
      if (n.perDay != null) m.perDay += n.perDay;
      else m.perDayOk = false;
      if (n.rate) m.rates.add(n.rate);
    } else if (n.qty != null) {
      m.qty = (m.qty || 0) + n.qty;
    }
    if (m.count > 1) m.perMeal = null;
  }
  const items = [];
  let order = 0;
  const sorted = [...merged.values()].sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section));
  for (const m of sorted) {
    const food = m.foodId ? foods.get(m.foodId) : null;
    const item = { id: uid(), key: m.key, foodId: m.foodId, name: m.name, section: m.section || 'other', checked: false, order: order++, manual: false };
    if (food && m.grams != null) {
      let need = m.grams;
      let have = 0;
      let pantryNote = '';
      const p = subtract ? pantry.find((x) => x.key === m.key) : null;
      if (p) {
        if (p.grams == null) {
          item.checked = true;
          pantryNote = 'In your pantry';
          need = 0;
        } else {
          have = Math.min(p.grams, need);
          need = Math.max(0, need - p.grams);
          pantryNote = `Using ${fmtWeight(have, units)} from pantry`;
        }
      }
      const pkg = pickPackage(food, need, units);
      if (need <= 0.5 && !item.checked) {
        item.checked = true;
        pantryNote = pantryNote || 'Covered by what you have';
      }
      item.needG = need;
      item.buyG = pkg ? pkg.grams : null;
      item.qty = pkg ? pkg.text : '';
      item.pkgParts = pkg && pkg.parts ? pkg.parts : null;
      item.eachCount = pkg && pkg.each ? pkg.count : null;
      const lines = [];
      let l1 = `Need ${fmtPortion(food, m.grams, units)}`;
      if (m.perDayOk && m.perDay > 0) l1 += ` · ${fmtPortion(food, m.perDay, units, { withWeight: false })}/day`;
      if (m.perMeal) l1 += ` · ${fmtPortion(food, m.perMeal, units, { withWeight: false })}/meal`;
      lines.push(l1);
      const l2 = [];
      if (m.perDayOk && m.perDay > 0 && pkg) {
        const days = (pkg.grams + have) / m.perDay;
        const rate = m.rates.size === 1 ? [...m.rates][0] : 'of your combined meals';
        if (pkg.grams + have > 0) l2.push(`Covers ${fmtNum(Math.floor(days * 10) / 10, 1)} days ${rate}`);
      }
      if (pkg && pkg.grams - need > 1 && need > 0) l2.push(`${fmtWeight(pkg.grams - need, units)} left over`);
      if (l2.length) lines.push(l2.join(' · '));
      if (pantryNote) lines.push(pantryNote);
      if (food.note) lines.push(food.note);
      item.detail = lines;
    } else {
      // Ingredient without a known weight: keep the recipe's own unit.
      item.qty = m.qty != null ? `${fmtQty(m.qty)}${m.unit ? ' ' + unitLabel(m.unit, m.qty) : ''}` : '';
      item.detail = m.sources.size ? [fmtSources(m.sources)] : [];
      const p = subtract ? pantry.find((x) => x.key === m.key || normName(x.name) === normName(m.name)) : null;
      if (p) {
        item.checked = true;
        item.detail.push('In your pantry');
      }
    }
    if (food && m.sources.size && (m.sources.size > 1 || [...m.sources.values()][0] > 1)) item.detail.push(fmtSources(m.sources));
    items.push(item);
  }
  return { id: uid(), name, createdAt: Date.now(), items, collapsed: {} };
}

/* ---------------- Recipe parsing ---------------- */
const UNI_FRAC = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6 };
const UNIT_WORDS = [
  ['floz', ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces']],
  ['cup', ['cups', 'cup', 'c']],
  ['tbsp', ['tablespoons', 'tablespoon', 'tbsp', 'tbs', 'tbl', 'T']],
  ['tsp', ['teaspoons', 'teaspoon', 'tsp', 't']],
  ['oz', ['ounces', 'ounce', 'oz']],
  ['lb', ['pounds', 'pound', 'lbs', 'lb']],
  ['kg', ['kilograms', 'kilogram', 'kg']],
  ['g', ['grams', 'gram', 'gr', 'g']],
  ['ml', ['milliliters', 'milliliter', 'millilitres', 'millilitre', 'ml']],
  ['l', ['liters', 'liter', 'litres', 'litre', 'l']],
  ['can', ['cans', 'can']],
  ['clove', ['cloves', 'clove']],
  ['slice', ['slices', 'slice']],
  ['stick', ['sticks', 'stick']],
  ['pinch', ['pinches', 'pinch']],
  ['dash', ['dashes', 'dash']],
  ['bunch', ['bunches', 'bunch']],
  ['head', ['heads', 'head']],
  ['pkg', ['packages', 'package', 'pkgs', 'pkg', 'packets', 'packet']],
  ['piece', ['pieces', 'piece']],
];
const SIZE_WORDS = ['large', 'medium', 'small', 'extra-large', 'jumbo'];
const UNIT_LABELS = { floz: ['fl oz', 'fl oz'], cup: ['cup', 'cups'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'], oz: ['oz', 'oz'], lb: ['lb', 'lb'], kg: ['kg', 'kg'], g: ['g', 'g'], ml: ['ml', 'ml'], l: ['L', 'L'], can: ['can', 'cans'], clove: ['clove', 'cloves'], slice: ['slice', 'slices'], stick: ['stick', 'sticks'], pinch: ['pinch', 'pinches'], dash: ['dash', 'dashes'], bunch: ['bunch', 'bunches'], head: ['head', 'heads'], pkg: ['package', 'packages'], piece: ['piece', 'pieces'] };
export const UNIT_OPTIONS = ['', 'g', 'kg', 'oz', 'lb', 'cup', 'tbsp', 'tsp', 'ml', 'l', 'floz', 'can', 'clove', 'slice', 'stick', 'pinch', 'bunch', 'head', 'pkg', 'piece'];
export function unitLabel(u, q = 1) {
  const l = UNIT_LABELS[u];
  if (!l) return u || '';
  return q > 1.001 ? l[1] : l[0];
}

function parseNumberToken(s) {
  s = s.trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return +m[1] / +m[2];
  m = s.match(/^(\d*\.?\d+)\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/);
  if (m) return +m[1] + UNI_FRAC[m[2]];
  if (UNI_FRAC[s] != null) return UNI_FRAC[s];
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+\s*[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]?|[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])(?:\s*(?:-|\u2013|\u2014|to|or)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+\s*[½⅓⅔¼¾⅛⅜⅝⅞]?|[½⅓⅔¼¾⅛⅜⅝⅞]))?/i;

export function parseIngredientLine(line) {
  let s = String(line || '')
    .replace(/[\u00a0\t]+/g, ' ')
    .replace(/^\s*(?:[-*•▢□☐◦▪]|\[\s?\])\s*/, '')
    .trim();
  if (!s) return null;
  let qty = null;
  const m = s.match(QTY_RE);
  if (m) {
    const a = parseNumberToken(m[1]);
    const b = m[2] ? parseNumberToken(m[2]) : null;
    qty = b != null ? Math.max(a, b) : a;
    s = s.slice(m[0].length).trim();
  }
  // Size in parentheses right after the number: "1 (15 oz) can beans"
  let parenG = null;
  const pm = s.match(/^\((\d*\.?\d+)\s*(-?\s*ounce|oz|g|grams|lb|pound)s?\.?\)\s*/i);
  if (pm) {
    const v = +pm[1];
    const u = pm[2].toLowerCase().replace(/[-\s]/g, '');
    parenG = u.startsWith('g') ? v : u.startsWith('lb') || u.startsWith('pound') ? v * LB : v * OZ;
    s = s.slice(pm[0].length).trim();
  }
  let unit = '';
  outer: for (const [id, words] of UNIT_WORDS) {
    for (const w of words) {
      const single = w.length === 1;
      const re = new RegExp('^' + w.replace(/[.]/g, '\\.').replace(/ /g, '\\s*') + '\\.?(?=\\s|$|,)', single ? '' : 'i');
      if (re.test(s)) {
        unit = id;
        s = s.replace(re, '').trim();
        break outer;
      }
    }
  }
  let size = '';
  const sw = s.split(/\s+/)[0]?.toLowerCase();
  if (SIZE_WORDS.includes(sw)) {
    size = sw;
    s = s.split(/\s+/).slice(1).join(' ');
  }
  s = s.replace(/^of\s+/i, '');
  let note = '';
  const paren = s.match(/\(([^)]*)\)/g);
  if (paren) {
    note = paren.map((p) => p.slice(1, -1)).join('; ');
    s = s.replace(/\s*\([^)]*\)/g, '');
  }
  const ci = s.indexOf(',');
  if (ci > 0) {
    note = [s.slice(ci + 1).trim(), note].filter(Boolean).join('; ');
    s = s.slice(0, ci);
  }
  const tt = s.match(/\s*,?\s*(to taste|as needed|for serving|optional)\s*$/i);
  if (tt) {
    note = [note, tt[1].toLowerCase()].filter(Boolean).join('; ');
    s = s.slice(0, tt.index);
  }
  const name = s.trim().replace(/\s{2,}/g, ' ');
  if (!name) return null;
  return { qty, unit, name, note, size, parenG };
}

export function parseRecipeText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim());
  let name = '';
  let servings = null;
  const ingredients = [];
  const steps = [];
  let mode = 'auto';
  for (const raw of lines) {
    if (!raw) continue;
    const low = raw.toLowerCase().replace(/[:#*]/g, '').trim();
    if (/^(ingredients?)$/.test(low)) { mode = 'ing'; continue; }
    if (/^(instructions?|directions?|method|steps?|preparation)$/.test(low)) { mode = 'steps'; continue; }
    const sm = raw.match(/(?:serves|servings?|yield|makes)\s*:?\s*(\d+)/i);
    if (sm && raw.length < 40) { servings = +sm[1]; continue; }
    if (mode === 'steps') { steps.push(raw.replace(/^\d+[.)]\s*/, '')); continue; }
    const looksIng = QTY_RE.test(raw.replace(/^\s*[-*•▢□☐]\s*/, '')) || /^\s*[-*•▢□☐]/.test(raw);
    if (!name && !looksIng && mode === 'auto' && raw.length < 80) { name = raw.replace(/^#+\s*/, ''); continue; }
    if (mode === 'ing' || looksIng) {
      const p = parseIngredientLine(raw);
      if (p) ingredients.push(p);
    } else if (mode === 'auto' && raw.length > 60) {
      steps.push(raw);
    } else if (mode === 'auto') {
      const p = parseIngredientLine(raw);
      if (p) ingredients.push(p);
    }
  }
  return { name, servings, ingredients, steps };
}

export function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.endsWith('toes') || w.endsWith('oes')) return w.slice(0, -2);
  if (w.endsWith('ss')) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}
function singularPhrase(s) {
  return normName(s).split(' ').map(singular).join(' ');
}
export function cap(s) {
  s = String(s || '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Words that turn a food into a different product ("rice vinegar", "garlic powder").
const MODIFIERS = ['vinegar', 'powder', 'sauce', 'paste', 'broth', 'stock', 'extract', 'flour', 'noodle', 'coconut', 'syrup', 'seasoning', 'juice', 'zest', 'butter', 'oil', 'cream', 'cake', 'chip'];

export function matchFood(name, foods) {
  const target = ' ' + singularPhrase(name) + ' ';
  const mods = MODIFIERS.filter((m) => target.includes(' ' + m + ' '));
  let best = null;
  let bestLen = 0;
  for (const f of foods.values()) {
    const cands = [f.short, f.name, ...(f.aliases || [])].filter(Boolean).map(singularPhrase);
    for (const a of cands) {
      if (!a) continue;
      if (mods.some((m) => !(' ' + a + ' ').includes(' ' + m + ' '))) continue;
      if (target.includes(' ' + a + ' ') && a.length > bestLen) {
        best = f;
        bestLen = a.length;
      }
    }
  }
  return best;
}

const SECTION_HINTS = [
  ['produce', /(lettuce|herb|cilantro|parsley|basil|ginger|scallion|green onion|celery|cucumber|zucchini|mushroom|kale|cabbage|lime|jalape|squash|corn|fruit|berry|grape|orange|mango|pineapple|peach)/],
  ['meat', /(beef|pork|chicken|turkey|sausage|bacon|ham|steak|lamb|fish|shrimp|salmon|cod)/],
  ['dairy', /(milk|cheese|cream|yogurt|egg|butter|parmesan|mozzarella|feta)/],
  ['bakery', /(bread|bun|roll|bagel|pita|tortilla)/],
  ['frozen', /(frozen)/],
];
export function guessSection(name) {
  const n = normName(name);
  for (const [sec, re] of SECTION_HINTS) if (re.test(n)) return sec;
  return 'pantry';
}

const WEIGHT_G = { g: 1, kg: 1000, oz: OZ, lb: LB };
const VOL_CUP = { cup: 1, tbsp: 1 / 16, tsp: 1 / 48, floz: 1 / 8, ml: 1 / 236.6, l: 1000 / 236.6 };
/** Grams for a quantity, or null when it cannot be known honestly. */
export function toGrams(qty, unit, food, parenG) {
  if (qty == null) return null;
  if (WEIGHT_G[unit]) return qty * WEIGHT_G[unit];
  if (!food) return null;
  if (VOL_CUP[unit] != null) return food.gPerCup ? qty * VOL_CUP[unit] * food.gPerCup : null;
  if (unit === 'can' || unit === 'pkg') {
    // A food sold in cans stores its drained weight per can; prefer that over the label's net weight.
    const can = (food.pkgs || []).find((p) => /can/i.test(p.label));
    if (unit === 'can' && can) return qty * can.g;
    if (parenG) return qty * parenG;
    const p = (food.pkgs || [])[0];
    return p ? qty * p.g : null;
  }
  if (unit === 'clove') return food.clove ? qty * food.clove : null;
  if (unit === 'stick') return food.id === 'butter' ? qty * 113.4 : null;
  if (unit === 'slice') return food.unit && food.unit.name === 'slice' ? qty * food.unit.g : null;
  if (unit === '' || unit === 'piece' || unit === 'head') return food.unit ? qty * food.unit.g : null;
  return null;
}

export function recipeFromParsed(parsed, foods, uid) {
  return {
    id: uid(),
    name: parsed.name || 'Untitled recipe',
    baseServings: parsed.servings || 4,
    sourceUrl: parsed.sourceUrl || '',
    mode: 'once',
    people: 2,
    days: 4,
    kcalTarget: null,
    steps: parsed.steps || [],
    ingredients: (parsed.ingredients || []).map((p) => ingredientFromParsed(p, foods, uid)),
  };
}

export function ingredientFromParsed(p, foods, uid) {
  const food = matchFood(p.name, foods);
  const unit = UNIT_OPTIONS.includes(p.unit) ? p.unit : '';
  return {
    id: uid(),
    qty: p.qty != null ? +p.qty : null,
    unit,
    name: p.name,
    note: p.note || '',
    parenG: p.parenG || null,
    foodId: food ? food.id : null,
    section: food ? food.section : guessSection(p.name),
  };
}

export function recipeNutrition(recipe, foods) {
  let kcal = 0, p = 0, c = 0, f = 0, known = 0, unknown = 0;
  for (const ing of recipe.ingredients) {
    const food = ing.foodId ? foods.get(ing.foodId) : null;
    const g = ing.grams != null ? ing.grams : toGrams(ing.qty, ing.unit, food, ing.parenG);
    if (food && g != null) {
      kcal += (g * food.kcal) / 100;
      p += (g * food.p) / 100;
      c += (g * food.c) / 100;
      f += (g * food.f) / 100;
      known++;
    } else unknown++;
  }
  const sv = Math.max(1, +recipe.baseServings || 1);
  return { total: { kcal, p, c, f }, perServing: { kcal: kcal / sv, p: p / sv, c: c / sv, f: f / sv }, known, unknown };
}

export function scaleRecipe(recipe, foods) {
  const base = Math.max(1, +recipe.baseServings || 1);
  const servings = Math.max(1, +recipe.people || 1) * (recipe.mode === 'prep' ? Math.max(1, +recipe.days || 1) : 1);
  const nut = recipeNutrition(recipe, foods);
  let kf = 1;
  if (+recipe.kcalTarget > 0 && nut.perServing.kcal > 0) kf = +recipe.kcalTarget / nut.perServing.kcal;
  const factor = (servings / base) * kf;
  const ingredients = recipe.ingredients.map((ing) => {
    const food = ing.foodId ? foods.get(ing.foodId) : null;
    const g0 = toGrams(ing.qty, ing.unit, food, ing.parenG);
    return {
      ...ing,
      qty: ing.qty != null ? ing.qty * factor : null,
      grams: g0 != null ? g0 * factor : null,
    };
  });
  return {
    factor,
    kcalFactor: kf,
    servings,
    perServing: { kcal: nut.perServing.kcal * kf, p: nut.perServing.p * kf, c: nut.perServing.c * kf, f: nut.perServing.f * kf },
    known: nut.known,
    unknown: nut.unknown,
    ingredients,
  };
}

/* ---------------- schema.org Recipe JSON-LD ---------------- */
function isRecipeType(t) {
  if (!t) return false;
  if (Array.isArray(t)) return t.some(isRecipeType);
  return String(t).toLowerCase() === 'recipe' || String(t).toLowerCase().endsWith('/recipe');
}
function findRecipe(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (isRecipeType(node['@type'])) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    if (node[k]) {
      const r = findRecipe(node[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}
function decodeEntities(s) {
  const d = new DOMParser().parseFromString(`<!doctype html><body>${String(s)}`, 'text/html');
  return (d.body.textContent || '').trim();
}
function flattenInstructions(ins) {
  const out = [];
  const walk = (x) => {
    if (!x) return;
    if (typeof x === 'string') { x.split(/\n+/).forEach((t) => t.trim() && out.push(decodeEntities(t))); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.itemListElement) { walk(x.itemListElement); return; }
    if (x.text) out.push(decodeEntities(x.text));
    else if (x.name) out.push(decodeEntities(x.name));
  };
  walk(ins);
  return out;
}
function parseYield(y) {
  if (y == null) return null;
  if (Array.isArray(y)) {
    for (const v of y) { const n = parseYield(v); if (n) return n; }
    return null;
  }
  const m = String(y).match(/\d+/);
  return m ? +m[0] : null;
}
export function extractRecipeFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const s of scripts) {
    let data;
    try {
      data = JSON.parse(s.textContent.trim());
    } catch (e) {
      continue;
    }
    const r = findRecipe(data);
    if (r) {
      const ings = r.recipeIngredient || r.ingredients || [];
      return {
        name: decodeEntities(r.name || ''),
        servings: parseYield(r.recipeYield),
        ingredients: (Array.isArray(ings) ? ings : [ings]).map((t) => parseIngredientLine(decodeEntities(t))).filter(Boolean),
        steps: flattenInstructions(r.recipeInstructions),
      };
    }
  }
  return null;
}

/* ---------------- Prices ---------------- */
export function priceKey(item) {
  return item.key || 'n:' + normName(item.name);
}

/** Estimated cost of a list item from one saved price entry, or null. */
export function estimateCost(item, entry) {
  if (!entry || !(entry.price >= 0)) return null;
  if (entry.per === 'lb' || entry.per === 'kg') {
    const g = item.buyG;
    if (g == null) return null;
    return entry.price * (g / (entry.per === 'lb' ? LB : 1000));
  }
  if (entry.per === 'each') {
    return entry.price * (item.eachCount || 1);
  }
  // per package
  if (entry.grams && item.buyG) return entry.price * Math.max(1, Math.ceil(item.buyG / entry.grams - 0.02));
  if (item.pkgParts && item.pkgParts.length === 1) return entry.price * item.pkgParts[0].n;
  return entry.price;
}

export function listPriceSummary(list, prices, stores) {
  const active = list.items;
  const byStore = new Map();
  const allStores = new Set(stores);
  for (const it of active) {
    const e = prices[priceKey(it)];
    if (e) Object.keys(e).forEach((s) => allStores.add(s));
  }
  for (const s of allStores) {
    let total = 0;
    let priced = 0;
    for (const it of active) {
      const e = prices[priceKey(it)] && prices[priceKey(it)][s];
      const c = estimateCost(it, e);
      if (c != null) {
        total += c;
        priced++;
      }
    }
    byStore.set(s, { store: s, total, priced, count: active.length });
  }
  return [...byStore.values()].filter((x) => x.priced > 0).sort((a, b) => b.priced - a.priced || a.total - b.total);
}

/** Best known price per 30 g of protein, from the user's own saved prices. */
export function proteinValue(foods, prices) {
  const out = [];
  for (const f of foods.values()) {
    if (!(f.p > 0)) continue;
    const e = prices['f:' + f.id];
    if (!e) continue;
    for (const [store, en] of Object.entries(e)) {
      let perGram = null;
      if (en.per === 'lb') perGram = en.price / LB;
      else if (en.per === 'kg') perGram = en.price / 1000;
      else if (en.per === 'pkg' && en.grams) perGram = en.price / en.grams;
      else if (en.per === 'each' && f.unit) perGram = en.price / f.unit.g;
      if (perGram == null) continue;
      const per30 = perGram * (30 / (f.p / 100));
      out.push({ food: f, store, per30, date: en.date });
    }
  }
  return out.sort((a, b) => a.per30 - b.per30);
}

/* ---------------- Text export ---------------- */
export function listToText(list, sectionNameFn) {
  const lines = [list.name, ''];
  const groups = new Map();
  for (const it of list.items) {
    if (!groups.has(it.section)) groups.set(it.section, []);
    groups.get(it.section).push(it);
  }
  const secs = [...groups.keys()].sort((a, b) => sectionOrder(a) - sectionOrder(b));
  for (const s of secs) {
    lines.push(sectionNameFn(s).toUpperCase());
    const its = groups.get(s).slice().sort((a, b) => (a.checked - b.checked) || a.order - b.order);
    for (const it of its) lines.push(`${it.checked ? '✓' : '○'} ${it.name}${it.qty ? ', ' + it.qty : ''}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}
