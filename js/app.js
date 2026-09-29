// Prep List v2: the weekly loop. Plan the week, shop, prep, eat, repeat.
import { state as S, save, uid, clone, newWeek, emptyDays, requestPersist, exportData, importData, resetAll } from './store.js';
import { SECTIONS, makeFoodIndex, sectionName, sectionOrder, ROLE_SHARE } from './foods.js';
import {
  fmtNum, fmtWeight, fmtMoney, fmtQty, fmtPortion, buildList, parseRecipeText, parseIngredientLine, extractRecipeFromHtml,
  matchFood, toGrams, unitLabel, normName, cap, priceKey, estimateCost, listPriceSummary, proteinValue, listToText, guessSection, LB, OZ,
} from './engine.js';
import {
  SLOTS, SLOT_LABEL, KIND_LABEL, DAY_NAMES, DAY_LONG, slotKcal, scaleTemplate, templateBase, mealAt, dayTotals, weekNeeds,
  prepPlan, dayDate, shortDate, todayIndex, addDays, mondayOf, parseIso,
} from './week.js';
import {
  esc, ICONS, checkbox, stepper, switchInput, toast, openSheet, actionSheet, confirmSheet, promptSheet, enableSwipe, swipeWrap,
  flipCapture, flipPlay, watchLargeTitle, closeTopSheet,
} from './ui.js';
import { usdaSearch, proxyConfigured, proxyHealth, fetchRecipePage, aiParseRecipe, krogerLocations, krogerProducts, scanReceipt } from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let foods, tmap;
function refresh() {
  foods = makeFoodIndex(S.customFoods);
  tmap = new Map(S.templates.map((t) => [t.id, t]));
}
refresh();
const ctx = () => ({ foods, tmap, settings: S.settings });
const U = () => S.settings.units;
const numOrNull = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : null; };
const foodName = (f) => (f ? f.short || f.name : 'Unknown food');
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const stepHandlers = {};
const scrollPos = {};

function curWeek() {
  return S.weeks.find((w) => w.id === S.currentWeekId) || S.weeks[S.weeks.length - 1];
}
function weekList(w) {
  return w.listId ? S.lists.find((l) => l.id === w.listId) || null : null;
}
function markDirty(w = curWeek()) {
  if (weekList(w)) w.listDirty = true;
}

/* =========================================================
   Router
   ========================================================= */
const VIEWS = { week: renderWeek, shop: renderShop, prep: renderPrep, meals: renderMeals, more: renderMore };
function go(tab) {
  scrollPos[S.ui.tab] = window.scrollY;
  S.ui.tab = tab;
  save();
  render();
  window.scrollTo(0, scrollPos[tab] || 0);
}
function render() {
  const tab = VIEWS[S.ui.tab] ? S.ui.tab : 'week';
  S.ui.tab = tab;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  VIEWS[tab]();
  watchLargeTitle($('#view-' + tab));
  updateWakeLock();
  if (tab !== 'shop') hidePriceBar();
}
function setNav(title, left = '', right = '') {
  $('#nav-title').textContent = title;
  $('#nav-left').innerHTML = left;
  $('#nav-right').innerHTML = right;
}
function a2hsBanner() {
  if (!isIOS || isStandalone() || S.settings.a2hsDismissed) return '';
  return `<div class="banner"><div style="flex:1"><div class="bt">Add Prep List to your Home Screen</div><div class="bs">Tap ${ICONS.share} Share, then Add to Home Screen. iOS can clear data for websites that are not installed. Export a backup in More too.</div></div><button class="x" data-action="a2hs-dismiss" aria-label="Dismiss">&times;</button></div>`;
}

/* ---------- Screen wake lock (shopping and cooking) ---------- */
let wakeLock = null;
async function updateWakeLock() {
  const want = (S.ui.tab === 'shop' && S.ui.shopMode) || (S.ui.tab === 'prep') || (S.timers || []).some((t) => !t.done);
  try {
    if (want && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* not supported or denied */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock = null; updateWakeLock(); tickTimers(); } });

/* =========================================================
   WEEK
   ========================================================= */
function weekStage(w) {
  const l = weekList(w);
  if (!l) return 'plan';
  if (l.items.some((i) => !i.checked)) return 'shop';
  const sessions = prepPlan(w, ctx()).filter((s) => s.meals.length);
  if (sessions.some((s) => !(w.prepDone || {})[s.id])) return 'prep';
  return 'eat';
}

function kindTag(t) {
  return t ? `<span class="kind ${t.kind}">${esc(KIND_LABEL[t.kind] || '')}</span>` : '';
}

