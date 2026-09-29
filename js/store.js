// Local storage for everything. No account, no server.
import { SEED_TEMPLATES, defaultWeekDays } from './templates.js';
import { mondayOf } from './week.js';

const KEY = 'preplist.v1';

export const DEFAULT_STORES = ['Harris Teeter', 'Kroger', 'Walmart', 'Aldi', 'Food Lion', 'Costco'];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function newWeek(start, days) {
  return { id: uid(), start, days: days || emptyDays(), listId: null, prepDone: {}, closed: false, createdAt: Date.now() };
}
export function emptyDays() {
  return Array.from({ length: 7 }, () => ({ breakfast: { t: null }, lunch: { t: null }, dinner: { t: null } }));
}

function defaults() {
  const week = newWeek(mondayOf(new Date()), defaultWeekDays());
  return {
    version: 2,
    settings: {
      units: 'imperial',
      kcal: 2200,
      protein: 160,
      people: 1,
      split: { breakfast: 25, lunch: 35, dinner: 40 },
      prepMode: 'once',
      containers: 8,
      containerOz: 30,
      fridgeDays: 4,
      currentStore: '',
      usdaKey: '',
      proxyUrl: '',
      proxyToken: '',
      krogerLocationId: '',
      krogerLocationName: '',
      krogerStoreLabel: 'Kroger',
      stores: DEFAULT_STORES.slice(),
      priceStore: '',
      subtractPantry: true,
      a2hsDismissed: false,
    },
    templates: clone(SEED_TEMPLATES),
    weeks: [week],
    currentWeekId: week.id,
    customFoods: [],
    lists: [],
    activeListId: null,
    pantry: [],
    prices: {},
    storeOrders: {},
    trips: [],
    saved: [],
    ui: { tab: 'week' },
  };
}

function mergeState(d, s) {
  const out = { ...d, ...s };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.settings.split = { ...d.settings.split, ...((s.settings && s.settings.split) || {}) };
  out.ui = { ...d.ui, ...(s.ui || {}) };
  for (const k of ['customFoods', 'saved', 'lists', 'pantry', 'templates', 'weeks', 'trips']) if (!Array.isArray(out[k])) out[k] = d[k];
  for (const k of ['prices', 'storeOrders']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (!(s.version >= 2)) {
    // Upgrade from version 1: new weekly loop, keep lists, prices, pantry, custom foods.
    out.version = 2;
    out.templates = d.templates;
    out.weeks = d.weeks;
    out.currentWeekId = d.currentWeekId;
    out.ui = { tab: 'week' };
    if (s.settings && s.settings.fridgeDays) out.settings.fridgeDays = s.settings.fridgeDays;
    if (s.plan && s.plan.kcal) out.settings.kcal = s.plan.kcal;
    if (s.plan && s.plan.protein) out.settings.protein = s.plan.protein;
    out.upgradedFromV1 = true;
    delete out.plan;
    delete out.recipe;
  }
  if (!out.weeks.length) {
    const w = newWeek(mondayOf(new Date()), defaultWeekDays());
    out.weeks = [w];
    out.currentWeekId = w.id;
  }
  return out;
}

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    return mergeState(d, JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
    return d;
  }
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

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
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
