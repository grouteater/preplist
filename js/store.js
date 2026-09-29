// Local storage for everything. No account, no server.
const KEY = 'preplist.v1';

export const DEFAULT_STORES = ['Harris Teeter', 'Kroger', 'Walmart', 'Aldi', 'Food Lion', 'Costco'];

export function defaultPlan() {
  return {
    name: 'My Meal Plan',
    days: 5,
    people: 1,
    mealsPerDay: 3,
    kcal: 2200,
    protein: null,
    proteinMin: true,
    carbs: null,
    fat: null,
    items: [
      { foodId: 'chicken-thigh', share: 30 },
      { foodId: 'white-rice', share: 30 },
      { foodId: 'broccoli', share: 5 },
      { foodId: 'greek-yogurt', share: 12 },
      { foodId: 'eggs', share: 15 },
    ],
    savedId: null,
  };
}

function defaults() {
  return {
    version: 1,
    settings: {
      units: 'imperial',
      usdaKey: '',
      proxyUrl: '',
      proxyToken: '',
      krogerLocationId: '',
      krogerLocationName: '',
      krogerStoreLabel: 'Kroger',
      stores: DEFAULT_STORES.slice(),
      priceStore: '',
      subtractPantry: true,
      fridgeDays: 4,
      a2hsDismissed: false,
    },
    plan: defaultPlan(),
    recipe: null,
    customFoods: [],
    saved: [],
    lists: [],
    activeListId: null,
    pantry: [],
    prices: {},
    ui: { tab: 'plan', savedFilter: 'all' },
  };
}

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return mergeState(d, s);
  } catch (e) {
    console.warn('Could not read saved data', e);
    return d;
  }
}

function mergeState(d, s) {
  const out = { ...d, ...s };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.ui = { ...d.ui, ...(s.ui || {}) };
  out.plan = s.plan ? { ...defaultPlan(), ...s.plan } : d.plan;
  for (const k of ['customFoods', 'saved', 'lists', 'pantry']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.prices || typeof out.prices !== 'object') out.prices = {};
  return out;
}

export const state = load();

let saveTimer = null;
export function save(now = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error(e);
      alert('Could not save. Storage may be full. Export a backup from More.');
    }
  };
  if (now) write();
  else saveTimer = setTimeout(write, 150);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* not supported */ }
  return false;
}

export function exportData() {
  return JSON.stringify({ app: 'preplist', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importData(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === 'preplist' ? obj.data : obj;
  if (!data || typeof data !== 'object' || !data.settings) throw new Error('This file is not a Prep List backup.');
  const merged = mergeState(defaults(), data);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, merged);
  save(true);
}

export function resetAll() {
  localStorage.removeItem(KEY);
  const d = defaults();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, d);
  save(true);
}