function renderWeek() {
  const el = $('#view-week');
  const w = curWeek();
  const st = S.settings;
  const l = weekList(w);
  const stage = weekStage(w);
  const plan = prepPlan(w, ctx());
  const ti = todayIndex(w);
  const d0 = dayDate(w, 0);
  const d6 = dayDate(w, 6);
  const isCurrent = ti >= 0 && ti <= 6;
  setNav(isCurrent ? 'This Week' : `Week of ${shortDate(d0)}`, `<button class="nav-btn" data-action="week-history">Weeks</button>`, `<button class="nav-btn" data-action="week-menu" aria-label="Week options">${ICONS.more}</button>`);

  const steps = ['plan', 'shop', 'prep', 'eat'];
  const si = steps.indexOf(stage);
  const loopHtml = `<div class="loop">${['Plan', 'Shop', 'Prep', 'Eat'].map((n, i) => `<div class="loop-step ${i < si ? 'done' : i === si ? 'now' : ''}"><span class="dot">${i < si ? '✓' : i + 1}</span>${n}</div>`).join('')}</div>`;
  let msg = '', btn = '';
  if (stage === 'plan') {
    msg = 'Pick meals below, then build one list for the whole week.';
    btn = `<button class="btn" data-action="week-build">Build Shopping List</button>`;
  } else if (stage === 'shop') {
    const left = l.items.filter((i) => !i.checked).length;
    msg = `${left} of ${l.items.length} items left to buy${st.currentStore ? ` at ${esc(st.currentStore)}` : ''}.`;
    btn = `<button class="btn" data-action="go-shop">Go Shopping</button>`;
  } else if (stage === 'prep') {
    const s = plan.find((x) => x.meals.length && !(w.prepDone || {})[x.id]);
    msg = `${esc(s.name)}: ${s.containers} containers, about ${s.total} min of cooking.`;
    btn = `<button class="btn" data-action="go-prep" data-s="${s.id}">Start ${esc(s.name)}</button>`;
  } else {
    msg = 'Shopping and prep are done. Enjoy the week.';
    btn = `<button class="btn" data-action="week-next">Plan Next Week</button>`;
  }
  const banners = [];
  if (l && w.listDirty) banners.push(`<div class="info-banner">You changed meals after building the list. <button data-action="week-update-list" style="color:var(--accent);font-weight:600;min-height:32px">Update list</button></div>`);
  for (const s of plan) {
    if (s.over) banners.push(`<div class="warn-banner"><b>${esc(s.name)} needs ${s.containers} containers and you have ${s.cap}.</b> ${st.prepMode === 'once' ? 'Switch to prepping twice a week, or ' : ''}make a prepped meal a fresh or easy one.</div>`);
  }

  const split = st.split;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const tot = dayTotals(w, i, ctx());
    const past = isCurrent && i < ti;
    const lowP = !tot.out && st.protein > 0 && tot.planned === 3 && tot.p < st.protein * 0.9;
    const meta = tot.planned ? `${fmtNum(tot.kcal)} kcal · <span class="${lowP ? 'warn' : ''}">${fmtNum(tot.p)} g protein</span>${tot.out ? ' + eating out' : ''}` : tot.out ? 'Eating out' : 'Nothing planned';
    const rows = SLOTS.map((slot) => {
      const cell = w.days[i][slot];
      const t = mealAt(w, i, slot, tmap);
      let title, extra = '';
      if (cell && cell.out) title = `<span class="row-title">Eating out</span><span class="kind out">Out</span>`;
      else if (t) {
        title = `<span class="row-title">${esc(t.name)}</span>${kindTag(t)}`;
        const m = plan.flatMap((s) => s.meals).find((x) => x.day === i && x.slot === slot);
        if (m && m.storage === 'freeze') extra = `<div class="row-sub">Freeze on prep day, thaw ${DAY_NAMES[(i + 6) % 7]} night</div>`;
        else if (m && m.storage === 'late') extra = `<div class="row-sub warn">Past fridge life. Prep twice a week or move it earlier.</div>`;
      } else title = `<span class="row-title empty">Add ${slot}</span>`;
      return `<button class="row tappable slot-row" data-action="slot-pick" data-day="${i}" data-slot="${slot}" style="width:100%;text-align:left"><span class="slot">${SLOT_LABEL[slot]}</span><div class="row-main">${title}${extra}</div>${ICONS.chevron}</button>`;
    }).join('');
    days.push(`<div class="day-head ${past ? 'past' : ''}"><span class="dn">${DAY_LONG[i]}${isCurrent && i === ti ? '<span class="tag">Today</span>' : ''}</span><span class="dm">${meta}</span></div><div class="group">${rows}</div>`);
  }
  const prevWeek = S.weeks.filter((x) => x.start < w.start).sort((a, b) => (a.start < b.start ? 1 : -1))[0];

  el.innerHTML = `
    ${a2hsBanner()}
    <h1 class="large-title">${isCurrent ? 'This Week' : `Week of ${shortDate(d0)}`}</h1>
    <div class="subtitle">${shortDate(d0)} to ${shortDate(d6)}</div>
    <div class="group">${loopHtml}<div class="loop-msg">${msg}</div><div class="loop-btn">${btn}</div></div>
    ${banners.join('')}

    <div class="group-header">Targets, per person</div>
    <div class="group">
      <div class="row field"><label for="w-kcal">Calories per day</label><input id="w-kcal" type="number" inputmode="numeric" data-bind="settings.kcal" data-type="num" value="${esc(st.kcal)}"></div>
      <div class="row field"><label for="w-pro">Protein goal (g)</label><input id="w-pro" type="number" inputmode="numeric" data-bind="settings.protein" data-type="num" value="${esc(st.protein ?? '')}" placeholder="None"></div>
      <button class="row tappable" data-action="split-edit" style="width:100%;text-align:left"><span class="row-main">Calorie split</span><span class="row-value">${split.breakfast} / ${split.lunch} / ${split.dinner}</span>${ICONS.chevron}</button>
      <div class="row"><span class="row-main">People eating</span>${stepper('settings.people', st.people, 1, 8)}</div>
    </div>
    <div class="group-footer">Each meal is sized to its share of your calories: breakfast ${fmtNum(slotKcal(st, 'breakfast'))}, lunch ${fmtNum(slotKcal(st, 'lunch'))}, dinner ${fmtNum(slotKcal(st, 'dinner'))} kcal.</div>

    <div class="group-header">Prep day</div>
    <div class="seg">${[['once', 'Once a week'], ['twice', 'Twice a week']].map(([k, n]) => `<button class="${st.prepMode === k ? 'on' : ''}" data-action="prep-mode" data-m="${k}">${n}</button>`).join('')}</div>
    <div class="spacer"></div>
    <div class="group">${plan.map((s) => {
      const fz = s.meals.filter((m) => m.storage === 'freeze').length;
      const sub = s.meals.length ? `${s.days.length === 7 ? 'Covers Mon to Sun' : `Covers ${DAY_NAMES[s.days[0]]} to ${DAY_NAMES[s.days[s.days.length - 1]]}`} · about ${s.total} min cooking${fz ? ` · ${fz} to freeze` : ''}` : 'No prepped meals';
      return `<button class="row tappable" data-action="go-prep" data-s="${s.id}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(s.name)}</div><div class="row-sub">${sub}</div></div><span class="row-value ${s.over ? 'bad' : ''}">${s.containers} of ${s.cap}</span>${ICONS.chevron}</button>`;
    }).join('')}</div>
    <div class="group-footer">Containers used out of your ${st.containers} (${st.containerOz} oz each). Cooked food keeps about ${st.fridgeDays} days in the fridge, so later prepped meals go in the freezer.</div>

    ${days.join('')}

    <div class="spacer"></div><div class="spacer"></div>
    ${prevWeek ? `<button class="btn secondary" data-action="week-repeat">Same Meals as Last Week</button><div class="spacer"></div>` : ''}
    <button class="btn secondary" data-action="week-next">Start Next Week</button>
  `;
}

function openSlotPicker(day, slot) {
  const w = curWeek();
  let scope = 'day';
  const target = slotKcal(S.settings, slot);
  const rowFor = (t) => {
    const sc = scaleTemplate(t, target, foods);
    return `<button class="row tappable" data-pick="${esc(t.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(t.name)}${kindTag(t)}</div><div class="row-sub">${fmtNum(sc.totals.kcal)} kcal · ${fmtNum(sc.totals.p)} g protein${t.method && t.method.min ? ` · ${esc(t.method.how || '')} ${t.method.min} min` : ''}</div></div></button>`;
  };
  const kindsOrder = { prep: 0, fresh: 1, easy: 2 };
  const sorted = (arr) => arr.slice().sort((a, b) => (kindsOrder[a.kind] - kindsOrder[b.kind]) || a.name.localeCompare(b.name));
  const mine = sorted(S.templates.filter((t) => t.slot === slot));
  const other = sorted(S.templates.filter((t) => t.slot !== slot));
  openSheet({
    title: `${DAY_LONG[day]} ${slot}`,
    full: true,
    body: `
      <div class="spacer"></div>
      <div class="seg" id="sp-scope"><button class="on" data-scope="day">Just ${DAY_NAMES[day]}</button><button data-scope="weekdays">Mon to Fri</button><button data-scope="all">Every day</button></div>
      <div class="group-header">${SLOT_LABEL[slot]} meals</div>
      <div class="group">${mine.map(rowFor).join('') || '<div class="row"><span class="row-sub">None yet.</span></div>'}</div>
      <div class="group-header">Other</div>
      <div class="group">
        <button class="row tappable" data-pick="__out" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">Eating out</div><div class="row-sub">No groceries for this meal</div></div></button>
        <button class="row tappable" data-pick="__none" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">Nothing planned</div></div></button>
        <button class="row tappable row-action" data-pick="__new" style="width:100%">${ICONS.plus}<span class="row-title">New Meal</span></button>
      </div>
      ${other.length ? `<div class="group-header">Meals from other slots</div><div class="group">${other.map(rowFor).join('')}</div><div class="group-footer">Portions resize to this slot's calorie target.</div>` : ''}
    `,
    onMount(el, close) {
      el.addEventListener('click', (e) => {
        const sc = e.target.closest('[data-scope]');
        if (sc) {
          scope = sc.dataset.scope;
          $$('[data-scope]', el).forEach((b) => b.classList.toggle('on', b === sc));
          return;
        }
        const p = e.target.closest('[data-pick]');
        if (!p) return;
        const v = p.dataset.pick;
        if (v === '__new') {
          close();
          openTemplateEditor(null, { slot }, (t) => { assign(t.id); });
          return;
        }
        assign(v);
        close();
      });
    },
  });
  function assign(v) {
    const daysIdx = scope === 'all' ? [0, 1, 2, 3, 4, 5, 6] : scope === 'weekdays' ? [0, 1, 2, 3, 4] : [day];
    for (const d of daysIdx) w.days[d][slot] = v === '__out' ? { t: null, out: true } : v === '__none' ? { t: null } : { t: v };
    markDirty(w);
    save();
    renderWeek();
  }
}

function openSplitEditor() {
  const sp = S.settings.split;
  openSheet({
    title: 'Calorie Split',
    right: {
      label: 'Save',
      action: (el) => {
        const v = SLOTS.map((s) => Math.max(0, parseFloat($(`[name="${s}"]`, el).value) || 0));
        const sum = v.reduce((a, b) => a + b, 0);
        if (!sum) { toast('Enter at least one percent'); return false; }
        SLOTS.forEach((s, i) => (sp[s] = Math.round((v[i] / sum) * 100)));
        markDirty();
        save();
        renderWeek();
      },
    },
    body: `<div class="spacer"></div><div class="group">${SLOTS.map((s) => `<div class="row field"><label>${SLOT_LABEL[s]} (%)</label><input name="${s}" type="number" inputmode="numeric" value="${sp[s]}"></div>`).join('')}</div><div class="group-footer">Share of daily calories for each meal. Numbers are rescaled to total 100. Eating out does not change the others.</div>`,
  });
}

async function weekMenu() {
  const v = await actionSheet('This week', [
    { label: 'Same Meals as Last Week', value: 'repeat' },
    { label: 'Clear All Meals', value: 'clear' },
    { label: 'Start Next Week', value: 'next' },
    { label: 'Past Weeks', value: 'history' },
  ]);
  if (v === 'repeat') repeatLastWeek();
  if (v === 'clear') {
    if (await confirmSheet('Clear every meal this week?', 'Your list and pantry are not changed.', 'Clear Meals')) {
      curWeek().days = emptyDays();
      markDirty();
      save();
      renderWeek();
    }
  }
  if (v === 'next') openCloseOut();
  if (v === 'history') openWeekHistory();
}

function repeatLastWeek() {
  const w = curWeek();
  const prev = S.weeks.filter((x) => x.start < w.start).sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  if (!prev) { toast('No earlier week yet'); return; }
  w.days = clone(prev.days);
  markDirty(w);
  save();
  renderWeek();
  toast('Copied last week\'s meals');
}

function openWeekHistory() {
  const weeks = S.weeks.slice().sort((a, b) => (a.start < b.start ? 1 : -1));
  openSheet({
    title: 'Weeks',
    left: { label: 'Close' },
    body: `<div class="spacer"></div><div class="group">${weeks.map((w) => `<button class="row tappable" data-w="${esc(w.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">Week of ${shortDate(parseIso(w.start))}${w.id === S.currentWeekId ? '<span class="tag">Showing</span>' : ''}</div><div class="row-sub">${w.closed ? 'Finished' : 'Open'}${weekList(w) ? ' · has a list' : ''}</div></div>${ICONS.chevron}</button>`).join('')}</div>`,
    onMount(el, close) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w]');
        if (!b) return;
        S.currentWeekId = b.dataset.w;
        const w = curWeek();
        if (weekList(w)) S.activeListId = w.listId;
        save();
        close();
        go('week');
      });
    },
  });
}

/** Close out the week: assume planned meals were eaten, show what should be left, start the next week. */
function openCloseOut() {
  const w = curWeek();
  const used = new Map();
  for (const n of weekNeeds(w, ctx())) if (n.grams != null) used.set(n.key, (used.get(n.key) || 0) + n.grams);
  const left = S.pantry
    .map((p) => ({ p, rest: p.grams == null ? null : Math.max(0, p.grams - (used.get(p.key) || 0)) }))
    .filter((x) => x.rest == null || x.rest > 5);
  const nextStart = [addDays(w.start, 7), mondayOf(new Date())].sort().pop();
  openSheet({
    title: 'Start Next Week',
    full: true,
    body: `
      <div class="group-footer" style="padding-top:12px">This week's planned meals come out of your pantry. Here is what should be left. Turn off anything you used up or tossed.</div>
      <div class="group-header">Left over</div>
      <div class="group">${left.length ? left.map((x, i) => `<div class="row"><div class="row-main"><div class="row-title">${esc(x.p.name)}</div><div class="row-sub">${x.rest == null ? 'Have plenty' : esc(fmtPortion(x.p.foodId ? foods.get(x.p.foodId) : null, x.rest, U())) + ' left'}</div></div>${switchInput('keep' + i, true)}</div>`).join('') : '<div class="row"><span class="row-sub">Nothing tracked yet. Checking items off on the Shop tab adds them to your pantry automatically.</span></div>'}</div>
      <div class="group-header">Next week</div>
      <div class="group"><div class="row"><span class="row-main">Repeat this week's meals</span>${switchInput('repeat', true)}</div></div>
      <div class="spacer"></div>
      <button class="btn" data-a="go">Start Week of ${shortDate(parseIso(nextStart))}</button>
      <div class="spacer"></div>
    `,
    onMount(el, close) {
      $('[data-a="go"]', el).addEventListener('click', () => {
        const keepIds = new Set(left.filter((x, i) => $(`[name="keep${i}"]`, el).checked).map((x) => x.p.id));
        const map = new Map(left.map((x) => [x.p.id, x.rest]));
        S.pantry = S.pantry.filter((p) => keepIds.has(p.id)).map((p) => ({ ...p, grams: map.get(p.id) ?? p.grams }));
        w.closed = true;
        const existing = S.weeks.find((x) => x.start === nextStart);
        const nw = existing || newWeek(nextStart, $('[name="repeat"]', el).checked ? clone(w.days) : emptyDays());
        if (!existing) S.weeks.push(nw);
        S.currentWeekId = nw.id;
        save();
        close();
        window.scrollTo(0, 0);
        go('week');
        toast('New week started');
      });
    },
  });
}

/* =========================================================
   LISTS (shared by Week and Shop)
   ========================================================= */
function activeList() {
  let l = S.lists.find((x) => x.id === S.activeListId);
  if (!l && S.lists.length) {
    l = S.lists[0];
    S.activeListId = l.id;
  }
  return l || null;
}
function makeList(needs, name) {
  const list = buildList(needs, { foods, pantry: S.pantry, subtract: S.settings.subtractPantry, units: U(), name, uid });
  list.needs = needs;
  S.lists.unshift(list);
  S.activeListId = list.id;
  save();
  return list;
}
function rebuildList(list) {
  if (!list.needs) return;
  const fresh = buildList(list.needs, { foods, pantry: S.pantry, subtract: S.settings.subtractPantry, units: U(), name: list.name, uid });
  const old = new Map(list.items.filter((i) => !i.manual).map((i) => [i.key, i]));
  for (const it of fresh.items) {
    const o = old.get(it.key);
    if (o) {
      it.id = o.id;
      if (o.checked) { it.checked = true; it.checkedAt = o.checkedAt; it.pantryAdded = o.pantryAdded; }
      if (o.edited) { it.name = o.name; it.qty = o.qty; it.section = o.section; it.edited = true; }
    }
  }
  const manual = list.items.filter((i) => i.manual);
  manual.forEach((m, k) => (m.order = fresh.items.length + k));
  list.items = [...fresh.items, ...manual];
}
function addPantry(foodId, grams) {
  const key = 'f:' + foodId;
  let p = S.pantry.find((x) => x.key === key);
  if (!p) {
    if (grams <= 0) return;
    const f = foods.get(foodId);
    p = { id: uid(), key, foodId, name: foodName(f), grams: 0 };
    S.pantry.push(p);
  }
  if (p.grams == null) return; // "have plenty" stays as is
  p.grams = Math.max(0, p.grams + grams);
  if (p.grams < 1) S.pantry = S.pantry.filter((x) => x !== p);
}

/* =========================================================
   SHOP
   ========================================================= */
function shopStore(list) {
  if (S.settings.currentStore) return S.settings.currentStore;
  const sum = list ? listPriceSummary(list, S.prices, S.settings.stores) : [];
  return sum[0] ? sum[0].store : '';
}
function aisleRank(store, it) {
  const o = S.storeOrders[store] && S.storeOrders[store][priceKey(it)];
  if (o) return o.r;
  return (sectionOrder(it.section) + 0.5) / (SECTIONS.length + 1);
}

function renderShop() {
  const el = $('#view-shop');
  const list = activeList();
  const shopping = !!S.ui.shopMode && !!list;
  const leftBtn = shopping ? '' : `<button class="nav-btn" data-action="list-switch">${ICONS.listIcon}<span>Lists</span></button>`;
  if (!list) {
    setNav('Shop', leftBtn, '');
    el.innerHTML = `<h1 class="large-title">Shop</h1><div class="empty"><div class="et">No list yet</div>Plan your week on the Week tab and tap Build Shopping List. Or start an empty list.</div><button class="btn" data-action="week-build">Build From This Week</button><div class="spacer"></div><button class="btn secondary" data-action="list-new-empty">New Empty List</button>`;
    return;
  }
  const store = shopStore(list);
  const n = list.items.length;
  const done = list.items.filter((i) => i.checked).length;
  let total = 0, priced = 0;
  for (const it of list.items) {
    const c = estimateCost(it, store && S.prices[priceKey(it)] ? S.prices[priceKey(it)][store] : null);
    if (c != null) { total += c; priced++; }
  }
  const priceLine = store && priced ? `Est. ${fmtMoney(total)} at ${esc(store)} (${priced} of ${n} priced)` : store ? `No prices logged at ${esc(store)} yet` : 'Pick a store to track prices';
  if (shopping) setNav(`Shopping at ${S.ui.tripStore || store}`, '', `<button class="nav-btn bold" data-action="trip-finish">Finish</button>`);
  else setNav(list.name, leftBtn, `<button class="nav-btn" data-action="list-menu" aria-label="List options">${ICONS.more}</button><button class="nav-btn" data-action="list-add-item" aria-label="Add item">${ICONS.compose}</button>`);

  let itemsHtml;
  if (shopping) {
    const s = S.ui.tripStore || store;
    const un = list.items.filter((i) => !i.checked).sort((a, b) => aisleRank(s, a) - aisleRank(s, b));
    const ch = list.items.filter((i) => i.checked).sort((a, b) => (a.checkedAt || 0) - (b.checkedAt || 0));
    const learned = S.storeOrders[s] && Object.keys(S.storeOrders[s]).length;
    itemsHtml = `<div class="group-footer" style="padding-top:4px;padding-bottom:8px">${learned ? `Sorted by how you walked ${esc(s)} last time.` : `Sorted by section for now. Check items off in the order you find them and the app learns ${esc(s)}'s layout.`}</div><div class="group" id="shop-flat">${[...un, ...ch].map((it) => itemRow(it, s, true)).join('')}</div>`;
  } else {
    const groups = new Map();
    for (const it of list.items) {
      const sec = it.section || 'other';
      if (!groups.has(sec)) groups.set(sec, []);
      groups.get(sec).push(it);
    }
    itemsHtml = [...groups.keys()].sort((a, b) => sectionOrder(a) - sectionOrder(b)).map((sec) => {
      const items = groups.get(sec).slice().sort((a, b) => (a.checked - b.checked) || a.order - b.order);
      const left = items.filter((i) => !i.checked).length;
      const collapsed = !!(list.collapsed || {})[sec];
      return `<button class="sec-toggle ${collapsed ? 'collapsed' : ''}" data-action="sec-toggle" data-sec="${esc(sec)}" aria-expanded="${!collapsed}"><span class="sec-name">${esc(sectionName(sec))}</span><span class="sec-count">${left || 'Done'}</span>${ICONS.down}</button><div class="group ${collapsed ? 'hidden' : ''}" data-secgroup="${esc(sec)}">${items.map((it) => itemRow(it, store, false)).join('')}</div>`;
    }).join('');
  }

  el.innerHTML = `
    <h1 class="large-title" ${shopping ? '' : 'data-action="list-rename"'}>${shopping ? 'Shopping' : esc(list.name)}</h1>
    <div class="subtitle">${done} of ${n} checked · <button data-action="store-pick" style="color:var(--accent);min-height:30px">${priceLine}</button></div>
    <div class="progress"><i style="width:${n ? (done / n) * 100 : 0}%"></i></div>
    ${shopping ? '' : `<div class="spacer"></div><div class="group"><button class="row tappable store-row" data-action="store-pick" style="width:100%;text-align:left"><span class="row-main">Store</span><span class="row-value">${esc(S.settings.currentStore || 'Choose')}</span>${ICONS.chevron}</button></div><div class="spacer"></div><button class="btn" data-action="trip-start">Start Shopping</button>`}
    <div class="spacer"></div>
    <div class="group"><div class="row quick-add"><input class="text-input" id="qa" type="text" placeholder="Add: milk, 2 lb turkey, paper towels" autocomplete="off" enterkeyhint="done"><button class="btn inline" data-action="quick-add">Add</button></div></div>
    ${itemsHtml}
    ${shopping ? `<div class="spacer"></div><button class="btn" data-action="trip-finish">Finish Trip</button>` : ''}
    ${!shopping && proxyConfigured() ? `<div class="spacer"></div><button class="btn secondary" data-action="receipt-scan">Scan a Receipt for Prices</button>` : ''}
  `;
  enableSwipe(el, (id, wrap) => {
    list.items = list.items.filter((i) => i.id !== id);
    save();
    wrap.style.maxHeight = wrap.offsetHeight + 'px';
    wrap.classList.add('removing');
    requestAnimationFrame(() => (wrap.style.maxHeight = '0px'));
    setTimeout(renderShop, 260);
  });
}

function itemRow(it, store, shopping) {
  const entry = store && S.prices[priceKey(it)] ? S.prices[priceKey(it)][store] : null;
  const cost = estimateCost(it, entry);
  const sub = shopping ? [] : (it.detail || []).map(esc);
  if (it.note) sub.push(esc(it.note));
  if (cost != null) sub.push(`<span class="price-tag">Est. ${fmtMoney(cost)} at ${esc(store)}</span>`);
  const sec = shopping ? `<div class="shop-sec">${esc(sectionName(it.section))}</div>` : '';
  return swipeWrap(it.id, `<div class="row item-row ${it.checked ? 'done' : ''} ${shopping ? 'bigger' : ''}" data-flip="${esc(it.id)}">${checkbox(it.checked, 'item-check', it.id)}<div class="row-main tap-area" data-action="item-edit" data-id="${esc(it.id)}"><div class="row-title"><span>${esc(it.name)}</span>${it.qty ? `<span class="qty">${esc(it.qty)}</span>` : ''}</div>${sub.length ? `<div class="row-sub">${sub.join('<br>')}</div>` : ''}${sec}</div></div>`, 'check-row');
}

function toggleItem(id, btn) {
  const list = activeList();
  const it = list && list.items.find((i) => i.id === id);
  if (!it) return;
  it.checked = !it.checked;
  if (it.checked) {
    it.checkedAt = Date.now();
    if (it.foodId && it.buyG > 0) { addPantry(it.foodId, it.buyG); it.pantryAdded = it.buyG; }
    if (S.ui.shopMode) {
      S.ui.tripSeq = (S.ui.tripSeq || []).concat(priceKey(it));
      showPriceBar(it);
    }
  } else {
    if (it.foodId && it.pantryAdded) { addPantry(it.foodId, -it.pantryAdded); it.pantryAdded = 0; }
    if (S.ui.tripSeq) S.ui.tripSeq = S.ui.tripSeq.filter((k) => k !== priceKey(it));
  }
  save();
  btn.classList.toggle('on', it.checked);
  btn.setAttribute('aria-checked', it.checked);
  btn.closest('.item-row').classList.toggle('done', it.checked);
  const view = $('#view-shop');
  clearTimeout(toggleItem.t);
  toggleItem.t = setTimeout(() => {
    const before = flipCapture(view);
    const y = window.scrollY;
    renderShop();
    window.scrollTo(0, y);
    flipPlay(view, before);
  }, 300);
}

/* ---------- Price bar (shopping mode) ---------- */
let priceBarTimer;
function hidePriceBar() {
  const pb = $('#pricebar');
  if (!pb) return;
  pb.classList.remove('show');
  document.body.classList.remove('pb-open');
  clearTimeout(priceBarTimer);
  setTimeout(() => { if (!pb.classList.contains('show')) pb.classList.add('hidden'); }, 250);
}
function showPriceBar(it) {
  const store = S.ui.tripStore || S.settings.currentStore;
  if (!store) return;
  const key = priceKey(it);
  const last = S.prices[key] && S.prices[key][store];
  const per = last ? last.per : it.eachCount ? 'each' : it.pkgParts && it.pkgParts.length === 1 ? 'pkg' : it.buyG && !it.pkgParts ? 'lb' : 'pkg';
  const pb = $('#pricebar');
  pb.innerHTML = `<span class="pb-name">${esc(it.name)}</span><input type="number" inputmode="decimal" step="0.01" placeholder="$" value="${last ? last.price.toFixed(2) : ''}" aria-label="Price"><select aria-label="Price is">${[['pkg', 'pkg'], ['lb', '/lb'], ['each', 'each']].map(([v, l]) => `<option value="${v}" ${per === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="pb-save">Save</button><button class="pb-x" aria-label="Skip">&times;</button>`;
  pb.classList.remove('hidden');
  document.body.classList.add('pb-open');
  requestAnimationFrame(() => pb.classList.add('show'));
  const inp = $('input', pb);
  const arm = () => { clearTimeout(priceBarTimer); priceBarTimer = setTimeout(() => { if (document.activeElement !== inp) hidePriceBar(); }, 9000); };
  arm();
  inp.addEventListener('focus', () => clearTimeout(priceBarTimer));
  inp.addEventListener('blur', arm);
  $('.pb-x', pb).onclick = hidePriceBar;
  $('.pb-save', pb).onclick = () => {
    const price = parseFloat(inp.value);
    if (!(price >= 0)) { inp.focus(); return; }
    savePrice(it, store, price, $('select', pb).value, it.pkgParts && it.pkgParts.length === 1 ? it.pkgParts[0].label : '');
    hidePriceBar();
    toast(`${fmtMoney(price)} saved for ${store}`);
    const y = window.scrollY;
    renderShop();
    window.scrollTo(0, y);
  };
}

function savePrice(it, store, price, per, label, source = '') {
  const key = priceKey(it);
  const single = it.pkgParts && it.pkgParts.length === 1 && it.pkgParts[0].label === label ? it.pkgParts[0].g : null;
  S.prices[key] = S.prices[key] || {};
  S.prices[key][store] = { price, per, label: per === 'pkg' ? label : '', grams: per === 'pkg' ? single || parseSizeGrams(label, it.foodId) : null, date: Date.now(), source };
  if (!S.settings.stores.includes(store)) S.settings.stores.push(store);
  save();
}

async function pickStore() {
  const v = await actionSheet('Which store?', [...S.settings.stores.map((s) => ({ label: s, value: s })), { label: 'Edit My Stores', value: '__edit' }], 'Prices, totals, and the learned aisle order are kept per store.');
  if (!v) return null;
  if (v === '__edit') { editStores(); return null; }
  S.settings.currentStore = v;
  save();
  render();
  return v;
}

async function startTrip() {
  let store = S.settings.currentStore;
  if (!store) store = await pickStore();
  if (!store) return;
  S.ui.shopMode = true;
  S.ui.tripStore = store;
  S.ui.tripSeq = [];
  S.ui.tripStart = Date.now();
  save();
  window.scrollTo(0, 0);
  render();
  toast('Screen stays on while you shop');
}

function finishTrip() {
  const list = activeList();
  const store = S.ui.tripStore || S.settings.currentStore;
  const seq = S.ui.tripSeq || [];
  // Learn aisle order: each item's position in the order you checked it off.
  if (store && seq.length > 1) {
    S.storeOrders[store] = S.storeOrders[store] || {};
    seq.forEach((k, i) => {
      const r = i / (seq.length - 1);
      const o = S.storeOrders[store][k];
      if (!o) S.storeOrders[store][k] = { r, n: 1 };
      else { const n = Math.min(o.n, 4); o.r = (o.r * n + r) / (n + 1); o.n = o.n + 1; }
    });
  }
  let total = 0, priced = 0, bought = 0;
  if (list) {
    for (const it of list.items) {
      if (!it.checked || !(it.checkedAt >= (S.ui.tripStart || 0))) continue;
      bought++;
      const c = estimateCost(it, S.prices[priceKey(it)] && S.prices[priceKey(it)][store]);
      if (c != null) { total += c; priced++; }
    }
  }
  if (bought) S.trips.push({ id: uid(), store, date: Date.now(), items: bought, priced, total });
  S.ui.shopMode = false;
  S.ui.tripSeq = [];
  save();
  hidePriceBar();
  render();
  toast(bought ? `Trip saved: ${bought} items${priced ? `, ${fmtMoney(total)} logged` : ''}` : 'Shopping mode off');
}

function quickAdd() {
  const inp = $('#qa');
  const text = inp.value.trim();
  if (!text) { inp.focus(); return; }
  const list = activeList();
  let order = list.items.length ? Math.max(...list.items.map((i) => i.order)) + 1 : 0;
  const added = [];
  for (const part of text.split(/[,\n;]+/)) {
    const p = parseIngredientLine(part);
    if (!p) continue;
    const food = matchFood(p.name, foods);
    const g = food && p.qty != null ? toGrams(p.qty, p.unit, food, p.parenG) : null;
    list.items.push({
      id: uid(), name: cap(p.name), manual: true, checked: false, order: order++,
      qty: p.qty != null ? `${fmtQty(p.qty)}${p.unit ? ' ' + unitLabel(p.unit, p.qty) : ''}` : '',
      section: food ? food.section : guessSection(p.name),
      key: food ? 'f:' + food.id : 'n:' + normName(p.name), foodId: food ? food.id : null, buyG: g,
    });
    added.push(cap(p.name));
  }
  save();
  renderShop();
  toast(added.length ? `Added ${added.join(', ')}` : 'Nothing to add');
}

function openItemEditor(item, isNew = false) {
  const list = activeList();
  const it = item || { id: uid(), name: '', qty: '', section: 'produce', checked: false, manual: true, order: list.items.length ? Math.max(...list.items.map((i) => i.order)) + 1 : 0, key: null };
  const key = () => it.key || 'n:' + normName(it.name);
  const stores = S.settings.stores;
  const pricesHtml = () => {
    const e = S.prices[key()] || {};
    const rows = Object.entries(e).sort((a, b) => a[1].price - b[1].price).map(([s, v]) => `<div class="row"><div class="row-main"><div class="row-title">${esc(s)}</div><div class="row-sub">${fmtMoney(v.price)} ${v.per === 'pkg' ? 'per package' + (v.label ? ` (${esc(v.label)})` : '') : 'per ' + esc(v.per)}${v.source ? ` · ${esc(v.source)}` : ''} · ${new Date(v.date).toLocaleDateString()}</div></div><span class="row-value">${(() => { const c = estimateCost(it, v); return c != null ? 'Est. ' + fmtMoney(c) : ''; })()}</span></div>`).join('');
    return rows || `<div class="row"><span class="row-sub">No prices logged for this item yet.</span></div>`;
  };
  const krogerReady = proxyConfigured() && S.settings.krogerLocationId;
  const defStore = S.settings.currentStore || stores[0];
  openSheet({
    title: isNew ? 'New Item' : 'Edit Item',
    full: true,
    right: {
      label: 'Done',
      action: (el) => {
        const name = $('[name="name"]', el).value.trim();
        if (!name) { if (isNew) return; toast('Name is required'); return false; }
        const qty = $('[name="qty"]', el).value.trim();
        const section = $('[name="section"]', el).value;
        const note = $('[name="note"]', el).value.trim();
        if (!isNew && (name !== it.name || qty !== it.qty || section !== it.section)) it.edited = true;
        Object.assign(it, { name, qty, section, note });
        if (isNew) { it.key = it.key || 'n:' + normName(name); list.items.push(it); }
        save();
        renderShop();
      },
    },
    body: `
      <div class="spacer"></div>
      <div class="group">
        <div class="row"><input class="text-input" name="name" type="text" placeholder="Item" value="${esc(it.name)}"></div>
        <div class="row field"><label>Amount</label><input name="qty" type="text" value="${esc(it.qty || '')}" placeholder="e.g. 2 lb"></div>
        <div class="row field"><label>Section</label><select name="section">${SECTIONS.map((s) => `<option value="${s.id}" ${it.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="row"><input class="text-input" name="note" type="text" placeholder="Note" value="${esc(it.note || '')}"></div>
      </div>
      ${(it.detail || []).length ? `<div class="group-footer">${it.detail.map(esc).join('<br>')}</div>` : ''}
      <div class="group-header">Log a price</div>
      <div class="group">
        <div class="row field"><label>Store</label><select name="pstore">${stores.map((s) => `<option ${s === defStore ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="row field"><label>Price ($)</label><input name="pprice" type="number" inputmode="decimal" step="0.01" placeholder="0.00"></div>
        <div class="row field"><label>Price is</label><select name="pper"><option value="pkg">per package</option><option value="lb">per lb</option><option value="kg">per kg</option><option value="each">each</option></select></div>
        <div class="row field"><label>Package size</label><input name="plabel" type="text" placeholder="optional" value="${esc(it.pkgParts && it.pkgParts.length === 1 ? it.pkgParts[0].label : '')}"></div>
        <button class="row tappable row-action" data-a="saveprice" style="width:100%"><span class="row-title">Save Price</span></button>
      </div>
      <div class="group-footer">Prices are only what you log, read from a receipt, or fetch live from Kroger. Never estimated.</div>
      <div class="group-header">Last prices paid</div>
      <div class="group" id="ie-prices">${pricesHtml()}</div>
      ${krogerReady ? `<div class="spacer"></div><div class="group"><button class="row tappable row-action" data-a="kroger" style="width:100%"><span class="row-title">Check Live Price at ${esc(S.settings.krogerLocationName || 'Kroger')}</span></button></div><div class="group" id="ie-kroger" style="margin-top:8px"></div>` : ''}
    `,
    onMount(el) {
      if (isNew) setTimeout(() => $('[name="name"]', el).focus(), 350);
      el.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'saveprice') {
          if (!it.name) it.name = $('[name="name"]', el).value.trim();
          if (!it.name) { toast('Name the item first'); return; }
          const price = parseFloat($('[name="pprice"]', el).value);
          if (!(price >= 0)) { toast('Enter a price'); return; }
          const store = $('[name="pstore"]', el).value;
          savePrice(it, store, price, $('[name="pper"]', el).value, $('[name="plabel"]', el).value.trim());
          $('#ie-prices', el).innerHTML = pricesHtml();
          $('[name="pprice"]', el).value = '';
          toast(`Saved ${fmtMoney(price)} at ${store}`);
        }
        if (a.dataset.a === 'kroger') {
          const box = $('#ie-kroger', el);
          box.innerHTML = `<div class="row"><span class="spinner"></span><span class="muted">Checking Kroger</span></div>`;
          try {
            const res = await krogerProducts($('[name="name"]', el).value.trim() || it.name, S.settings.krogerLocationId);
            const items = (res.items || []).filter((x) => x.price != null);
            box.innerHTML = items.length
              ? items.map((x, i) => `<button class="row tappable result-row" data-kr="${i}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(x.description)}</div><div class="row-sub">${esc(x.brand || '')} · ${esc(x.size || '')}${x.promo && x.promo < x.price ? ` · sale ${fmtMoney(x.promo)}` : ''}</div></div><span class="row-value">${fmtMoney(x.promo && x.promo < x.price ? x.promo : x.price)}</span></button>`).join('') + `<div class="row"><span class="row-sub">Tap a product to save its price for ${esc(S.settings.krogerStoreLabel)}.</span></div>`
              : `<div class="row"><span class="row-sub">No priced results at your selected store.</span></div>`;
            box.onclick = (ev) => {
              const b = ev.target.closest('[data-kr]');
              if (!b) return;
              const x = items[+b.dataset.kr];
              const price = x.promo && x.promo < x.price ? x.promo : x.price;
              savePrice(it, S.settings.krogerStoreLabel || 'Kroger', price, 'pkg', x.size || '', 'Kroger API');
              $('#ie-prices', el).innerHTML = pricesHtml();
              toast(`Saved ${fmtMoney(price)}`);
            };
          } catch (err) {
            box.innerHTML = `<div class="row"><span class="row-sub bad">${esc(err.message)}</span></div>`;
          }
        }
      });
    },
  });
}

function parseSizeGrams(s, foodId) {
  const m = String(s || '').toLowerCase().match(/(\d*\.?\d+)\s*(fl oz|oz|lb|lbs|g|kg|ct|count)\b/);
  if (!m) return null;
  const v = +m[1];
  const u = m[2];
  const f = foods.get(foodId);
  if (u === 'fl oz') return f && f.gPerCup ? (v / 8) * f.gPerCup : null;
  if (u === 'oz') return v * OZ;
  if (u === 'lb' || u === 'lbs') return v * LB;
  if (u === 'g') return v;
  if (u === 'kg') return v * 1000;
  return f && f.unit ? v * f.unit.g : null;
}

async function listMenu() {
  const list = activeList();
  if (!list) return;
  const opts = [
    { label: 'Share as Text', value: 'share' },
    { label: 'Copy as Text', value: 'copy' },
    { label: 'Compare Stores', value: 'compare' },
  ];
  if (proxyConfigured()) opts.push({ label: 'Scan a Receipt', value: 'receipt' });
  opts.push(
    { label: 'Recalculate (pantry, units)', value: 'rebuild' },
    { label: 'Uncheck All', value: 'uncheck' },
    { label: 'Remove Checked Items', value: 'clearchecked' },
    { label: 'Rename List', value: 'rename' },
    { label: 'Delete List', value: 'delete', danger: true },
  );
  const v = await actionSheet(list.name, opts);
  if (!v) return;
  const text = listToText(list, sectionName);
  if (v === 'share') {
    if (navigator.share) { try { await navigator.share({ title: list.name, text }); } catch (e) { /* cancelled */ } } else copyText(text);
  } else if (v === 'copy') copyText(text);
  else if (v === 'compare') openCompare(list);
  else if (v === 'receipt') $('#receipt-file').click();
  else if (v === 'rebuild') {
    if (!list.needs || !list.needs.length) { toast('This list has no planned items'); return; }
    rebuildList(list); save(); renderShop(); toast('List recalculated');
  } else if (v === 'uncheck') {
    for (const i of list.items) { if (i.pantryAdded && i.foodId) addPantry(i.foodId, -i.pantryAdded); i.pantryAdded = 0; i.checked = false; }
    save(); renderShop();
  } else if (v === 'clearchecked') {
    const n = list.items.filter((i) => i.checked).length;
    if (!n) { toast('Nothing checked'); return; }
    list.items = list.items.filter((i) => !i.checked);
    save(); renderShop(); toast(`Removed ${n} ${n === 1 ? 'item' : 'items'}`);
  } else if (v === 'rename') renameList(list);
  else if (v === 'delete') {
    if (await confirmSheet('Delete this list?', 'This cannot be undone.', 'Delete List')) {
      S.lists = S.lists.filter((l) => l.id !== list.id);
      for (const w of S.weeks) if (w.listId === list.id) w.listId = null;
      S.activeListId = S.lists[0] ? S.lists[0].id : null;
      save(); renderShop();
    }
  }
}

async function renameList(list) {
  const n = await promptSheet('Rename List', list.name);
  if (n) { list.name = n; save(); render(); }
}

function openCompare(list) {
  const sum = listPriceSummary(list, S.prices, S.settings.stores);
  const n = list.items.length;
  const full = sum.filter((s) => s.priced === n);
  const cheapest = full.length ? full.reduce((a, b) => (a.total <= b.total ? a : b)) : null;
  openSheet({
    title: 'Compare Stores',
    left: { label: 'Close' },
    body: `
      <div class="group-header">${esc(list.name)}</div>
      <div class="group">${sum.length ? sum.map((s) => `<div class="row"><div class="row-main"><div class="row-title">${esc(s.store)}${cheapest && cheapest.store === s.store ? '<span class="tag">Cheapest</span>' : ''}</div><div class="row-sub">${s.priced} of ${n} items priced${s.priced < n ? ', partial total' : ''}</div></div><span class="row-value">${fmtMoney(s.total)}</span></div>`).join('') : `<div class="row"><span class="row-sub">No prices logged for this list yet.</span></div>`}</div>
      <div class="group-footer">Built only from prices you logged, scanned, or fetched from Kroger. A store is only called cheapest when every item has a price there.</div>`,
  });
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Could not copy'));
}

function openListSwitcher() {
  const body = () => `<div class="spacer"></div><div class="group">${S.lists.map((l) => swipeWrap(l.id, `<button class="row tappable" data-list="${esc(l.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(l.name)}${l.id === S.activeListId ? '<span class="tag">Current</span>' : ''}</div><div class="row-sub">${l.items.length} items · ${new Date(l.createdAt).toLocaleDateString()}</div></div>${ICONS.chevron}</button>`)).join('') || `<div class="row"><span class="row-sub">No lists yet.</span></div>`}</div><div class="spacer"></div><div class="group"><button class="row tappable row-action" data-a="new" style="width:100%">${ICONS.plus}<span class="row-title">New Empty List</span></button></div>`;
  openSheet({
    title: 'Lists',
    left: { label: 'Close' },
    body: body(),
    onMount(el, close) {
      const bind = () => enableSwipe(el, (id) => {
        S.lists = S.lists.filter((l) => l.id !== id);
        for (const w of S.weeks) if (w.listId === id) w.listId = null;
        if (S.activeListId === id) S.activeListId = S.lists[0] ? S.lists[0].id : null;
        save();
        $('.sheet-body', el).innerHTML = body();
        bind();
        renderShop();
      });
      bind();
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-list]');
        if (b && !b.closest('.swipe')?.dataset.justSwiped) { S.activeListId = b.dataset.list; save(); close(); go('shop'); }
        if (e.target.closest('[data-a="new"]')) { close(); newEmptyList(); }
      });
    },
  });
}

async function newEmptyList() {
  const name = await promptSheet('New List', 'Grocery List');
  if (name == null) return;
  const list = { id: uid(), name: name || 'Grocery List', createdAt: Date.now(), items: [], collapsed: {}, needs: [] };
  S.lists.unshift(list);
  S.activeListId = list.id;
  save();
  go('shop');
}

/* ---------- Receipt scanning (optional proxy) ---------- */
async function handleReceipt(file) {
  const list = activeList();
  if (!file || !list) return;
  toast('Reading receipt...', 8000);
  try {
    const { b64, type } = await shrinkImage(file, 1600);
    const res = await scanReceipt(b64, type, list.items.map((i) => i.name));
    const lines = (res.lines || []).filter((l) => l.price > 0);
    if (!lines.length) throw new Error('No prices found on that receipt.');
    const defStore = S.settings.stores.find((s) => res.store && s.toLowerCase().includes(String(res.store).toLowerCase().split(' ')[0])) || S.settings.currentStore || S.settings.stores[0];
    openSheet({
      title: 'Receipt Prices',
      full: true,
      right: {
        label: 'Save',
        action: (el) => {
          const store = $('[name="store"]', el).value;
          let n = 0;
          lines.forEach((ln, i) => {
            if (!$(`[name="r${i}"]`, el).checked) return;
            const it = list.items.find((x) => x.name === ln.item);
            if (!it) return;
            let per = 'pkg', price = +ln.price, label = '';
            if (it.pkgParts && it.pkgParts.length === 1) { price = price / it.pkgParts[0].n; label = it.pkgParts[0].label; }
            else if (it.eachCount) { per = 'each'; price = price / it.eachCount; }
            else if (it.buyG && !it.pkgParts) { per = 'lb'; price = price / (it.buyG / LB); }
            savePrice(it, store, Math.round(price * 100) / 100, per, label, 'Receipt');
            n++;
          });
          toast(`Saved ${n} prices`);
          renderShop();
        },
      },
      body: `
        <div class="spacer"></div>
        <div class="group"><div class="row field"><label>Store</label><select name="store">${S.settings.stores.map((s) => `<option ${s === defStore ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div></div>
        <div class="group-header">Lines matched to your list</div>
        <div class="group">${lines.map((ln, i) => `<div class="row"><div class="row-main"><div class="row-title">${esc(ln.item || 'Not on list')}</div><div class="row-sub">${esc(ln.text || '')}</div></div><span class="row-value">${fmtMoney(+ln.price)}</span>${switchInput('r' + i, !!ln.item && list.items.some((x) => x.name === ln.item))}</div>`).join('')}</div>
        <div class="group-footer">Read by AI from your photo, so check the numbers. Package prices are split per package when you bought several. Loose items are converted to a per lb price using the amount on your list.</div>`,
    });
  } catch (err) {
    toast(err.message || 'Could not read the receipt', 5000);
  }
}

function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
      resolve({ b64: url.split(',')[1], type: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('Could not open that image.'));
    img.src = URL.createObjectURL(file);
  });
}

/* =========================================================
   PREP
   ========================================================= */
function renderPrep() {
  const el = $('#view-prep');
  const w = curWeek();
  w.prepDone = w.prepDone || {};
  w.prepSteps = w.prepSteps || {};
  const plan = prepPlan(w, ctx()).filter((s) => s.meals.length);
  setNav('Prep');
  if (!plan.length) {
    el.innerHTML = `<h1 class="large-title">Prep</h1><div class="empty"><div class="et">Nothing to prep this week</div>Pick a prepped lunch (the yellow Prepped tag) on the Week tab, or mark one of your meals as Prepped in Meals.</div><button class="btn" data-action="go-week">Go to Week</button>`;
    return;
  }
  let s = plan.find((x) => x.id === S.ui.prepSession) || plan.find((x) => !w.prepDone[x.id]) || plan[0];
  S.ui.prepSession = s.id;
  const stepDone = w.prepSteps[s.id] || {};
  const temps = [...new Set(s.steps.filter((x) => x.temp && /oven/i.test(x.how)).map((x) => x.temp))];
  const af = s.steps.some((x) => /air fryer/i.test(x.how));
  const freeze = s.meals.filter((m) => m.storage === 'freeze');
  const late = s.meals.filter((m) => m.storage === 'late');
  const oil = s.raw.filter((a) => a.food.id === 'olive-oil' || (a.food.role === 'fat' && a.food.kcal > 700));
  const meals = s.meals.slice().sort((a, b) => a.day - b.day || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const done = !!w.prepDone[s.id];

  el.innerHTML = `
    <h1 class="large-title">${esc(s.name)}</h1>
    <div class="subtitle">${s.containers} containers · about ${s.total} min of cooking${freeze.length ? ` · ${freeze.length} for the freezer` : ''}</div>
    ${plan.length > 1 ? `<div class="seg">${plan.map((x) => `<button class="${x.id === s.id ? 'on' : ''}" data-action="prep-session" data-s="${x.id}">${esc(x.name)}${w.prepDone[x.id] ? ' ✓' : ''}</button>`).join('')}</div>` : ''}
    ${s.over ? `<div class="warn-banner"><b>This needs ${s.containers} containers and you have ${s.cap}.</b> Change a prepped meal on the Week tab, or prep twice a week.</div>` : ''}
    ${late.length ? `<div class="warn-banner">${late.map((m) => `${DAY_NAMES[m.day]} ${m.slot}`).join(', ')} would sit ${late[0].age} days in the fridge and should not be frozen. Make those fresh or prep twice a week.</div>` : ''}

    <div class="group-header">Get ready</div>
    <div class="group">
      <div class="row"><div class="row-main"><div class="row-title">Set out ${s.containers} ${s.containers === 1 ? 'container' : 'containers'}</div><div class="row-sub">Plus a kitchen scale and a marker for labels.</div></div></div>
      ${temps.map((t) => `<div class="row"><div class="row-main"><div class="row-title">Preheat the oven to ${esc(t)}</div><div class="row-sub">Line sheet pans with foil or parchment.</div></div></div>`).join('')}
      ${af ? `<div class="row"><div class="row-main"><div class="row-title">Get the air fryer out</div></div></div>` : ''}
      ${s.steps[0] ? `<div class="row"><div class="row-main"><div class="row-title">Start the ${esc(foodName(s.steps[0].food).toLowerCase())} first</div><div class="row-sub">It takes longest. The times below have everything finishing together.</div></div></div>` : ''}
    </div>

    ${s.steps.length ? `<div class="group-header">Cook</div><div class="group">${s.steps.map((st) => {
      const id = st.food.id;
      const on = !!stepDone[id];
      return `<div class="row cook-row item-row ${on ? 'done' : ''}">${checkbox(on, 'step-check', id)}<div class="row-main"><div class="row-title"><span>${esc(foodName(st.food))}</span><span class="qty">${esc(fmtWeight(st.g, U()))} ${esc(st.food.basis === 'as sold' ? '' : st.food.basis)}</span></div>
        <div class="row-sub"><span class="step-time ${st.startAt ? 'later' : ''}">${st.startAt ? `at ${st.startAt} min` : 'Start now'}</span> ${esc(st.how)}${st.temp ? ' ' + esc(st.temp) : ''}${st.min ? ` · ${st.min} min` : ''}</div>
        <div class="row-sub">${esc(st.text)}</div>
        ${st.alt ? `<div class="row-sub">${esc(st.alt)}</div>` : ''}${st.shares ? `<div class="row-sub ok">${esc(st.shares)}</div>` : ''}
        ${st.min ? `<button class="btn inline secondary timer-btn" data-action="timer-start" data-label="${esc(foodName(st.food))}" data-min="${st.min}">Start ${st.min} min timer</button>` : ''}
      </div></div>`;
    }).join('')}</div>${oil.length ? `<div class="group-footer">Use about ${oil.map((a) => `${fmtWeight(a.g, U())} ${esc(foodName(a.food).toLowerCase())}`).join(', ')} while cooking (roughly ${fmtQty(Math.round((oil[0].g / 13.5) * 2) / 2)} tbsp).</div>` : ''}` : ''}

    ${s.groups.map((g) => {
      const over = g.cups > s.capCups;
      const lines = g.sc.items.filter((i) => !(i.food.id === 'olive-oil' || (i.food.role === 'fat' && i.food.kcal > 700 && !i.food.unit))).map((i) => `<div class="portion-line"><span>${esc(foodName(i.food))}${i.cooks ? ' <span class="muted small">cooked</span>' : ''}</span><span class="pv">${esc(i.cooks ? fmtWeight(i.readyG, U()) : fmtPortion(i.food, i.g, U()))}</span></div>`).join('');
      return `<div class="group-header big">${esc(g.t.name)}<span class="muted" style="font-size:15px;font-weight:400"> × ${g.meals.length}</span></div>
        <div class="group"><div class="row"><div class="row-main">${lines}</div></div>
        <div class="row"><div class="row-main"><div class="row-sub ${over ? 'bad' : ''}">About ${fmtQty(Math.round(g.cups * 4) / 4)} cups per container${over ? `. Your ${S.settings.containerOz} oz containers hold about ${fmtQty(s.capCups)} cups, so this will be packed full. Lower lunch calories slightly or pack the rest separately.` : ` (fits your ${S.settings.containerOz} oz containers).`} ${fmtNum(g.sc.totals.kcal)} kcal · ${fmtNum(g.sc.totals.p)} g protein each.</div></div></div></div>
        <div class="group-footer">Easiest way: weigh each cooked batch, divide by the number of containers, and tare the scale as you fill. Cooked weights vary, so dividing evenly matters more than hitting exact grams.</div>`;
    }).join('')}

    <div class="group-header">Label and store</div>
    <div class="group">${meals.map((m) => `<div class="row"><div class="row-main"><div class="row-title">${DAY_LONG[m.day]} ${m.slot}</div><div class="row-sub">${esc(m.t.name)}${m.storage === 'freeze' ? ` · move to the fridge ${DAY_LONG[(m.day + 6) % 7]} night` : ''}</div></div><span class="storage ${m.storage}">${m.storage === 'freeze' ? 'Freezer' : m.storage === 'late' ? 'Too long' : 'Fridge'}</span></div>`).join('')}</div>
    ${freeze.length ? `<div class="group-footer">Let freezer containers cool about 30 minutes first, and leave a little headspace. Glass can crack from sudden temperature changes, so thaw in the fridge, not on the counter or straight into a hot oven.</div>` : ''}

    <div class="spacer"></div><div class="spacer"></div>
    <button class="btn ${done ? 'secondary' : ''}" data-action="prep-done" data-s="${s.id}">${done ? 'Prep Done ✓ (tap to undo)' : 'Mark Prep Done'}</button>
  `;
}

/* ---------- Timers ---------- */
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* no audio */ }
}
function beep() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.35 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + i * 0.35);
    o.stop(t0 + i * 0.35 + 0.3);
  }
}
function startTimer(label, min) {
  unlockAudio();
  S.timers = (S.timers || []).filter((t) => !(t.label === label && !t.done));
  S.timers.push({ id: uid(), label, end: Date.now() + min * 60000, done: false });
  save();
  tickTimers();
  updateWakeLock();
  toast(`${label}: ${min} min timer started`);
}
let timerInterval = null;
function tickTimers() {
  const bar = $('#timerbar');
  const timers = S.timers || [];
  if (!timers.length) {
    bar.classList.add('hidden');
    document.body.classList.remove('has-timers');
    clearInterval(timerInterval);
    timerInterval = null;
    return;
  }
  if (!timerInterval) timerInterval = setInterval(tickTimers, 1000);
  const now = Date.now();
  let changed = false;
  for (const t of timers) {
    if (!t.done && now >= t.end) {
      t.done = true;
      changed = true;
      beep();
      toast(`${t.label} is done`, 4000);
    }
  }
  if (changed) save();
  bar.classList.remove('hidden');
  document.body.classList.add('has-timers');
  bar.innerHTML = timers.map((t) => {
    const s = Math.max(0, Math.round((t.end - now) / 1000));
    const txt = t.done ? 'Done' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return `<div class="timer-pill ${t.done ? 'done' : ''}"><span>${esc(t.label)}</span><span class="tt">${txt}</span><button data-timer-x="${t.id}" aria-label="Dismiss timer">&times;</button></div>`;
  }).join('');
}

/* =========================================================
   MEALS (templates)
   ========================================================= */
function usageCount(tid) {
  const w = curWeek();
  let n = 0;
  for (const d of w.days) for (const s of SLOTS) if (d[s] && d[s].t === tid) n++;
  return n;
}

function renderMeals() {
  const el = $('#view-meals');
  const filter = S.ui.mealsFilter || 'all';
  setNav('Meals', '', `<button class="nav-btn" data-action="meal-new" aria-label="New meal">${ICONS.compose}</button>`);
  const order = { prep: 0, fresh: 1, easy: 2 };
  const slots = filter === 'all' ? SLOTS : [filter];
  const groups = slots.map((slot) => {
    const ts = S.templates.filter((t) => t.slot === slot).sort((a, b) => (order[a.kind] - order[b.kind]) || a.name.localeCompare(b.name));
    if (!ts.length) return '';
    const target = slotKcal(S.settings, slot);
    return `<div class="group-header">${SLOT_LABEL[slot]}s</div><div class="group" data-meals>${ts.map((t) => {
      const sc = scaleTemplate(t, target, foods);
      const u = usageCount(t.id);
      const how = t.method && t.method.how && t.kind !== 'prep' ? ` · ${esc(t.method.how)}${t.method.temp ? ' ' + esc(t.method.temp) : ''}${t.method.min ? ` ${t.method.min} min` : ''}` : '';
      return swipeWrap(t.id, `<div class="row tappable" data-action="meal-edit" data-id="${esc(t.id)}"><div class="row-main"><div class="row-title">${esc(t.name)}${kindTag(t)}</div><div class="row-sub">${fmtNum(sc.totals.kcal)} kcal · ${fmtNum(sc.totals.p)} g protein${how}${u ? ` · on the menu ${u}×` : ''}</div></div>${ICONS.chevron}</div>`);
    }).join('')}</div>`;
  }).join('');
  el.innerHTML = `
    <h1 class="large-title">Meals</h1>
    <div class="seg">${[['all', 'All'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']].map(([k, n]) => `<button class="${filter === k ? 'on' : ''}" data-action="meals-filter" data-f="${k}">${n}</button>`).join('')}</div>
    <div class="spacer"></div>
    <div class="group">
      <button class="row tappable row-action" data-action="meal-new" style="width:100%">${ICONS.plus}<span class="row-title">New Meal</span></button>
      <button class="row tappable row-action" data-action="meal-import" style="width:100%">${ICONS.plus}<span class="row-title">Import a Recipe</span></button>
    </div>
    <div class="group-footer"><span class="kind prep" style="margin:0">Prepped</span> cooked on prep day into containers. <span class="kind fresh" style="margin:0">Cook fresh</span> made that day. <span class="kind easy" style="margin:0">Easy</span> oven or air fryer shortcuts. Calories shown are at your target for that meal.</div>
    ${groups}
  `;
  enableSwipe(el, async (id) => {
    const inUse = S.weeks.some((w) => w.days.some((d) => SLOTS.some((s) => d[s] && d[s].t === id)));
    if (inUse && !(await confirmSheet('Delete this meal?', 'It is on a week plan and will be removed from it.'))) { renderMeals(); return; }
    deleteTemplate(id);
  });
}

function deleteTemplate(id) {
  S.templates = S.templates.filter((t) => t.id !== id);
  for (const w of S.weeks) for (const d of w.days) for (const s of SLOTS) if (d[s] && d[s].t === id) { d[s] = { t: null }; markDirty(w); }
  refresh();
  save();
  render();
}

function amountOptions(food) {
  const o = [];
  if (food.unit) o.push([food.unit.name, food.unit.g]);
  if (food.gPerCup) o.push(['cup', food.gPerCup]);
  if (food.gPerCup) o.push(['tbsp', food.gPerCup / 16]);
  o.push(['oz', OZ], ['g', 1], ['lb', LB]);
  return o;
}

function promptAmount(food, grams) {
  return new Promise((resolve) => {
    const opts = amountOptions(food);
    const def = food.unit && food.unit.show ? opts[0] : U() === 'metric' ? ['g', 1] : ['oz', OZ];
    let result = null;
    openSheet({
      title: foodName(food),
      right: {
        label: 'Done',
        action: (el) => {
          const v = parseFloat($('[name="amt"]', el).value);
          const f = +$('[name="u"]', el).value;
          if (!(v > 0)) { toast('Enter an amount'); return false; }
          result = v * f;
        },
      },
      body: `<div class="spacer"></div><div class="group"><div class="row field"><label>Per serving</label><input name="amt" type="number" inputmode="decimal" value="${grams ? +(grams / def[1]).toFixed(2) : ''}" style="flex-basis:30%"><select name="u" style="flex:0 0 90px">${opts.map(([n, g]) => `<option value="${g}" ${n === def[0] ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div><div class="group-footer">Amount as you buy it (${esc(food.basis || 'as sold')}), before cooking. If the meal scales to your calories, this sets the proportions.</div>`,
      onMount(el) { setTimeout(() => $('[name="amt"]', el).focus(), 350); },
      onClose: () => resolve(result),
    });
  });
}

function openTemplateEditor(t, preset = {}, onSaved) {
  const isNew = !t;
  const d = t ? clone(t) : { id: 't-' + uid(), name: '', slot: 'dinner', kind: 'fresh', scale: true, usesContainer: true, freezable: true, items: [], extras: [], method: { how: '', temp: '', min: '', text: '' }, ...preset };
  d.items = d.items || [];
  d.extras = d.extras || [];
  d.method = d.method || { how: '', temp: '', min: '', text: '' };
  let sheetEl;
  const body = () => {
    const target = slotKcal(S.settings, d.slot);
    const sc = scaleTemplate(d, target, foods);
    const base = templateBase(d, foods);
    return `
      <div class="spacer"></div>
      <div class="group"><div class="row"><input class="text-input" data-f="name" type="text" placeholder="Meal name" value="${esc(d.name)}"></div></div>
      <div class="group-header">When</div>
      <div class="seg">${SLOTS.map((s) => `<button class="${d.slot === s ? 'on' : ''}" data-set="slot" data-v="${s}">${SLOT_LABEL[s]}</button>`).join('')}</div>
      <div class="group-header">How</div>
      <div class="seg">${['prep', 'fresh', 'easy'].map((k) => `<button class="${d.kind === k ? 'on' : ''}" data-set="kind" data-v="${k}">${KIND_LABEL[k]}</button>`).join('')}</div>
      <div class="spacer"></div>
      <div class="group">
        <div class="row"><span class="row-main">Resize to my calorie target</span>${switchInput('scale', d.scale, 'data-fb="scale"')}</div>
        ${d.kind === 'prep' ? `<div class="row"><span class="row-main">Goes in one of my containers</span>${switchInput('usesContainer', d.usesContainer !== false, 'data-fb="usesContainer"')}</div><div class="row"><span class="row-main">Freezer friendly</span>${switchInput('freezable', d.freezable !== false, 'data-fb="freezable"')}</div>` : ''}
      </div>
      <div class="group-header">Ingredients per serving, as bought</div>
      <div class="group" id="te-items">${d.items.map((it, i) => {
        const f = foods.get(it.foodId);
        return swipeWrap('i' + i, `<button class="row tappable" data-edit-item="${i}" style="width:100%;text-align:left"><span class="row-main">${esc(foodName(f))}</span><span class="row-value">${esc(f ? fmtPortion(f, it.g, U()) : '')}</span>${ICONS.chevron}</button>`);
      }).join('')}<button class="row tappable row-action" data-add="item" style="width:100%">${ICONS.plus}<span class="row-title">Add Ingredient</span></button></div>
      ${d.items.length ? `<div class="group-footer">As written: ${fmtNum(base.kcal)} kcal. ${d.scale ? `Resized to your ${d.slot} target of ${fmtNum(target)} kcal:` : 'Not resized:'} ${fmtNum(sc.totals.kcal)} kcal · ${fmtNum(sc.totals.p)} g protein · ${fmtNum(sc.totals.c)} g carbs · ${fmtNum(sc.totals.f)} g fat${d.scale && sc.factor !== 1 ? ` (×${fmtNum(sc.factor, 2)})` : ''}.</div>` : ''}
      <div class="group-header">Other ingredients (seasonings, sauces)</div>
      <div class="group" id="te-extras">${d.extras.map((x, i) => swipeWrap('x' + i, `<div class="row"><span class="row-main">${esc(x.name)}</span><span class="row-value">${x.qty != null ? esc(fmtQty(x.qty) + (x.unit ? ' ' + unitLabel(x.unit, x.qty) : '')) : ''}</span></div>`)).join('')}<button class="row tappable row-action" data-add="extra" style="width:100%">${ICONS.plus}<span class="row-title">Add Other Ingredient</span></button></div>
      <div class="group-footer">These go on your list per serving but do not count toward calories.</div>
      <div class="group-header">Cooking</div>
      <div class="group">
        <div class="row field"><label>Method</label><select data-m="how">${['', 'Oven', 'Air fryer', 'Stovetop', 'Skillet', 'Microwave', 'Grill', 'No cook'].map((h) => `<option value="${h}" ${d.method.how === h ? 'selected' : ''}>${h || 'None'}</option>`).join('')}</select></div>
        <div class="row field"><label>Temperature</label><input data-m="temp" type="text" value="${esc(d.method.temp || '')}" placeholder="e.g. 400°F"></div>
        <div class="row field"><label>Minutes</label><input data-m="min" type="number" inputmode="numeric" value="${esc(d.method.min || '')}" placeholder="0"></div>
        <div class="row"><textarea class="plain" data-m="text" placeholder="Short instructions">${esc(d.method.text || '')}</textarea></div>
      </div>
      ${d.kind === 'prep' ? '<div class="group-footer">Prepped meals get a cook plan on the Prep tab using each ingredient\'s own cooking steps.</div>' : ''}
      ${d.steps && d.steps.length ? `<div class="group-header">Recipe steps</div><div class="group">${d.steps.map((s, i) => `<div class="row"><div class="row-main"><div class="row-sub" style="color:var(--label);font-size:15px">${i + 1}. ${esc(s)}</div></div></div>`).join('')}</div>` : ''}
      ${d.sourceUrl ? `<div class="group-footer"><a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">Original recipe</a></div>` : ''}
      ${!isNew ? `<div class="spacer"></div><div class="group actions"><button class="row tappable" data-a="dup" style="width:100%"><span class="row-title">Duplicate</span></button><button class="row tappable" data-a="del" style="width:100%"><span class="row-title" style="color:var(--red)">Delete Meal</span></button></div>` : ''}
    `;
  };
  const rerender = () => {
    const b = $('.sheet-body', sheetEl);
    const y = b.scrollTop;
    b.innerHTML = body();
    b.scrollTop = y;
    bindSwipes();
  };
  const bindSwipes = () => {
    enableSwipe($('#te-items', sheetEl), (id) => { d.items.splice(+id.slice(1), 1); rerender(); });
    enableSwipe($('#te-extras', sheetEl), (id) => { d.extras.splice(+id.slice(1), 1); rerender(); });
  };
  openSheet({
    title: isNew ? 'New Meal' : 'Edit Meal',
    full: true,
    right: {
      label: 'Save',
      action: () => {
        d.name = d.name.trim();
        if (!d.name) { toast('Give the meal a name'); return false; }
        if (!d.items.length && !d.extras.length) { toast('Add at least one ingredient'); return false; }
        d.method.min = +d.method.min || 0;
        const i = S.templates.findIndex((x) => x.id === d.id);
        if (i >= 0) S.templates[i] = d;
        else S.templates.push(d);
        markDirty();
        refresh();
        save();
        render();
        toast(isNew ? 'Meal saved' : 'Meal updated');
        if (onSaved) setTimeout(() => onSaved(d), 0);
      },
    },
    body: body(),
    onMount(el, close) {
      sheetEl = el;
      bindSwipes();
      el.addEventListener('input', (e) => {
        const t2 = e.target;
        if (t2.dataset.f === 'name') d.name = t2.value;
        if (t2.dataset.m) d.method[t2.dataset.m] = t2.value;
      });
      el.addEventListener('change', (e) => {
        const t2 = e.target;
        if (t2.dataset.fb) { d[t2.dataset.fb] = t2.checked; rerender(); }
        if (t2.dataset.m) d.method[t2.dataset.m] = t2.value;
      });
      el.addEventListener('click', async (e) => {
        const set = e.target.closest('[data-set]');
        if (set) { d[set.dataset.set] = set.dataset.v; rerender(); return; }
        const ei = e.target.closest('[data-edit-item]');
        if (ei && !ei.closest('.swipe')?.dataset.justSwiped) {
          const it = d.items[+ei.dataset.editItem];
          const f = foods.get(it.foodId);
          if (!f) return;
          const g = await promptAmount(f, it.g);
          if (g) { it.g = g; rerender(); }
          return;
        }
        const add = e.target.closest('[data-add]');
        if (add && add.dataset.add === 'item') {
          openAddFood(async (food) => {
            const g = await promptAmount(food, null);
            if (!g) return;
            const ex = d.items.find((x) => x.foodId === food.id);
            if (ex) ex.g += g;
            else d.items.push({ foodId: food.id, g });
            rerender();
          }, 'Add Ingredient');
          return;
        }
        if (add && add.dataset.add === 'extra') {
          const txt = await promptSheet('Other Ingredient', '', 'e.g. 1 tbsp taco seasoning');
          if (!txt) return;
          const p = parseIngredientLine(txt);
          if (p) { d.extras.push({ name: p.name, qty: p.qty, unit: p.unit, section: guessSection(p.name) }); rerender(); }
          return;
        }
        const a = e.target.closest('[data-a]');
        if (a && a.dataset.a === 'dup') {
          const c = { ...clone(d), id: 't-' + uid(), name: d.name + ' copy' };
          S.templates.push(c);
          refresh(); save(); close(); render(); toast('Duplicated');
        }
        if (a && a.dataset.a === 'del') {
          if (await confirmSheet('Delete this meal?', 'It will also be removed from any week plan.')) { close(); deleteTemplate(d.id); }
        }
      });
    },
  });
}

/* ---------- Recipe import into a meal ---------- */
function openImport() {
  const proxy = proxyConfigured();
  openSheet({
    title: 'Import a Recipe',
    full: true,
    body: `
      <div class="group-header">From a link</div>
      <div class="group"><div class="row"><input class="text-input" type="url" id="im-url" placeholder="https://example.com/recipe" autocomplete="off" autocapitalize="off"><button class="btn inline" data-a="url">Get</button></div></div>
      <div class="group-footer">${proxy ? 'Fetched through your proxy and read from the page\'s recipe data.' : 'Most recipe sites block reading from another site (CORS), so links need the free proxy in More. Pasting text always works.'}</div>
      <div class="group-header">Paste recipe text or describe a dish</div>
      <div class="group"><div class="row"><textarea class="text-input" id="im-text" placeholder="One ingredient per line works best:&#10;2 lb chicken thighs&#10;1 1/2 cups white rice&#10;1 head broccoli"></textarea></div></div>
      <div class="spacer"></div>
      <div class="btn-row"><button class="btn secondary" data-a="parse">Parse Text</button><button class="btn secondary" data-a="ai" ${proxy ? '' : 'disabled'}>Parse with AI</button></div>
      <div class="group-footer">Parse Text runs on your phone. Parse with AI handles messy text or a description like "sheet pan chicken fajitas for 4", and needs the proxy.</div>`,
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]');
        if (!a || a.disabled) return;
        const label = a.textContent;
        try {
          let parsed = null;
          if (a.dataset.a === 'url') {
            let url = $('#im-url', el).value.trim();
            if (!url) { toast('Paste a link first'); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            a.innerHTML = '<span class="spinner"></span>';
            const { html } = await fetchRecipePage(url);
            parsed = extractRecipeFromHtml(html);
            if (!parsed || !parsed.ingredients.length) throw new Error('No recipe data on that page. Paste the ingredient list instead.');
            parsed.sourceUrl = url;
          } else if (a.dataset.a === 'parse') {
            parsed = parseRecipeText($('#im-text', el).value);
            if (!parsed.ingredients.length) throw new Error('No ingredient lines found. Try Parse with AI or add ingredients by hand.');
          } else if (a.dataset.a === 'ai') {
            const text = $('#im-text', el).value;
            if (!text.trim()) { toast('Paste text or describe a dish first'); return; }
            a.innerHTML = '<span class="spinner"></span>';
            const r = await aiParseRecipe(text);
            parsed = { name: r.name || '', servings: r.servings || null, steps: r.steps || [], ingredients: (r.ingredients || []).map((i) => { const p = parseIngredientLine(`${i.qty ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.trim()); if (p && i.note) p.note = i.note; return p; }).filter(Boolean) };
            if (!parsed.ingredients.length) throw new Error('The AI did not return any ingredients.');
          }
          close();
          const t = templateFromParsed(parsed);
          const unmatched = t.extras.length;
          openTemplateEditor(null, t);
          if (unmatched) setTimeout(() => toast(`${unmatched} ${unmatched === 1 ? 'ingredient' : 'ingredients'} had no nutrition match and went under Other`, 4000), 400);
        } catch (err) {
          toast(err.message, 5000);
          a.textContent = label;
        }
      });
    },
  });
}

function templateFromParsed(parsed) {
  const servings = Math.max(1, +parsed.servings || 4);
  const items = [];
  const extras = [];
  for (const p of parsed.ingredients) {
    const food = matchFood(p.name, foods);
    const g = food ? toGrams(p.qty, p.unit, food, p.parenG) : null;
    if (food && g != null) {
      const ex = items.find((x) => x.foodId === food.id);
      if (ex) ex.g += g / servings;
      else items.push({ foodId: food.id, g: g / servings });
    } else {
      extras.push({ name: p.name, qty: p.qty != null ? p.qty / servings : null, unit: p.unit || '', section: food ? food.section : guessSection(p.name) });
    }
  }
  return { name: parsed.name || 'Imported recipe', slot: 'dinner', kind: 'fresh', scale: true, scaleExtras: true, usesContainer: true, items, extras, steps: parsed.steps || [], sourceUrl: parsed.sourceUrl || '', method: { how: '', temp: '', min: '', text: '' } };
}

/* ---------- Food picker and custom foods ---------- */
function openAddFood(onPick, title = 'Add Food') {
  const all = [...foods.values()].sort((a, b) => foodName(a).localeCompare(foodName(b)));
  const hasKey = !!S.settings.usdaKey.trim();
  const rowsHtml = (list) => list.map((f) => `<button class="row tappable result-row" data-food="${esc(f.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(foodName(f))}${f.custom ? '<span class="tag gray">Mine</span>' : ''}</div><div class="row-sub">${fmtNum(f.kcal)} kcal · ${fmtNum(f.p, 1)} P · ${fmtNum(f.c, 1)} C · ${fmtNum(f.f, 1)} F per 100 g ${esc(f.basis || '')} · ${esc(sectionName(f.section))}</div></div></button>`).join('');
  openSheet({
    title,
    full: true,
    body: `
      <div class="spacer"></div>
      <div class="group"><div class="row"><input class="text-input" type="search" placeholder="Search foods" id="af-q" autocomplete="off"></div></div>
      <div class="group-header">Foods</div>
      <div class="group" id="af-local">${rowsHtml(all)}</div>
      <div class="group-header">USDA FoodData Central</div>
      <div class="group" id="af-usda">${hasKey ? `<button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Search USDA</span></button>` : `<div class="row"><div class="row-main"><div class="row-sub">Add your free USDA API key in More to search thousands more foods.</div></div></div>`}</div>
      <div class="spacer"></div>
      <div class="group"><button class="row tappable row-action" id="af-custom" style="width:100%">${ICONS.plus}<span class="row-title">Create Custom Food</span></button></div>`,
    onMount(el, close) {
      const q = $('#af-q', el);
      q.addEventListener('input', () => {
        const s = normName(q.value);
        const list = s ? all.filter((f) => normName([f.name, f.short, ...(f.aliases || [])].join(' ')).includes(s)) : all;
        $('#af-local', el).innerHTML = rowsHtml(list) || `<div class="row"><span class="row-sub">No match. Try USDA or create a custom food.</span></div>`;
      });
      el.addEventListener('click', async (e) => {
        const fb = e.target.closest('[data-food]');
        if (fb) { close(); onPick(foods.get(fb.dataset.food)); return; }
        const ub = e.target.closest('[data-usda]');
        if (ub) {
          const r = JSON.parse(ub.dataset.usda);
          openFoodForm({ name: cap(r.description.toLowerCase()), kcal: r.kcal, p: r.p, c: r.c, f: r.f, fdcId: r.fdcId, basisGuess: /cooked|boiled|roasted|baked|grilled/i.test(r.description) ? 'cooked' : 'raw' }, (food) => { close(); onPick(food); });
          return;
        }
        if (e.target.closest('#af-usda-btn')) {
          const term = q.value.trim();
          if (!term) { toast('Type a food name first'); q.focus(); return; }
          const box = $('#af-usda', el);
          box.innerHTML = `<div class="row"><span class="spinner"></span><span class="muted">Searching USDA</span></div>`;
          try {
            const res = await usdaSearch(term);
            box.innerHTML = (res.length ? res.map((r) => `<button class="row tappable result-row" data-usda="${esc(JSON.stringify(r))}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(r.description)}</div><div class="row-sub">${fmtNum(r.kcal)} kcal · ${fmtNum(r.p, 1)} P · ${fmtNum(r.c, 1)} C · ${fmtNum(r.f, 1)} F per 100 g</div></div></button>`).join('') : `<div class="row"><span class="row-sub">No USDA results.</span></div>`) + `<button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Search Again</span></button>`;
          } catch (err) {
            box.innerHTML = `<div class="row"><span class="row-sub bad">${esc(err.message)}</span></div><button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Try Again</span></button>`;
          }
          return;
        }
        if (e.target.closest('#af-custom')) openFoodForm({ name: q.value.trim() }, (food) => { close(); onPick(food); });
      });
    },
  });
}

function openFoodForm(prefill = {}, onSaved) {
  const existing = prefill.id && prefill.custom ? prefill : null;
  const f = { section: 'pantry', role: 'other', basis: 'raw', yield: 1, ...prefill };
  const pkg = (f.pkgs && f.pkgs[0]) || null;
  const metric = U() === 'metric';
  const pkgVal = pkg ? (metric ? Math.round(pkg.g) : +(pkg.g / OZ).toFixed(1)) : '';
  openSheet({
    title: existing ? 'Edit Food' : 'New Food',
    full: true,
    right: {
      label: 'Save',
      action: (el) => {
        const v = (n) => $(`[name="${n}"]`, el).value;
        const name = v('name').trim();
        const kcal = parseFloat(v('kcal'));
        if (!name || !(kcal > 0)) { toast('Name and calories are required'); return false; }
        const yieldF = parseFloat(v('yield')) || 1;
        let p = parseFloat(v('p')) || 0, c = parseFloat(v('c')) || 0, fat = parseFloat(v('f')) || 0, k = kcal;
        if (v('valuesFor') === 'cooked' && yieldF > 0 && yieldF !== 1) { k *= yieldF; p *= yieldF; c *= yieldF; fat *= yieldF; }
        const pkgAmt = parseFloat(v('pkgAmt'));
        const pkgUnit = v('pkgUnit');
        const pkgG = pkgAmt > 0 ? pkgAmt * (pkgUnit === 'lb' ? LB : pkgUnit === 'oz' ? OZ : pkgUnit === 'kg' ? 1000 : 1) : null;
        const unitG = parseFloat(v('unitG'));
        const food = {
          id: existing ? existing.id : 'c-' + uid(), custom: true, name, short: name, section: v('section'), role: v('role'), basis: v('basis'),
          kcal: +k.toFixed(1), p: +p.toFixed(2), c: +c.toFixed(2), f: +fat.toFixed(2), yield: yieldF, cook: yieldF !== 1 ? 'cooked' : '',
          aliases: [normName(name)], loose: $('[name="loose"]', el).checked,
          pkgs: pkgG ? [{ label: v('pkgLabel').trim() || `${fmtWeight(pkgG, U())} pack`, g: pkgG }] : [],
          unit: unitG > 0 ? { name: v('unitName').trim() || 'piece', plural: (v('unitName').trim() || 'piece') + 's', g: unitG, show: $('[name="unitShow"]', el).checked } : null,
          gPerCup: parseFloat(v('gPerCup')) || null, fdcId: f.fdcId || null,
        };
        const i = S.customFoods.findIndex((x) => x.id === food.id);
        if (i >= 0) S.customFoods[i] = food; else S.customFoods.push(food);
        refresh();
        save();
        toast(existing ? 'Food updated' : 'Food saved');
        if (onSaved) setTimeout(() => onSaved(food), 0);
        render();
      },
    },
    body: `
      <div class="group-header">Food</div>
      <div class="group">
        <div class="row"><input class="text-input" name="name" type="text" placeholder="Name" value="${esc(f.name || '')}"></div>
        <div class="row field"><label>Store section</label><select name="section">${SECTIONS.map((s) => `<option value="${s.id}" ${f.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="row field"><label>Type</label><select name="role">${Object.keys(ROLE_SHARE).map((r) => `<option value="${r}" ${f.role === r ? 'selected' : ''}>${cap(r)}</option>`).join('')}</select></div>
        <div class="row field"><label>You buy it</label><select name="basis">${['raw', 'dry', 'as sold'].map((b) => `<option ${f.basis === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      </div>
      <div class="group-header">Nutrition per 100 g</div>
      <div class="group">
        <div class="row field"><label>Values are for</label><select name="valuesFor"><option value="bought" ${f.basisGuess !== 'cooked' ? 'selected' : ''}>as bought</option><option value="cooked" ${f.basisGuess === 'cooked' ? 'selected' : ''}>cooked</option></select></div>
        <div class="row field"><label>Calories</label><input name="kcal" type="number" inputmode="decimal" value="${esc(f.kcal ?? '')}" placeholder="kcal"></div>
        <div class="row field"><label>Protein (g)</label><input name="p" type="number" inputmode="decimal" value="${esc(f.p ?? '')}" placeholder="0"></div>
        <div class="row field"><label>Carbs (g)</label><input name="c" type="number" inputmode="decimal" value="${esc(f.c ?? '')}" placeholder="0"></div>
        <div class="row field"><label>Fat (g)</label><input name="f" type="number" inputmode="decimal" value="${esc(f.f ?? '')}" placeholder="0"></div>
        <div class="row field"><label>Cooked yield</label><input name="yield" type="number" inputmode="decimal" step="0.05" value="${esc(f.yield ?? 1)}"></div>
      </div>
      <div class="group-footer">Cooked yield is cooked weight divided by purchased weight: chicken about 0.7, dry rice about 2.8, 1 if you do not cook it. Cooked nutrition values are converted to what you buy using this number.</div>
      <div class="group-header">How it is sold</div>
      <div class="group">
        <div class="row"><span class="row-main">Sold loose by weight</span>${switchInput('loose', !!f.loose)}</div>
        <div class="row field"><label>Package name</label><input name="pkgLabel" type="text" value="${esc(pkg ? pkg.label : '')}" placeholder="e.g. 2 lb bag"></div>
        <div class="row field"><label>Package size</label><input name="pkgAmt" type="number" inputmode="decimal" value="${esc(pkgVal)}" placeholder="optional" style="flex-basis:30%"><select name="pkgUnit" style="flex:0 0 56px">${['oz', 'lb', 'g', 'kg'].map((u) => `<option ${(metric ? 'g' : 'oz') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="row field"><label>Count unit name</label><input name="unitName" type="text" value="${esc(f.unit ? f.unit.name : '')}" placeholder="e.g. egg, slice"></div>
        <div class="row field"><label>Grams per unit</label><input name="unitG" type="number" inputmode="decimal" value="${esc(f.unit ? f.unit.g : '')}" placeholder="optional"></div>
        <div class="row"><span class="row-main">Show portions in units</span>${switchInput('unitShow', !!(f.unit && f.unit.show))}</div>
        <div class="row field"><label>Grams per cup</label><input name="gPerCup" type="number" inputmode="decimal" value="${esc(f.gPerCup ?? '')}" placeholder="for recipes"></div>
      </div>
      ${f.fdcId ? `<div class="group-footer">From USDA FoodData Central, FDC ID ${esc(f.fdcId)}.</div>` : ''}`,
  });
}

/* =========================================================
   MORE
   ========================================================= */
function renderMore() {
  const el = $('#view-more');
  setNav('More');
  const st = S.settings;
  const pantryRows = S.pantry.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => swipeWrap(p.id, `<div class="row tappable" data-action="pantry-edit" data-id="${esc(p.id)}"><div class="row-main"><div class="row-title">${esc(p.name)}</div></div><span class="row-value">${p.grams == null ? 'Have plenty' : esc(fmtPortion(p.foodId ? foods.get(p.foodId) : null, p.grams, U()))}</span></div>`)).join('');
  const customRows = S.customFoods.map((f) => swipeWrap(f.id, `<div class="row tappable" data-action="custom-edit" data-id="${esc(f.id)}"><div class="row-main"><div class="row-title">${esc(f.name)}</div><div class="row-sub">${fmtNum(f.kcal)} kcal · ${fmtNum(f.p, 1)} P per 100 g ${esc(f.basis || '')}</div></div>${ICONS.chevron}</div>`)).join('');
  const priceCount = Object.values(S.prices).reduce((a, e) => a + Object.keys(e).length, 0);
  el.innerHTML = `
    ${a2hsBanner()}
    <h1 class="large-title">More</h1>

    <div class="group-header">Units</div>
    <div class="seg">${[['imperial', 'Imperial (lb, oz)'], ['metric', 'Metric (kg, g)']].map(([k, l]) => `<button class="${st.units === k ? 'on' : ''}" data-action="units" data-u="${k}">${l}</button>`).join('')}</div>

    <div class="group-header">Containers and prep</div>
    <div class="group">
      <div class="row"><span class="row-main">Containers you own</span>${stepper('settings.containers', st.containers, 1, 30)}</div>
      <div class="row field"><label for="m-oz">Container size (oz)</label><input id="m-oz" type="number" inputmode="numeric" data-bind="settings.containerOz" data-type="num" value="${esc(st.containerOz)}"></div>
      <div class="row"><span class="row-main">Fridge days before freezing</span>${stepper('settings.fridgeDays', st.fridgeDays, 2, 6)}</div>
    </div>
    <div class="group-footer">USDA guidance is 3 to 4 days for cooked leftovers in the fridge. Meals past that are planned for the freezer.</div>

    <div class="group-header">Pantry</div>
    <div class="group" id="pantry-rows">${pantryRows}<button class="row tappable row-action" data-action="pantry-add" style="width:100%">${ICONS.plus}<span class="row-title">Add Pantry Item</span></button></div>
    <div class="spacer"></div>
    <div class="group"><div class="row"><span class="row-main">Subtract pantry from new lists</span>${switchInput('subtractPantry', st.subtractPantry, 'data-bind="settings.subtractPantry" data-type="bool"')}</div></div>
    <div class="group-footer">Updates itself: items you check off while shopping are added, and starting a new week subtracts what the plan used. Edit anything here to correct it.</div>

    <div class="group-header">Stores and prices</div>
    <div class="group">
      <button class="row tappable" data-action="stores-edit" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">My Stores</div><div class="row-sub">${esc(st.stores.join(', '))}</div></div>${ICONS.chevron}</button>
      <button class="row tappable" data-action="scorecard" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">Store Scorecard</div><div class="row-sub">Help picking your one store</div></div>${ICONS.chevron}</button>
      <button class="row tappable" data-action="protein-open" style="width:100%;text-align:left"><span class="row-main">Cheapest Protein</span>${ICONS.chevron}</button>
      <button class="row tappable" data-action="prices-clear" style="width:100%;text-align:left"><span class="row-main">Logged Prices</span><span class="row-value">${priceCount}</span></button>
    </div>
    <div class="group-footer">Of your local chains, only Kroger-owned stores (Kroger, Harris Teeter) have a free price API, through the proxy below. Everything else comes from prices you log or scan.</div>

    <div class="group-header">Custom foods</div>
    <div class="group" id="custom-rows">${customRows}<button class="row tappable row-action" data-action="custom-add" style="width:100%">${ICONS.plus}<span class="row-title">Add Custom Food</span></button></div>

    <div class="group-header">USDA FoodData Central</div>
    <div class="group">
      <div class="row field"><label for="m-usda">API key</label><input id="m-usda" type="password" autocomplete="off" autocapitalize="off" data-bind="settings.usdaKey" data-type="str" value="${esc(st.usdaKey)}" placeholder="Paste key"></div>
      <button class="row tappable row-action" data-action="usda-test" style="width:100%"><span class="row-title">Test Key</span></button>
    </div>
    <div class="group-footer">Free from USDA (link in the README). Stored only on this phone.</div>

    <div class="group-header">Optional proxy (Cloudflare Worker)</div>
    <div class="group">
      <div class="row field"><label for="m-proxy">Worker URL</label><input id="m-proxy" type="url" autocomplete="off" autocapitalize="off" data-bind="settings.proxyUrl" data-type="str" value="${esc(st.proxyUrl)}" placeholder="https://..."></div>
      <div class="row field"><label for="m-tok">App token</label><input id="m-tok" type="password" autocomplete="off" autocapitalize="off" data-bind="settings.proxyToken" data-type="str" value="${esc(st.proxyToken)}" placeholder="APP_TOKEN"></div>
      <button class="row tappable row-action" data-action="proxy-test" style="width:100%"><span class="row-title">Test Connection</span></button>
      <button class="row tappable" data-action="kroger-store" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">Kroger / Harris Teeter Store</div><div class="row-sub">${st.krogerLocationId ? esc(st.krogerLocationName) : 'Not set. Needs Kroger keys in the Worker.'}</div></div>${ICONS.chevron}</button>
    </div>
    <div class="group-footer">Enables recipe links, AI recipe parsing, receipt scanning, and live Kroger prices. API keys live in the Worker, never in this app.</div>

    <div class="group-header">Backup</div>
    <div class="group actions">
      <button class="row tappable" data-action="export" style="width:100%"><span class="row-title">Export Backup (JSON)</span></button>
      <button class="row tappable" data-action="import" style="width:100%"><span class="row-title">Import Backup</span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" class="hidden">
    <div class="group-footer" id="persist-note">Everything is stored on this device only. Export a backup now and then.</div>

    <div class="spacer"></div>
    <div class="group"><button class="row tappable" data-action="reset" style="width:100%;justify-content:center"><span class="row-title" style="color:var(--red)">Erase All Data</span></button></div>
    <div class="group-footer center">Prep List 2.0</div>
  `;
  enableSwipe($('#pantry-rows', el), (id) => { S.pantry = S.pantry.filter((p) => p.id !== id); save(); renderMore(); });
  enableSwipe($('#custom-rows', el), async (id) => {
    if (S.templates.some((t) => t.items.some((i) => i.foodId === id)) && !(await confirmSheet('Delete this food?', 'Meals that use it will lose that ingredient.'))) { renderMore(); return; }
    S.customFoods = S.customFoods.filter((f) => f.id !== id);
    for (const t of S.templates) t.items = t.items.filter((i) => i.foodId !== id);
    refresh();
    save();
    renderMore();
  });
  $('#import-file', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!(await confirmSheet('Replace all data?', 'Importing replaces everything in the app with the backup.', 'Import'))) return;
      importData(text);
      refresh();
      toast('Backup imported');
      render();
    } catch (err) { toast(err.message || 'Could not read that file'); }
  });
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      const n = $('#persist-note');
      if (n) n.textContent = `Everything is stored on this device only. Storage is ${p ? 'marked persistent' : 'not marked persistent yet (installing to the Home Screen helps)'}. Export a backup now and then.`;
    });
  }
}

async function editStores() {
  const v = await promptSheet('Stores (comma separated)', S.settings.stores.join(', '));
  if (v == null) return;
  const list = v.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) { toast('Keep at least one store'); return; }
  S.settings.stores = [...new Set(list)];
  if (S.settings.currentStore && !list.includes(S.settings.currentStore)) S.settings.currentStore = '';
  save();
  render();
}

function openScorecard() {
  const byStore = new Map();
  for (const t of S.trips) {
    const s = byStore.get(t.store) || { store: t.store, trips: 0, total: 0, priced: 0, items: 0, last: 0 };
    s.trips++; s.total += t.total; s.priced += t.priced; s.items += t.items; s.last = Math.max(s.last, t.date);
    byStore.set(t.store, s);
  }
  const list = activeList();
  const cmp = list ? listPriceSummary(list, S.prices, S.settings.stores) : [];
  const learned = Object.entries(S.storeOrders).map(([s, o]) => `${esc(s)}: ${Object.keys(o).length} items mapped`).join('<br>');
  openSheet({
    title: 'Store Scorecard',
    left: { label: 'Close' },
    full: true,
    body: `
      <div class="group-footer" style="padding-top:12px">Not sure which store to commit to? Shop a few weeks at different stores with shopping mode on and log prices as you check items off. This compares them using only your real numbers.</div>
      <div class="group-header">Your trips</div>
      <div class="group">${byStore.size ? [...byStore.values()].map((s) => `<div class="row"><div class="row-main"><div class="row-title">${esc(s.store)}</div><div class="row-sub">${s.trips} ${s.trips === 1 ? 'trip' : 'trips'} · ${s.priced} of ${s.items} items priced · last ${new Date(s.last).toLocaleDateString()}</div></div><span class="row-value">${s.priced ? `${fmtMoney(s.total / s.trips)} avg` : ''}</span></div>`).join('') : '<div class="row"><span class="row-sub">No trips yet. Use Start Shopping on the Shop tab, then Finish Trip.</span></div>'}</div>
      <div class="group-header">Current list at each store</div>
      <div class="group">${cmp.length ? cmp.map((s) => `<div class="row"><div class="row-main"><div class="row-title">${esc(s.store)}</div><div class="row-sub">${s.priced} of ${s.count} items priced</div></div><span class="row-value">${fmtMoney(s.total)}</span></div>`).join('') : '<div class="row"><span class="row-sub">No prices for the current list yet.</span></div>'}</div>
      <div class="group-footer">Average trip totals depend on what you bought, so compare the same list across stores (above) for the fairest read.</div>
      ${learned ? `<div class="group-header">Aisle maps learned</div><div class="group"><div class="row"><div class="row-sub">${learned}</div></div></div>` : ''}`,
  });
}

function openPantryEditor(p) {
  const isNew = !p;
  const x = p || { id: uid(), key: null, foodId: null, name: '', grams: null };
  const all = [...foods.values()].sort((a, b) => foodName(a).localeCompare(foodName(b)));
  const metric = U() === 'metric';
  const food = x.foodId ? foods.get(x.foodId) : null;
  const amt = x.grams == null ? '' : food && food.unit && food.unit.show ? +(x.grams / food.unit.g).toFixed(1) : metric ? Math.round(x.grams) : +(x.grams / OZ).toFixed(1);
  const amtUnit = x.grams == null && !isNew ? 'plenty' : food && food.unit && food.unit.show ? 'count' : metric ? 'g' : 'oz';
  openSheet({
    title: isNew ? 'Pantry Item' : 'Edit Pantry Item',
    right: {
      label: 'Save',
      action: (el) => {
        const foodId = $('[name="food"]', el).value;
        const f = foodId ? foods.get(foodId) : null;
        const name = $('[name="name"]', el).value.trim() || (f ? foodName(f) : '');
        if (!name) { toast('Pick a food or type a name'); return false; }
        const u = $('[name="u"]', el).value;
        const a = parseFloat($('[name="amt"]', el).value);
        let grams = null;
        if (u !== 'plenty') {
          if (!(a > 0)) { toast('Enter an amount, or choose plenty'); return false; }
          grams = u === 'count' ? (f && f.unit ? a * f.unit.g : null) : a * (u === 'lb' ? LB : u === 'oz' ? OZ : u === 'kg' ? 1000 : 1);
          if (grams == null) { toast('That food has no count unit. Use a weight.'); return false; }
        }
        Object.assign(x, { foodId: f ? f.id : null, key: f ? 'f:' + f.id : 'n:' + normName(name), name, grams });
        if (isNew) S.pantry.push(x);
        save();
        renderMore();
      },
    },
    body: `
      <div class="spacer"></div>
      <div class="group">
        <div class="row field"><label>Food</label><select name="food"><option value="">Other (type a name)</option>${all.map((f) => `<option value="${esc(f.id)}" ${x.foodId === f.id ? 'selected' : ''}>${esc(foodName(f))}</option>`).join('')}</select></div>
        <div class="row"><input class="text-input" name="name" type="text" placeholder="Name (for other items)" value="${esc(x.foodId ? '' : x.name)}"></div>
        <div class="row field"><label>Amount</label><input name="amt" type="number" inputmode="decimal" value="${esc(amt)}" placeholder="0" style="flex-basis:30%"><select name="u" style="flex:0 0 96px">${[['plenty', 'plenty'], ['count', 'count'], ['oz', 'oz'], ['lb', 'lb'], ['g', 'g'], ['kg', 'kg']].map(([v, l]) => `<option value="${v}" ${amtUnit === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="group-footer">"Plenty" means skip it on lists entirely. Amounts are subtracted from what the week needs.</div>`,
  });
}

function openProteinValue() {
  const rows = proteinValue(foods, S.prices);
  openSheet({
    title: 'Cheapest Protein',
    left: { label: 'Close' },
    body: `<div class="group-header">Cost per 30 g of protein</div><div class="group">${rows.length ? rows.slice(0, 25).map((r, i) => `<div class="row"><div class="row-main"><div class="row-title">${esc(foodName(r.food))}${i === 0 ? '<span class="tag">Best</span>' : ''}</div><div class="row-sub">${esc(r.store)} · ${fmtNum(r.food.p, 1)} g protein per 100 g</div></div><span class="row-value">${fmtMoney(r.per30)}</span></div>`).join('') : `<div class="row"><span class="row-sub">No usable prices yet. Log prices for protein foods while you shop.</span></div>`}</div><div class="group-footer">Only from prices you logged.</div>`,
  });
}

async function openKrogerStore() {
  if (!proxyConfigured()) { toast('Set up the proxy first'); return; }
  const zip = await promptSheet('ZIP Code', '28105', 'ZIP code');
  if (!zip) return;
  const sheet = openSheet({ title: 'Choose Store', left: { label: 'Close' }, body: `<div class="spacer"></div><div class="group"><div class="row"><span class="spinner"></span><span class="muted">Finding stores</span></div></div>` });
  try {
    const res = await krogerLocations(zip);
    const locs = res.locations || [];
    $('.sheet-body', sheet.el).innerHTML = `<div class="spacer"></div><div class="group">${locs.length ? locs.map((l, i) => `<button class="row tappable" data-loc="${i}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(l.name)}</div><div class="row-sub">${esc(l.chainLabel)} · ${esc(l.address)}</div></div></button>`).join('') : '<div class="row"><span class="row-sub">No Kroger-family stores found near that ZIP.</span></div>'}</div>`;
    sheet.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-loc]');
      if (!b) return;
      const l = locs[+b.dataset.loc];
      S.settings.krogerLocationId = l.locationId;
      S.settings.krogerLocationName = l.name;
      S.settings.krogerStoreLabel = l.chainLabel || 'Kroger';
      if (!S.settings.stores.includes(S.settings.krogerStoreLabel)) S.settings.stores.push(S.settings.krogerStoreLabel);
      save();
      sheet.close();
      renderMore();
      toast('Store set');
    });
  } catch (err) {
    $('.sheet-body', sheet.el).innerHTML = `<div class="spacer"></div><div class="group"><div class="row"><span class="row-sub bad">${esc(err.message)}</span></div></div>`;
  }
}

async function doExport() {
  const text = exportData();
  const name = `preplist-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Prep List backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* =========================================================
   Actions
   ========================================================= */
const notSwiped = (el) => !(el.closest('.swipe')?.dataset.justSwiped || el.closest('.swipe.open'));
const actions = {
  'a2hs-dismiss': () => { S.settings.a2hsDismissed = true; save(); render(); },
  'go-week': () => go('week'),
  'go-shop': () => go('shop'),
  'go-prep': (el) => { S.ui.prepSession = el.dataset.s; go('prep'); },

  // Week
  'week-menu': () => weekMenu(),
  'week-history': () => openWeekHistory(),
  'week-build': () => {
    const w = curWeek();
    const needs = weekNeeds(w, ctx());
    if (!needs.length) { toast('Pick some meals first'); go('week'); return; }
    const existing = weekList(w);
    if (existing) { existing.needs = needs; rebuildList(existing); S.activeListId = existing.id; }
    else { const l = makeList(needs, `Week of ${shortDate(parseIso(w.start))}`); w.listId = l.id; }
    w.listDirty = false;
    save();
    go('shop');
    toast('Shopping list ready');
  },
  'week-update-list': () => actions['week-build'](),
  'week-repeat': () => repeatLastWeek(),
  'week-next': () => openCloseOut(),
  'slot-pick': (el) => openSlotPicker(+el.dataset.day, el.dataset.slot),
  'split-edit': () => openSplitEditor(),
  'prep-mode': (el) => { S.settings.prepMode = el.dataset.m; save(); renderWeek(); },

  // Shop
  'list-switch': () => openListSwitcher(),
  'list-new-empty': () => newEmptyList(),
  'list-menu': () => listMenu(),
  'list-add-item': () => { if (!activeList()) { newEmptyList(); return; } openItemEditor(null, true); },
  'list-rename': () => { const l = activeList(); if (l) renameList(l); },
  'store-pick': () => pickStore(),
  'trip-start': () => startTrip(),
  'trip-finish': () => finishTrip(),
  'quick-add': () => quickAdd(),
  'receipt-scan': () => $('#receipt-file').click(),
  'sec-toggle': (el) => {
    const l = activeList();
    const sec = el.dataset.sec;
    l.collapsed = l.collapsed || {};
    l.collapsed[sec] = !l.collapsed[sec];
    save();
    el.classList.toggle('collapsed', l.collapsed[sec]);
    $(`[data-secgroup="${CSS.escape(sec)}"]`).classList.toggle('hidden', l.collapsed[sec]);
  },
  'item-check': (el) => toggleItem(el.dataset.id, el),
  'item-edit': (el) => { if (!notSwiped(el)) return; const it = activeList().items.find((i) => i.id === el.dataset.id); if (it) openItemEditor(it); },

  // Prep
  'prep-session': (el) => { S.ui.prepSession = el.dataset.s; save(); renderPrep(); },
  'step-check': (el) => {
    const w = curWeek();
    const sid = S.ui.prepSession;
    w.prepSteps = w.prepSteps || {};
    w.prepSteps[sid] = w.prepSteps[sid] || {};
    w.prepSteps[sid][el.dataset.id] = !w.prepSteps[sid][el.dataset.id];
    save();
    el.classList.toggle('on');
    el.closest('.cook-row').classList.toggle('done');
  },
  'timer-start': (el) => startTimer(el.dataset.label, +el.dataset.min),
  'prep-done': (el) => {
    const w = curWeek();
    w.prepDone = w.prepDone || {};
    w.prepDone[el.dataset.s] = !w.prepDone[el.dataset.s];
    save();
    if (w.prepDone[el.dataset.s]) { toast('Prep done. Nice work.'); go('week'); } else renderPrep();
  },

  // Meals
  'meals-filter': (el) => { S.ui.mealsFilter = el.dataset.f; save(); renderMeals(); },
  'meal-new': () => openTemplateEditor(null, { slot: S.ui.mealsFilter && S.ui.mealsFilter !== 'all' ? S.ui.mealsFilter : 'dinner' }),
  'meal-import': () => openImport(),
  'meal-edit': (el) => { if (!notSwiped(el)) return; const t = tmap.get(el.dataset.id); if (t) openTemplateEditor(t); },

  // More
  units: (el) => {
    S.settings.units = el.dataset.u;
    for (const l of S.lists) if (l.needs && l.needs.length) rebuildList(l);
    save();
    renderMore();
  },
  'pantry-add': () => openPantryEditor(null),
  'pantry-edit': (el) => { if (notSwiped(el)) openPantryEditor(S.pantry.find((p) => p.id === el.dataset.id)); },
  'custom-add': () => openFoodForm({}),
  'custom-edit': (el) => { if (!notSwiped(el)) return; const f = S.customFoods.find((x) => x.id === el.dataset.id); if (f) openFoodForm(f); },
  'stores-edit': () => editStores(),
  scorecard: () => openScorecard(),
  'protein-open': () => openProteinValue(),
  'prices-clear': async () => {
    if (!Object.keys(S.prices).length) { toast('No prices logged yet'); return; }
    if (await confirmSheet('Clear all logged prices?', 'This removes every price you have entered or fetched.', 'Clear Prices')) { S.prices = {}; save(); renderMore(); }
  },
  'usda-test': async () => {
    S.settings.usdaKey = $('#m-usda').value.trim();
    save();
    try { const r = await usdaSearch('broccoli raw'); toast(`USDA key works (${r.length} results)`); } catch (err) { toast(err.message, 4000); }
  },
  'proxy-test': async () => {
    S.settings.proxyUrl = $('#m-proxy').value.trim();
    S.settings.proxyToken = $('#m-tok').value.trim();
    save();
    try {
      const h = await proxyHealth();
      const f = h.features || {};
      toast(`Connected. Links ${f.fetch ? 'on' : 'off'}, AI and receipts ${f.ai ? 'on' : 'off'}, Kroger ${f.kroger ? 'on' : 'off'}.`, 4500);
    } catch (err) { toast(err.message, 4500); }
  },
  'kroger-store': () => openKrogerStore(),
  export: () => doExport(),
  import: () => $('#import-file').click(),
  reset: async () => {
    if (!(await confirmSheet('Erase all data?', 'Everything will be deleted from this device. Export a backup first if you might want it.', 'Erase Everything'))) return;
    resetAll();
    refresh();
    go('week');
  },
};

/* =========================================================
   Wiring
   ========================================================= */
function setPath(path, value) {
  const [root, key] = path.split('.');
  if (root === 'settings') S.settings[key] = value;
}
function getPath(path) {
  const [root, key] = path.split('.');
  return root === 'settings' ? S.settings[key] : undefined;
}
const STEP_LIMITS = { 'settings.people': [1, 8], 'settings.containers': [1, 30], 'settings.fridgeDays': [2, 6] };
for (const [key, [lo, hi]] of Object.entries(STEP_LIMITS)) {
  stepHandlers[key] = (d) => {
    setPath(key, clampInt((+getPath(key) || lo) + d, lo, hi));
    if (key === 'settings.people') markDirty();
    save();
    render();
  };
}

function onClick(e) {
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    const st = stepBtn.closest('[data-stepper]');
    const h = st && stepHandlers[st.dataset.stepper];
    if (h) h(+stepBtn.dataset.step, $('.sv', st));
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a || a.disabled) return;
  const fn = actions[a.dataset.action];
  if (fn) fn(a, e);
}

function onChange(e) {
  const t = e.target;
  if (!t.dataset || !t.dataset.bind) return;
  let v;
  if (t.dataset.type === 'bool') v = t.checked;
  else if (t.dataset.type === 'num') v = numOrNull(t.value);
  else v = t.value.trim();
  if ((t.dataset.bind === 'settings.kcal' || t.dataset.bind === 'settings.containerOz') && v == null) v = getPath(t.dataset.bind);
  setPath(t.dataset.bind, v);
  if (['settings.kcal', 'settings.protein'].includes(t.dataset.bind)) markDirty();
  save();
  if (S.ui.tab === 'week') renderWeek();
}

function init() {
  for (const v of $$('.view')) {
    v.addEventListener('click', onClick);
    v.addEventListener('change', onChange);
  }
  $('#nav').addEventListener('click', onClick);
  $('#sheet-root').addEventListener('click', (e) => { if (e.target.closest('[data-step]')) onClick(e); });
  $('#timerbar').addEventListener('click', (e) => {
    const x = e.target.closest('[data-timer-x]');
    if (!x) return;
    S.timers = (S.timers || []).filter((t) => t.id !== x.dataset.timerX);
    save();
    tickTimers();
    updateWakeLock();
  });
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (S.ui.tab === t.dataset.tab) window.scrollTo({ top: 0, behavior: 'smooth' });
    else go(t.dataset.tab);
  }));
  $('#receipt-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handleReceipt(f); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTopSheet();
    if (e.key === 'Enter' && e.target.id === 'qa') { e.preventDefault(); quickAdd(); }
  });
  // Move to the current week automatically when a new week has started.
  const w = curWeek();
  if (todayIndex(w) === 7 && !S.weeks.some((x) => x.start === mondayOf(new Date()))) {
    S.ui.newWeekHint = true;
  }
  render();
  tickTimers();
  if (S.upgradedFromV1) {
    delete S.upgradedFromV1;
    save();
    setTimeout(() => toast('Prep List 2.0: plan by week, then shop and prep', 4000), 600);
  } else if (S.ui.newWeekHint && S.ui.tab === 'week') {
    delete S.ui.newWeekHint;
    setTimeout(() => toast('A new week started. Tap Start Next Week when ready.', 4000), 600);
  }
  requestPersist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
window.__preplist = { S, foods: () => foods };
