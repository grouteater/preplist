// Prep List: main app. Views, actions, and wiring.
import { state as S, save, uid, clone, defaultPlan, requestPersist, exportData, importData, resetAll } from './store.js';
import { BUILTIN_FOODS, SECTIONS, ROLE_SHARE, makeFoodIndex, sectionName, sectionOrder } from './foods.js';
import {
  fmtNum, fmtWeight, fmtMoney, fmtQty, fmtPortion, computePlan, fitShares, prepSchedule, needsFromPlan, needsFromRecipe,
  buildList, parseRecipeText, parseIngredientLine, extractRecipeFromHtml, recipeFromParsed, ingredientFromParsed,
  scaleRecipe, unitLabel, UNIT_OPTIONS, normName, cap, priceKey, estimateCost, listPriceSummary, proteinValue, listToText, LB, OZ, guessSection,
} from './engine.js';
import {
  esc, ICONS, checkbox, stepper, switchInput, toast, openSheet, actionSheet, confirmSheet, promptSheet, enableSwipe, swipeWrap,
  flipCapture, flipPlay, watchLargeTitle, closeTopSheet,
} from './ui.js';
import { usdaSearch, proxyConfigured, proxyHealth, fetchRecipePage, aiParseRecipe, krogerLocations, krogerProducts } from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let foods = makeFoodIndex(S.customFoods);
const refreshFoods = () => { foods = makeFoodIndex(S.customFoods); };
const U = () => S.settings.units;
const numOrNull = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : null; };
const foodName = (f) => (f ? f.short || f.name : 'Unknown food');
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const stepHandlers = {};
const scrollPos = {};

/* =========================================================
   Router and nav
   ========================================================= */
const VIEWS = { plan: renderPlan, list: renderList, recipes: renderRecipes, saved: renderSaved, more: renderMore };

function go(tab) {
  scrollPos[S.ui.tab] = window.scrollY;
  S.ui.tab = tab;
  save();
  render();
  window.scrollTo(0, scrollPos[tab] || 0);
}
function render() {
  const tab = VIEWS[S.ui.tab] ? S.ui.tab : 'plan';
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  VIEWS[tab]();
  watchLargeTitle($('#view-' + tab));
}
function setNav(title, left = '', right = '') {
  $('#nav-title').textContent = title;
  $('#nav-left').innerHTML = left;
  $('#nav-right').innerHTML = right;
}

function a2hsBanner() {
  if (!isIOS || isStandalone() || S.settings.a2hsDismissed) return '';
  return `<div class="banner"><div style="flex:1"><div class="bt">Add Prep List to your Home Screen</div><div class="bs">Tap ${ICONS.share} Share, then Add to Home Screen. iOS can clear data for websites that are not installed, so installing keeps your lists safer. Export a backup in More too.</div></div><button class="x" data-action="a2hs-dismiss" aria-label="Dismiss">&times;</button></div>`;
}

/* =========================================================
   PLAN VIEW
   ========================================================= */
function planPortionText(r) {
  const f = r.food;
  const basis = f.basis && f.basis !== 'as sold' ? ` ${f.basis}` : '';
  let t = `${fmtPortion(f, r.g, U())}${basis}/day · ${fmtNum(r.kcal)} kcal · ${fmtNum(r.p)} g protein`;
  if (f.cook && Math.abs((f.yield || 1) - 1) > 0.02) t += ` · about ${fmtWeight(r.cooked, U())} ${f.cook}`;
  return t;
}

function renderPlan() {
  const P = S.plan;
  const el = $('#view-plan');
  setNav(P.name, `<button class="nav-btn" data-action="plan-new">New</button>`, `<button class="nav-btn bold" data-action="plan-save">Save</button>`);
  const comp = computePlan(P, foods);
  const byId = new Map(comp.rows.map((r) => [r.foodId, r]));
  const hasMacro = +P.protein > 0 || +P.carbs > 0 || +P.fat > 0;
  const foodRows = P.items
    .map((it) => {
      const r = byId.get(it.foodId);
      const f = foods.get(it.foodId);
      if (!f) return swipeWrap(it.foodId, `<div class="row"><div class="row-main"><div class="row-title">Missing food</div><div class="row-sub">This food was deleted. Swipe to remove.</div></div></div>`);
      return swipeWrap(
        it.foodId,
        `<div class="row food-row">
          <div class="food-top tap-area" data-action="plan-food" data-id="${esc(it.foodId)}"><span class="row-title">${esc(foodName(f))}</span><span class="pct" data-pct="${esc(it.foodId)}">${Math.round((r ? r.pct : 0) * 100)}%</span></div>
          <input type="range" min="0" max="100" step="1" value="${Math.round(+it.share || 0)}" data-share="${esc(it.foodId)}" aria-label="${esc(foodName(f))} share" style="--pct:${Math.round(+it.share || 0)}%">
          <div class="row-sub" data-portion="${esc(it.foodId)}">${r ? esc(planPortionText(r)) : ''}</div>
        </div>`,
      );
    })
    .join('');

  el.innerHTML = `
    ${a2hsBanner()}
    <h1 class="large-title" data-action="plan-rename">${esc(P.name)}</h1>
    <div class="subtitle">${P.savedId ? 'Saved plan' : 'Draft'} · ${esc(P.days)} ${P.days == 1 ? 'day' : 'days'} · ${fmtNum(P.kcal)} kcal/day${P.people > 1 ? ` · ${P.people} people` : ''}</div>

    <div class="group-header">Targets</div>
    <div class="group">
      <div class="row"><span class="row-main">Days</span>${stepper('plan.days', P.days, 1, 31)}</div>
      <div class="row"><span class="row-main">People</span>${stepper('plan.people', P.people, 1, 12)}</div>
      <div class="row"><span class="row-main">Meals per day</span>${stepper('plan.mealsPerDay', P.mealsPerDay, 1, 8)}</div>
      <div class="row field"><label for="p-kcal">Calories per day</label><input id="p-kcal" type="number" inputmode="numeric" data-bind="plan.kcal" data-type="num" value="${esc(P.kcal)}" placeholder="2200"></div>
    </div>

    <div class="group-header">Macro targets (optional, per person per day)</div>
    <div class="group">
      <div class="row field"><label for="p-pro">Protein (g)</label><input id="p-pro" type="number" inputmode="numeric" data-bind="plan.protein" data-type="num" value="${esc(P.protein ?? '')}" placeholder="None"></div>
      <div class="row"><span class="row-main">Protein is a minimum</span>${switchInput('plan.proteinMin', P.proteinMin, 'data-bind="plan.proteinMin" data-type="bool"')}</div>
      <div class="row field"><label for="p-carb">Carbs (g)</label><input id="p-carb" type="number" inputmode="numeric" data-bind="plan.carbs" data-type="num" value="${esc(P.carbs ?? '')}" placeholder="None"></div>
      <div class="row field"><label for="p-fat">Fat (g)</label><input id="p-fat" type="number" inputmode="numeric" data-bind="plan.fat" data-type="num" value="${esc(P.fat ?? '')}" placeholder="None"></div>
    </div>
    <div class="group-footer">Set any of these, then tap Fit to Macros. It rebalances the food shares while keeping total calories fixed. You can still adjust the sliders after.</div>

    <div class="group-header"><span>Foods and calorie split</span><button class="hbtn" data-action="plan-defaults">Default split</button></div>
    <div class="group" id="plan-foods">
      ${foodRows}
      <button class="row tappable row-action" data-action="plan-add-food" style="width:100%">${ICONS.plus}<span class="row-title">Add Food</span></button>
    </div>
    <div class="group-footer">Sliders set each food's share of daily calories. Amounts are what you buy (raw meat, dry rice). Tap a food for details, swipe left to remove.</div>
    <div class="spacer"></div>
    <button class="btn secondary" data-action="plan-fit" ${hasMacro && P.items.length > 1 ? '' : 'disabled'}>Fit to Macros</button>
    <div id="plan-out"></div>
    <div class="spacer"></div><div class="spacer"></div>
    <button class="btn" data-action="plan-make-list">Make Grocery List</button>
    <div class="spacer"></div>
    <button class="btn secondary" data-action="plan-add-to-list" ${activeList() ? '' : 'disabled'}>Add to Current List</button>
  `;
  renderPlanOut(comp);
  enableSwipe($('#plan-foods', el), (id) => {
    P.items = P.items.filter((it) => it.foodId !== id);
    save();
    renderPlan();
  });
}

function macroCell(label, value, target, unit, isMin) {
  let cls = '', t = '';
  if (target > 0) {
    const r = value / target;
    const good = isMin ? r >= 0.99 : Math.abs(r - 1) <= 0.07;
    cls = good ? 'ok' : Math.abs(r - 1) <= 0.15 ? 'warn' : 'bad';
    t = `<div class="mt ${cls}">${isMin ? 'min ' : 'of '}${fmtNum(target)}${unit}</div><div class="bar"><i style="width:${Math.min(100, r * 100)}%"></i></div>`;
  }
  return `<div class="macro-cell"><div class="mv">${fmtNum(value)}</div><div class="ml">${label}${unit ? ' (' + unit.trim() + ')' : ''}</div>${t}</div>`;
}

function renderPlanOut(comp) {
  const P = S.plan;
  const out = $('#plan-out');
  if (!out) return;
  if (!comp.rows.length) {
    out.innerHTML = `<div class="empty"><div class="et">No foods yet</div>Add a few foods and the app will size each one to hit your calorie target.</div>`;
    return;
  }
  const t = comp.totals;
  const meals = Math.max(1, +P.mealsPerDay || 1);
  const sessions = prepSchedule(P, comp.rows, S.settings.fridgeDays);
  const prepHtml = sessions.some((s) => s.items.length)
    ? `<div class="group-header">Prep schedule</div><div class="group">${sessions
        .map((s) => `<div class="row"><div class="row-main"><div class="row-title">Day ${s.day}${s.n > 1 ? `: covers days ${s.day} to ${s.end}` : ''}</div><div class="row-sub">${s.items
          .map((i) => `${esc(foodName(i.food))}: cook ${esc(fmtWeight(i.raw, U()))} ${esc(i.food.basis || '')}${Math.abs((i.food.yield || 1) - 1) > 0.02 ? ` (about ${esc(fmtWeight(i.cooked, U()))} ${esc(i.food.cook)})` : ''}`)
          .join('<br>')}</div></div></div>`)
        .join('')}</div><div class="group-footer">Cooked food keeps about ${S.settings.fridgeDays} days in the fridge (change this in More). For longer plans, cook again or freeze portions.</div>`
    : '';
  out.innerHTML = `
    <div class="group-header">Daily summary, per person</div>
    <div class="group"><div class="macro-grid">
      ${macroCell('kcal', t.kcal, +P.kcal, '', false)}
      ${macroCell('Protein', t.p, +P.protein, ' g', !!P.proteinMin)}
      ${macroCell('Carbs', t.c, +P.carbs, ' g', false)}
      ${macroCell('Fat', t.f, +P.fat, ' g', false)}
    </div></div>
    <div class="group-header">Per meal (${meals} ${meals === 1 ? 'meal' : 'meals'} a day)</div>
    <div class="group">${comp.rows
      .map((r) => `<div class="row"><span class="row-main">${esc(foodName(r.food))}</span><span class="row-value">${esc(fmtPortion(r.food, r.perMeal, U(), { withWeight: !!(r.food.unit && r.food.unit.show) }))}${r.food.cook && Math.abs((r.food.yield || 1) - 1) > 0.02 ? `<div class="small muted">about ${esc(fmtWeight(r.perMeal * r.food.yield, U()))} ${esc(r.food.cook)}</div>` : ''}</span></div>`)
      .join('')}</div>
    <div class="group-footer">Weights are as purchased (raw or dry). Cooked weights are estimates and vary with cooking method.</div>
    ${prepHtml}
  `;
}

function updatePlanLive() {
  const comp = computePlan(S.plan, foods);
  for (const r of comp.rows) {
    const pe = $(`[data-pct="${CSS.escape(r.foodId)}"]`);
    if (pe) pe.textContent = Math.round(r.pct * 100) + '%';
    const po = $(`[data-portion="${CSS.escape(r.foodId)}"]`);
    if (po) po.textContent = planPortionText(r);
  }
  renderPlanOut(comp);
}

function addFoodToPlan(food) {
  if (S.plan.items.some((i) => i.foodId === food.id)) {
    toast(`${foodName(food)} is already in the plan`);
    return;
  }
  S.plan.items.push({ foodId: food.id, share: ROLE_SHARE[food.role] ?? 10 });
  save();
  renderPlan();
  toast(`Added ${foodName(food)}`);
}

function openAddFood(onPick = addFoodToPlan, title = 'Add Food') {
  const all = [...foods.values()].sort((a, b) => foodName(a).localeCompare(foodName(b)));
  const hasKey = !!S.settings.usdaKey.trim();
  const rowsHtml = (list) =>
    list
      .map((f) => `<button class="row tappable result-row" data-food="${esc(f.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(foodName(f))}${f.custom ? '<span class="tag gray">Mine</span>' : ''}</div><div class="row-sub">${fmtNum(f.kcal)} kcal · ${fmtNum(f.p, 1)} P · ${fmtNum(f.c, 1)} C · ${fmtNum(f.f, 1)} F per 100 g ${esc(f.basis || '')} · ${esc(sectionName(f.section))}</div></div></button>`)
      .join('');
  openSheet({
    title,
    full: true,
    body: `
      <div class="spacer"></div>
      <div class="group"><div class="row"><input class="text-input" type="search" placeholder="Search foods" id="af-q" autocomplete="off" enterkeyhint="search"></div></div>
      <div class="group-header">Built-in and custom foods</div>
      <div class="group" id="af-local">${rowsHtml(all)}</div>
      <div class="group-header">USDA FoodData Central</div>
      <div class="group" id="af-usda">${hasKey ? `<button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Search USDA</span></button>` : `<div class="row"><div class="row-main"><div class="row-sub">Add your free USDA API key in More to search thousands of foods.</div></div></div>`}</div>
      <div class="spacer"></div>
      <div class="group"><button class="row tappable row-action" id="af-custom" style="width:100%">${ICONS.plus}<span class="row-title">Create Custom Food</span></button></div>
    `,
    onMount(el, close) {
      const q = $('#af-q', el);
      q.addEventListener('input', () => {
        const s = normName(q.value);
        const list = s ? all.filter((f) => normName([f.name, f.short, ...(f.aliases || [])].join(' ')).includes(s)) : all;
        $('#af-local', el).innerHTML = rowsHtml(list) || `<div class="row"><span class="row-sub">No match. Try USDA or create a custom food.</span></div>`;
      });
      el.addEventListener('click', async (e) => {
        const fb = e.target.closest('[data-food]');
        if (fb) {
          close();
          onPick(foods.get(fb.dataset.food));
          return;
        }
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
            box.innerHTML = res.length
              ? res.map((r) => `<button class="row tappable result-row" data-usda="${esc(JSON.stringify(r))}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(r.description)}</div><div class="row-sub">${fmtNum(r.kcal)} kcal · ${fmtNum(r.p, 1)} P · ${fmtNum(r.c, 1)} C · ${fmtNum(r.f, 1)} F per 100 g · ${esc(r.dataType)}</div></div></button>`).join('') + `<button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Search Again</span></button>`
              : `<div class="row"><span class="row-sub">No USDA results for "${esc(term)}".</span></div><button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Search Again</span></button>`;
          } catch (err) {
            box.innerHTML = `<div class="row"><span class="row-sub bad">${esc(err.message)}</span></div><button class="row tappable row-action" id="af-usda-btn" style="width:100%"><span class="row-title">Try Again</span></button>`;
          }
          return;
        }
        if (e.target.closest('#af-custom')) {
          openFoodForm({ name: q.value.trim() }, (food) => { close(); onPick(food); });
        }
      });
    },
  });
}

/** Create or edit a custom food. prefill may be an existing custom food. */
function openFoodForm(prefill = {}, onSaved) {
  const existing = prefill.id && prefill.custom ? prefill : null;
  const f = { section: 'pantry', role: 'other', basis: 'raw', yield: 1, ...prefill };
  const pkg = (f.pkgs && f.pkgs[0]) || null;
  const secOpts = SECTIONS.map((s) => `<option value="${s.id}" ${f.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const roleOpts = Object.keys(ROLE_SHARE).map((r) => `<option value="${r}" ${f.role === r ? 'selected' : ''}>${cap(r)}</option>`).join('');
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
        if (v('valuesFor') === 'cooked' && yieldF > 0 && yieldF !== 1) {
          // Convert cooked values to as-purchased values: per raw gram = per cooked gram × yield.
          k *= yieldF; p *= yieldF; c *= yieldF; fat *= yieldF;
        }
        const pkgAmt = parseFloat(v('pkgAmt'));
        const pkgUnit = v('pkgUnit');
        const pkgG = pkgAmt > 0 ? pkgAmt * (pkgUnit === 'lb' ? LB : pkgUnit === 'oz' ? OZ : pkgUnit === 'kg' ? 1000 : 1) : null;
        const unitG = parseFloat(v('unitG'));
        const food = {
          id: existing ? existing.id : 'c-' + uid(),
          custom: true,
          name,
          short: name,
          section: v('section'),
          role: v('role'),
          basis: v('basis'),
          kcal: +k.toFixed(1), p: +p.toFixed(2), c: +c.toFixed(2), f: +fat.toFixed(2),
          yield: yieldF,
          cook: yieldF !== 1 ? 'cooked' : '',
          aliases: [normName(name)],
          loose: $('[name="loose"]', el).checked,
          pkgs: pkgG ? [{ label: v('pkgLabel').trim() || `${fmtWeight(pkgG, U())} pack`, g: pkgG }] : [],
          unit: unitG > 0 ? { name: v('unitName').trim() || 'piece', plural: (v('unitName').trim() || 'piece') + 's', g: unitG, show: $('[name="unitShow"]', el).checked } : null,
          gPerCup: parseFloat(v('gPerCup')) || null,
          fdcId: f.fdcId || null,
        };
        const i = S.customFoods.findIndex((x) => x.id === food.id);
        if (i >= 0) S.customFoods[i] = food;
        else S.customFoods.push(food);
        refreshFoods();
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
        <div class="row field"><label>Store section</label><select name="section">${secOpts}</select></div>
        <div class="row field"><label>Role in a plan</label><select name="role">${roleOpts}</select></div>
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
      <div class="group-footer">Cooked yield is cooked weight divided by purchased weight. Chicken is about 0.7 (it shrinks), dry rice about 2.8 (it absorbs water), 1 for foods you do not cook. If you enter cooked nutrition values, the app converts them to what you actually buy using this number.</div>
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
      ${f.fdcId ? `<div class="group-footer">From USDA FoodData Central, FDC ID ${esc(f.fdcId)}.</div>` : ''}
    `,
  });
}

function openPlanFood(foodId) {
  const f = foods.get(foodId);
  if (!f) return;
  const comp = computePlan(S.plan, foods);
  const r = comp.rows.find((x) => x.foodId === foodId);
  const it = S.plan.items.find((i) => i.foodId === foodId);
  openSheet({
    title: foodName(f),
    right: {
      label: 'Done',
      action: (el) => {
        const v = parseFloat($('[name="pct"]', el).value);
        if (isFinite(v) && v >= 0 && v <= 100 && r && Math.round(r.pct * 100) !== Math.round(v)) setPercent(foodId, v / 100);
        save();
        renderPlan();
      },
    },
    body: `
      <div class="group-header">Share of daily calories</div>
      <div class="group"><div class="row field"><label>Percent</label><input name="pct" type="number" inputmode="decimal" value="${r ? Math.round(r.pct * 1000) / 10 : 0}"></div></div>
      <div class="group-footer">Typing a percent sets this food exactly and scales the others to fill the rest.</div>
      ${r ? `<div class="group-header">Per day, per person</div><div class="group"><div class="row"><div class="row-main"><div class="kv">
        <span class="k">Buy</span><span>${esc(fmtPortion(f, r.g, U()))} ${esc(f.basis || '')}</span>
        ${f.cook && Math.abs((f.yield || 1) - 1) > 0.02 ? `<span class="k">Cooked</span><span>about ${esc(fmtWeight(r.cooked, U()))}</span>` : ''}
        <span class="k">Calories</span><span>${fmtNum(r.kcal)} kcal</span>
        <span class="k">Protein / Carbs / Fat</span><span>${fmtNum(r.p)} / ${fmtNum(r.c)} / ${fmtNum(r.f)} g</span>
      </div></div></div></div>` : ''}
      <div class="group-header">Per 100 g ${esc(f.basis || '')}</div>
      <div class="group"><div class="row"><div class="row-main"><div class="kv">
        <span class="k">Calories</span><span>${fmtNum(f.kcal)} kcal</span>
        <span class="k">Protein</span><span>${fmtNum(f.p, 1)} g</span>
        <span class="k">Carbs</span><span>${fmtNum(f.c, 1)} g</span>
        <span class="k">Fat</span><span>${fmtNum(f.f, 1)} g</span>
        <span class="k">Cooked yield</span><span>${f.yield || 1}</span>
        <span class="k">Packages</span><span>${f.loose ? 'loose, by weight' : (f.pkgs || []).map((p) => esc(p.label)).join(', ') || (f.unit ? 'by count' : 'by weight')}</span>
      </div></div></div></div>
      ${f.note ? `<div class="group-footer">${esc(f.note)}</div>` : ''}
      <div class="spacer"></div>
      <div class="group actions">
        <button class="row tappable" data-a="edit" style="width:100%"><span class="row-title">${f.custom ? 'Edit Food' : 'Make an Editable Copy'}</span></button>
        <button class="row tappable" data-a="remove" style="width:100%"><span class="row-title" style="color:var(--red)">Remove from Plan</span></button>
      </div>`,
    onMount(el, close) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'remove') {
          S.plan.items = S.plan.items.filter((i) => i.foodId !== foodId);
          save();
          close();
          renderPlan();
        } else if (a.dataset.a === 'edit') {
          close();
          if (f.custom) openFoodForm(f);
          else {
            const copy = { ...clone(f), name: f.name + ' (mine)', short: (f.short || f.name) + ' (mine)', id: undefined, custom: false, basisGuess: 'bought' };
            openFoodForm(copy, (nf) => {
              // Swap the built-in food for the new copy in the plan.
              if (it) it.foodId = nf.id;
              save();
              renderPlan();
            });
          }
        }
      });
    },
  });
}

/** Set one food to an exact fraction and scale the others proportionally. */
function setPercent(foodId, frac) {
  const items = S.plan.items;
  const others = items.filter((i) => i.foodId !== foodId);
  const otherSum = others.reduce((a, i) => a + Math.max(0, +i.share || 0), 0);
  const target = items.find((i) => i.foodId === foodId);
  frac = Math.min(0.99, Math.max(0, frac));
  if (!others.length) { target.share = 100; return; }
  const rest = 1 - frac;
  const scale = otherSum > 0 ? rest / otherSum : 0;
  for (const o of others) o.share = otherSum > 0 ? Math.max(0, +o.share || 0) * scale * 100 : (rest / others.length) * 100;
  target.share = frac * 100;
  const mx = Math.max(...items.map((i) => i.share));
  if (mx > 100) items.forEach((i) => (i.share = (i.share / mx) * 100));
  items.forEach((i) => (i.share = Math.round(i.share * 10) / 10));
}

/* =========================================================
   LIST VIEW
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

/** Rebuild generated items from the list's stored needs. Keeps checks, edits and manual items. */
function rebuildList(list) {
  if (!list.needs) return;
  const fresh = buildList(list.needs, { foods, pantry: S.pantry, subtract: S.settings.subtractPantry, units: U(), name: list.name, uid });
  const old = new Map(list.items.filter((i) => !i.manual).map((i) => [i.key, i]));
  for (const it of fresh.items) {
    const o = old.get(it.key);
    if (o) {
      it.id = o.id;
      if (o.checked) it.checked = true;
      if (o.edited) { it.name = o.name; it.qty = o.qty; it.section = o.section; it.edited = true; }
    }
  }
  const manual = list.items.filter((i) => i.manual);
  manual.forEach((m, k) => (m.order = fresh.items.length + k));
  list.items = [...fresh.items, ...manual];
}

function addNeedsToActive(needs) {
  const list = activeList();
  if (!list) return makeList(needs, 'Grocery List');
  list.needs = (list.needs || []).concat(needs);
  rebuildList(list);
  save();
  return list;
}

function priceStoreFor(list) {
  const s = S.settings.priceStore;
  if (s) return s;
  const sum = listPriceSummary(list, S.prices, S.settings.stores);
  return sum[0] ? sum[0].store : '';
}

function renderList() {
  const el = $('#view-list');
  const list = activeList();
  const leftBtn = `<button class="nav-btn" data-action="list-switch">${ICONS.listIcon}<span>Lists</span></button>`;
  if (!list) {
    setNav('Grocery List', leftBtn, '');
    el.innerHTML = `<h1 class="large-title">Grocery List</h1><div class="empty"><div class="et">No lists yet</div>Build one from the Plan or Recipes tab, combine saved meals in Saved, or start an empty list.</div><button class="btn" data-action="list-new-empty">New Empty List</button>`;
    return;
  }
  setNav(list.name, leftBtn, `<button class="nav-btn" data-action="list-menu" aria-label="List options">${ICONS.more}</button><button class="nav-btn" data-action="list-add-item" aria-label="Add item">${ICONS.compose}</button>`);
  const store = priceStoreFor(list);
  const done = list.items.filter((i) => i.checked).length;
  let priceLine = '';
  if (store) {
    let total = 0, priced = 0;
    for (const it of list.items) {
      const c = estimateCost(it, S.prices[priceKey(it)] && S.prices[priceKey(it)][store]);
      if (c != null) { total += c; priced++; }
    }
    priceLine = priced ? `<br><button data-action="list-price-store" style="color:var(--accent);min-height:32px">Est. ${fmtMoney(total)} at ${esc(store)}, ${priced} of ${list.items.length} priced</button>` : `<br><button data-action="list-price-store" style="color:var(--accent);min-height:32px">No prices yet for ${esc(store)}</button>`;
  } else if (list.items.length) {
    priceLine = `<br><span class="muted">Tap an item to log what you paid. Totals appear once you add prices.</span>`;
  }
  const groups = new Map();
  for (const it of list.items) {
    const sec = it.section || 'other';
    if (!groups.has(sec)) groups.set(sec, []);
    groups.get(sec).push(it);
  }
  const secs = [...groups.keys()].sort((a, b) => sectionOrder(a) - sectionOrder(b));
  const secHtml = secs
    .map((sec) => {
      const items = groups.get(sec).slice().sort((a, b) => (a.checked - b.checked) || a.order - b.order);
      const left = items.filter((i) => !i.checked).length;
      const collapsed = !!list.collapsed[sec];
      return `<button class="sec-toggle ${collapsed ? 'collapsed' : ''}" data-action="sec-toggle" data-sec="${esc(sec)}" aria-expanded="${!collapsed}"><span class="sec-name">${esc(sectionName(sec))}</span><span class="sec-count">${left ? left : 'Done'}</span>${ICONS.down}</button>
      <div class="group ${collapsed ? 'hidden' : ''}" data-secgroup="${esc(sec)}">${items.map((it) => itemRow(it, store)).join('')}</div>`;
    })
    .join('');
  el.innerHTML = `
    <h1 class="large-title" data-action="list-rename">${esc(list.name)}</h1>
    <div class="subtitle">${list.items.length} ${list.items.length === 1 ? 'item' : 'items'}${done ? ` · ${done} checked` : ''}${priceLine}</div>
    ${list.items.length ? secHtml : `<div class="empty"><div class="et">Empty list</div>Tap the compose button to add an item.</div>`}
    <div class="spacer"></div>
    <div class="group"><button class="row tappable row-action" data-action="list-add-item" style="width:100%">${ICONS.plus}<span class="row-title">New Item</span></button></div>
  `;
  enableSwipe(el, (id, wrap) => {
    list.items = list.items.filter((i) => i.id !== id);
    save();
    wrap.style.maxHeight = wrap.offsetHeight + 'px';
    wrap.classList.add('removing');
    requestAnimationFrame(() => (wrap.style.maxHeight = '0px'));
    setTimeout(renderList, 260);
  });
}

function itemRow(it, store) {
  const entry = store && S.prices[priceKey(it)] ? S.prices[priceKey(it)][store] : null;
  const cost = estimateCost(it, entry);
  const sub = (it.detail || []).map(esc);
  if (it.note) sub.push(esc(it.note));
  if (cost != null) sub.push(`<span class="price-tag">Est. ${fmtMoney(cost)} at ${esc(store)}</span>`);
  return swipeWrap(
    it.id,
    `<div class="row item-row ${it.checked ? 'done' : ''}" data-flip="${esc(it.id)}">${checkbox(it.checked, 'item-check', it.id)}<div class="row-main tap-area" data-action="item-edit" data-id="${esc(it.id)}"><div class="row-title"><span>${esc(it.name)}</span>${it.qty ? `<span class="qty">${esc(it.qty)}</span>` : ''}</div>${sub.length ? `<div class="row-sub">${sub.join('<br>')}</div>` : ''}</div></div>`,
    'check-row',
  );
}

function toggleItem(id, btn) {
  const list = activeList();
  const it = list && list.items.find((i) => i.id === id);
  if (!it) return;
  it.checked = !it.checked;
  save();
  btn.classList.toggle('on', it.checked);
  btn.setAttribute('aria-checked', it.checked);
  btn.closest('.item-row').classList.toggle('done', it.checked);
  const view = $('#view-list');
  clearTimeout(toggleItem.t);
  toggleItem.t = setTimeout(() => {
    const before = flipCapture(view);
    const y = window.scrollY;
    renderList();
    window.scrollTo(0, y);
    flipPlay(view, before);
  }, 280);
}

function openItemEditor(item, isNew = false) {
  const list = activeList();
  const it = item || { id: uid(), name: '', qty: '', section: 'produce', checked: false, manual: true, order: list.items.length ? Math.max(...list.items.map((i) => i.order)) + 1 : 0, key: null };
  const key = () => it.key || 'n:' + normName(it.name);
  const stores = S.settings.stores;
  const pricesHtml = () => {
    const e = S.prices[key()] || {};
    const rows = Object.entries(e)
      .sort((a, b) => a[1].price - b[1].price)
      .map(([s, v]) => `<div class="row"><div class="row-main"><div class="row-title">${esc(s)}</div><div class="row-sub">${fmtMoney(v.price)} ${v.per === 'pkg' ? 'per package' + (v.label ? ` (${esc(v.label)})` : '') : 'per ' + esc(v.per)}${v.source ? ` · ${esc(v.source)}` : ''} · ${new Date(v.date).toLocaleDateString()}</div></div><span class="row-value">${(() => { const c = estimateCost(it, v); return c != null ? 'Est. ' + fmtMoney(c) : ''; })()}</span></div>`)
      .join('');
    return rows || `<div class="row"><span class="row-sub">No prices logged for this item yet.</span></div>`;
  };
  const krogerReady = proxyConfigured() && S.settings.krogerLocationId;
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
        if (isNew) list.items.push(it);
        save();
        renderList();
      },
    },
    body: `
      <div class="spacer"></div>
      <div class="group">
        <div class="row"><input class="text-input" name="name" type="text" placeholder="Item" value="${esc(it.name)}" enterkeyhint="next"></div>
        <div class="row field"><label>Amount</label><input name="qty" type="text" value="${esc(it.qty || '')}" placeholder="e.g. 2 lb"></div>
        <div class="row field"><label>Section</label><select name="section">${SECTIONS.map((s) => `<option value="${s.id}" ${it.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="row"><input class="text-input" name="note" type="text" placeholder="Note" value="${esc(it.note || '')}"></div>
      </div>
      ${(it.detail || []).length ? `<div class="group-footer">${it.detail.map(esc).join('<br>')}</div>` : ''}
      <div class="group-header">Log a price</div>
      <div class="group">
        <div class="row field"><label>Store</label><select name="pstore">${stores.map((s) => `<option ${s === (S.settings.priceStore || stores[0]) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="row field"><label>Price ($)</label><input name="pprice" type="number" inputmode="decimal" step="0.01" placeholder="0.00"></div>
        <div class="row field"><label>Price is</label><select name="pper"><option value="pkg">per package</option><option value="lb">per lb</option><option value="kg">per kg</option><option value="each">each</option></select></div>
        <div class="row field"><label>Package size</label><input name="plabel" type="text" placeholder="${esc(it.pkgParts && it.pkgParts.length === 1 ? it.pkgParts[0].label : 'optional')}" value="${esc(it.pkgParts && it.pkgParts.length === 1 ? it.pkgParts[0].label : '')}"></div>
        <button class="row tappable row-action" data-a="saveprice" style="width:100%"><span class="row-title">Save Price</span></button>
      </div>
      <div class="group-footer">Prices are only what you enter (or fetch live from Kroger via your proxy). The app remembers the last price per store and uses it for list totals and store comparisons.</div>
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
          if (!it.name && !$('[name="name"]', el).value.trim()) { toast('Name the item first'); return; }
          if (!it.name) it.name = $('[name="name"]', el).value.trim();
          const price = parseFloat($('[name="pprice"]', el).value);
          if (!(price >= 0)) { toast('Enter a price'); return; }
          const per = $('[name="pper"]', el).value;
          const label = $('[name="plabel"]', el).value.trim();
          const single = it.pkgParts && it.pkgParts.length === 1 && it.pkgParts[0].label === label ? it.pkgParts[0].g : null;
          const store = $('[name="pstore"]', el).value;
          S.prices[key()] = S.prices[key()] || {};
          S.prices[key()][store] = { price, per, label: per === 'pkg' ? label : '', grams: per === 'pkg' ? single || parseSizeGrams(label, it.foodId) : null, date: Date.now() };
          save();
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
              : `<div class="row"><span class="row-sub">No priced results. Kroger only returns prices for items sold at your selected store.</span></div>`;
            box.onclick = (ev) => {
              const b = ev.target.closest('[data-kr]');
              if (!b) return;
              const x = items[+b.dataset.kr];
              const price = x.promo && x.promo < x.price ? x.promo : x.price;
              const st = S.settings.krogerStoreLabel || 'Kroger';
              if (!S.settings.stores.includes(st)) S.settings.stores.push(st);
              S.prices[key()] = S.prices[key()] || {};
              S.prices[key()][st] = { price, per: 'pkg', label: x.size || '', grams: parseSizeGrams(x.size, it.foodId), date: Date.now(), source: 'Kroger API' };
              save();
              $('#ie-prices', el).innerHTML = pricesHtml();
              toast(`Saved ${fmtMoney(price)} at ${st}`);
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
  if (u === 'fl oz') {
    const f = foods.get(foodId);
    return f && f.gPerCup ? (v / 8) * f.gPerCup : null;
  }
  if (u === 'oz') return v * OZ;
  if (u === 'lb' || u === 'lbs') return v * LB;
  if (u === 'g') return v;
  if (u === 'kg') return v * 1000;
  const f = foods.get(foodId);
  return f && f.unit ? v * f.unit.g : null;
}

async function listMenu() {
  const list = activeList();
  if (!list) return;
  const v = await actionSheet(list.name, [
    { label: 'Share as Text', value: 'share' },
    { label: 'Copy as Text', value: 'copy' },
    { label: 'Compare Stores', value: 'compare' },
    { label: 'Choose Price Store', value: 'store' },
    { label: 'Recalculate (pantry, units)', value: 'rebuild' },
    { label: 'Uncheck All', value: 'uncheck' },
    { label: 'Remove Checked Items', value: 'clearchecked' },
    { label: 'Rename List', value: 'rename' },
    { label: 'Delete List', value: 'delete', danger: true },
  ]);
  if (!v) return;
  const text = listToText(list, sectionName);
  if (v === 'share') {
    if (navigator.share) {
      try { await navigator.share({ title: list.name, text }); } catch (e) { /* cancelled */ }
    } else copyText(text);
  } else if (v === 'copy') copyText(text);
  else if (v === 'compare') openCompare(list);
  else if (v === 'store') choosePriceStore();
  else if (v === 'rebuild') {
    if (!list.needs || !list.needs.length) { toast('This list has no generated items'); return; }
    rebuildList(list); save(); renderList(); toast('List recalculated');
  } else if (v === 'uncheck') { list.items.forEach((i) => (i.checked = false)); save(); renderList(); }
  else if (v === 'clearchecked') {
    const n = list.items.filter((i) => i.checked).length;
    if (!n) { toast('Nothing checked'); return; }
    const removedKeys = new Set(list.items.filter((i) => i.checked && i.key).map((i) => i.key));
    list.items = list.items.filter((i) => !i.checked);
    if (list.needs) list.needs = list.needs.filter((n2) => !removedKeys.has(n2.key));
    save(); renderList(); toast(`Removed ${n} ${n === 1 ? 'item' : 'items'}`);
  } else if (v === 'rename') renameList(list);
  else if (v === 'delete') {
    if (await confirmSheet('Delete this list?', 'This cannot be undone.', 'Delete List')) {
      S.lists = S.lists.filter((l) => l.id !== list.id);
      S.activeListId = S.lists[0] ? S.lists[0].id : null;
      save(); renderList();
    }
  }
}

async function renameList(list) {
  const n = await promptSheet('Rename List', list.name);
  if (n) { list.name = n; save(); render(); }
}

async function choosePriceStore() {
  const v = await actionSheet('Price totals use', [{ label: 'Automatic (most prices)', value: '__auto' }, ...S.settings.stores.map((s) => ({ label: s, value: s }))]);
  if (!v) return;
  S.settings.priceStore = v === '__auto' ? '' : v;
  save();
  render();
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
      <div class="group">${sum.length ? sum.map((s) => `<div class="row"><div class="row-main"><div class="row-title">${esc(s.store)}${cheapest && cheapest.store === s.store ? '<span class="tag">Cheapest</span>' : ''}</div><div class="row-sub">${s.priced} of ${n} items priced${s.priced < n ? ', total is partial' : ''}</div></div><span class="row-value">${fmtMoney(s.total)}</span></div>`).join('') : `<div class="row"><span class="row-sub">No prices logged for any item on this list yet. Tap an item on the list and use Log a price.</span></div>`}</div>
      <div class="group-footer">Built only from prices you logged${proxyConfigured() ? ' or fetched from Kroger' : ''}. A store is only called cheapest when every item has a price there. Partial totals are not comparable.</div>
    `,
  });
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Could not copy'));
}

function openListSwitcher() {
  const body = () => `
    <div class="spacer"></div>
    <div class="group" id="ls-rows">${S.lists.map((l) => swipeWrap(l.id, `<button class="row tappable" data-list="${esc(l.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(l.name)}${l.id === S.activeListId ? '<span class="tag">Current</span>' : ''}</div><div class="row-sub">${l.items.length} items · ${new Date(l.createdAt).toLocaleDateString()}</div></div>${ICONS.chevron}</button>`)).join('') || `<div class="row"><span class="row-sub">No lists yet.</span></div>`}</div>
    <div class="spacer"></div>
    <div class="group"><button class="row tappable row-action" data-a="new" style="width:100%">${ICONS.plus}<span class="row-title">New Empty List</span></button></div>`;
  openSheet({
    title: 'Lists',
    left: { label: 'Close' },
    body: body(),
    onMount(el, close) {
      const bind = () => enableSwipe(el, (id) => {
        S.lists = S.lists.filter((l) => l.id !== id);
        if (S.activeListId === id) S.activeListId = S.lists[0] ? S.lists[0].id : null;
        save();
        $('.sheet-body', el).innerHTML = body();
        bind();
        renderList();
      });
      bind();
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-list]');
        if (b && !b.closest('.swipe')?.dataset.justSwiped) {
          S.activeListId = b.dataset.list; save(); close(); go('list');
        }
        if (e.target.closest('[data-a="new"]')) {
          close();
          newEmptyList();
        }
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
  go('list');
}

/* =========================================================
   RECIPES VIEW
   ========================================================= */
function renderRecipes() {
  const el = $('#view-recipes');
  const R = S.recipe;
  setNav(R ? R.name : 'Recipes', R ? `<button class="nav-btn" data-action="recipe-close">Close</button>` : '', R ? `<button class="nav-btn bold" data-action="recipe-save">Save</button>` : '');
  const proxy = proxyConfigured();
  const importHtml = `
    <div class="group-header">Import from a link</div>
    <div class="group"><div class="row"><input class="text-input" type="url" id="r-url" placeholder="https://example.com/recipe" autocomplete="off" autocapitalize="off" enterkeyhint="go"><button class="btn inline" data-action="recipe-fetch">Get</button></div></div>
    <div class="group-footer">${proxy ? 'Links are fetched through your proxy and read from the page\'s schema.org Recipe data.' : 'Most recipe sites block direct reading from another site (CORS), so links usually need the free proxy in More. Pasting the recipe text below always works.'}</div>
    <div class="group-header">Paste recipe text or describe a dish</div>
    <div class="group"><div class="row"><textarea class="text-input" id="r-text" placeholder="Paste the ingredient list (and steps if you like). One ingredient per line works best, for example:&#10;2 lb chicken thighs&#10;1 1/2 cups white rice&#10;1 head broccoli"></textarea></div></div>
    <div class="spacer"></div>
    <div class="btn-row"><button class="btn secondary" data-action="recipe-parse">Parse Text</button><button class="btn secondary" data-action="recipe-ai" ${proxy ? '' : 'disabled'}>Parse with AI</button></div>
    <div class="group-footer">Parse Text runs on your phone and handles normal ingredient lists. Parse with AI handles messy text or a plain description like "chicken burrito bowls for 4", and needs the optional proxy with an Anthropic API key.</div>
    <div class="spacer"></div>
    <div class="group"><button class="row tappable row-action" data-action="recipe-blank" style="width:100%">${ICONS.plus}<span class="row-title">Start a Blank Recipe</span></button></div>`;
  if (!R) {
    el.innerHTML = `<h1 class="large-title">Recipes</h1>${importHtml}`;
    return;
  }
  const sc = scaleRecipe(R, foods);
  const planMeal = Math.round((+S.plan.kcal || 0) / Math.max(1, +S.plan.mealsPerDay || 1));
  const ingRows = R.ingredients
    .map((ing) => {
      const f = ing.foodId ? foods.get(ing.foodId) : null;
      const g = sc.ingredients.find((x) => x.id === ing.id);
      const baseG = g && g.grams != null && sc.factor ? g.grams / sc.factor : null;
      const amt = `${ing.qty != null ? fmtQty(ing.qty) : ''}${ing.unit ? ' ' + unitLabel(ing.unit, ing.qty) : ''}`.trim();
      const sub = f ? `${foodName(f)}${baseG != null ? ` · ${fmtWeight(baseG, U())}` : ' · amount not convertible, not counted'}` : 'No nutrition match. Tap to pick one.';
      return swipeWrap(ing.id, `<button class="row tappable" data-action="ing-edit" data-id="${esc(ing.id)}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${amt ? `<b style="font-weight:600">${esc(amt)}</b> ` : ''}${esc(ing.name)}</div><div class="row-sub ${f ? '' : 'warn'}">${esc(sub)}${ing.note ? ' · ' + esc(ing.note) : ''}</div></div></button>`);
    })
    .join('');
  const scaledRows = sc.ingredients
    .map((ing) => {
      const f = ing.foodId ? foods.get(ing.foodId) : null;
      const isWeight = ['g', 'kg', 'oz', 'lb'].includes(ing.unit);
      let amt;
      if (isWeight && ing.grams != null) amt = fmtWeight(ing.grams, U());
      else amt = `${ing.qty != null ? fmtQty(ing.qty) : ''}${ing.unit ? ' ' + unitLabel(ing.unit, ing.qty) : ''}`.trim();
      const extra = !isWeight && ing.grams != null ? ` (${fmtWeight(ing.grams, U())})` : '';
      return `<div class="row"><div class="row-main"><div class="row-title">${amt ? `<b style="font-weight:600">${esc(amt)}</b> ` : ''}${esc(ing.name)}</div>${extra || (f && f.unit && f.unit.show && ing.grams) ? `<div class="row-sub">${esc(extra.trim())}</div>` : ''}</div></div>`;
    })
    .join('');
  const ps = sc.perServing;
  el.innerHTML = `
    <h1 class="large-title" data-action="recipe-rename">${esc(R.name)}</h1>
    <div class="subtitle">${R.sourceUrl ? `<a href="${esc(R.sourceUrl)}" target="_blank" rel="noopener">Source</a> · ` : ''}${R.ingredients.length} ingredients${R.savedId ? ' · Saved' : ''}</div>

    <div class="group-header">Original recipe</div>
    <div class="group"><div class="row"><span class="row-main">Recipe makes (servings)</span>${stepper('recipe.baseServings', R.baseServings, 1, 48)}</div></div>

    <div class="group-header">Ingredients as written</div>
    <div class="group" id="r-ings">${ingRows}<button class="row tappable row-action" data-action="ing-add" style="width:100%">${ICONS.plus}<span class="row-title">Add Ingredient</span></button></div>
    <div class="group-footer">Tap to fix an amount or nutrition match. Swipe left to delete. Unmatched items (salt, spices) still go on your list.</div>

    <div class="group-header">Portion it</div>
    <div class="group">
      <div class="row"><div class="seg inrow"><button class="${R.mode !== 'prep' ? 'on' : ''}" data-action="recipe-mode" data-mode="once">One meal</button><button class="${R.mode === 'prep' ? 'on' : ''}" data-action="recipe-mode" data-mode="prep">Meal prep batch</button></div></div>
      <div class="row"><span class="row-main">People</span>${stepper('recipe.people', R.people, 1, 24)}</div>
      ${R.mode === 'prep' ? `<div class="row"><span class="row-main">Days</span>${stepper('recipe.days', R.days, 1, 14)}</div>` : ''}
      <div class="row field"><label for="r-kcal">Calories per serving</label><input id="r-kcal" type="number" inputmode="numeric" data-bind="recipe.kcalTarget" data-type="num" value="${esc(R.kcalTarget ?? '')}" placeholder="${sc.known ? fmtNum(scaleRecipe({ ...R, kcalTarget: null }, foods).perServing.kcal) + ' as written' : 'optional'}"></div>
      ${planMeal > 0 ? `<button class="row tappable row-action" data-action="recipe-fit-plan" data-kcal="${planMeal}" style="width:100%"><span class="row-title">Use my plan: ${fmtNum(planMeal)} kcal per meal</span></button>` : ''}
    </div>
    <div class="group-footer">${R.mode === 'prep' ? `${R.people} ${R.people == 1 ? 'person' : 'people'} × ${R.days} days = ${sc.servings} servings.` : `${sc.servings} ${sc.servings === 1 ? 'serving' : 'servings'}.`} Scale factor ${fmtNum(sc.factor, 2)}×${sc.kcalFactor !== 1 ? `, including ${fmtNum(sc.kcalFactor, 2)}× to hit your calorie target` : ''}.</div>

    <div class="group-header">Per serving</div>
    <div class="group"><div class="macro-grid">${macroCell('kcal', ps.kcal, 0, '', false)}${macroCell('Protein', ps.p, 0, ' g', false)}${macroCell('Carbs', ps.c, 0, ' g', false)}${macroCell('Fat', ps.f, 0, ' g', false)}</div></div>
    <div class="group-footer">Based on ${sc.known} of ${R.ingredients.length} ingredients with a nutrition match and a convertible amount.${sc.unknown ? ' The rest are not counted, so real calories may be higher.' : ''}</div>

    <div class="group-header">Scaled for ${sc.servings} ${sc.servings === 1 ? 'serving' : 'servings'}</div>
    <div class="group">${scaledRows || '<div class="row"><span class="row-sub">No ingredients yet.</span></div>'}</div>

    ${R.steps && R.steps.length ? `<div class="group-header">Steps</div><div class="group">${R.steps.map((s, i) => `<div class="row"><div class="row-main"><div class="row-sub" style="color:var(--label);font-size:15px">${i + 1}. ${esc(s)}</div></div></div>`).join('')}</div>` : ''}

    <div class="spacer"></div><div class="spacer"></div>
    <button class="btn" data-action="recipe-make-list">Make Grocery List</button>
    <div class="spacer"></div>
    <button class="btn secondary" data-action="recipe-add-to-list" ${activeList() ? '' : 'disabled'}>Add to Current List</button>
    <div class="spacer"></div>
    <div class="group-header">Import another recipe</div>
    ${importHtml.replace('<div class="group-header">Import from a link</div>', '')}
  `;
  enableSwipe($('#r-ings', el), (id) => {
    R.ingredients = R.ingredients.filter((i) => i.id !== id);
    save();
    renderRecipes();
  });
}

function loadParsedRecipe(parsed, sourceUrl = '') {
  const r = recipeFromParsed({ ...parsed, sourceUrl }, foods, uid);
  S.recipe = r;
  save();
  window.scrollTo(0, 0);
  renderRecipes();
  watchLargeTitle($('#view-recipes'));
  const unmatched = r.ingredients.filter((i) => !i.foodId).length;
  toast(`${r.ingredients.length} ingredients${unmatched ? `, ${unmatched} without a nutrition match` : ''}`);
}

function openIngredientEditor(ing, isNew = false) {
  const R = S.recipe;
  const x = ing || { id: uid(), qty: null, unit: '', name: '', note: '', foodId: null, section: 'pantry' };
  const all = [...foods.values()].sort((a, b) => foodName(a).localeCompare(foodName(b)));
  openSheet({
    title: isNew ? 'Add Ingredient' : 'Edit Ingredient',
    right: {
      label: 'Done',
      action: (el) => {
        const name = $('[name="name"]', el).value.trim();
        if (!name) { toast('Name is required'); return false; }
        const q = $('[name="qty"]', el).value.trim();
        let qty = null;
        if (q) {
          const p = parseIngredientLine(q + ' x');
          qty = p && p.qty != null ? p.qty : parseFloat(q);
          if (!isFinite(qty)) qty = null;
        }
        x.qty = qty;
        x.unit = $('[name="unit"]', el).value;
        x.name = name;
        x.note = $('[name="note"]', el).value.trim();
        x.foodId = $('[name="food"]', el).value || null;
        const f = x.foodId ? foods.get(x.foodId) : null;
        x.section = f ? f.section : $('[name="section"]', el).value;
        if (isNew) R.ingredients.push(x);
        save();
        renderRecipes();
      },
    },
    body: `
      <div class="spacer"></div>
      <div class="group">
        <div class="row field"><label>Amount</label><input name="qty" type="text" inputmode="decimal" value="${x.qty != null ? esc(fmtQty(x.qty)) : ''}" placeholder="e.g. 1 1/2"></div>
        <div class="row field"><label>Unit</label><select name="unit">${UNIT_OPTIONS.map((u) => `<option value="${u}" ${x.unit === u ? 'selected' : ''}>${u ? esc(unitLabel(u, 2)) : 'none (count)'}</option>`).join('')}</select></div>
        <div class="row"><input class="text-input" name="name" type="text" placeholder="Ingredient" value="${esc(x.name)}"></div>
        <div class="row"><input class="text-input" name="note" type="text" placeholder="Note (chopped, divided...)" value="${esc(x.note || '')}"></div>
      </div>
      <div class="group-header">Nutrition match</div>
      <div class="group">
        <div class="row field"><label>Food</label><select name="food"><option value="">None</option>${all.map((f) => `<option value="${esc(f.id)}" ${x.foodId === f.id ? 'selected' : ''}>${esc(foodName(f))}</option>`).join('')}</select></div>
        <div class="row field"><label>Section if unmatched</label><select name="section">${SECTIONS.map((s) => `<option value="${s.id}" ${x.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      </div>
      <div class="group-footer">Weights (g, oz, lb) always convert. Cups and spoons convert when the matched food knows its grams per cup. Counts convert when it has a unit weight (eggs, bananas). Need a food that is not listed? Add it in More under Custom Foods, or through USDA search on the Plan tab.</div>
    `,
    onMount(el) { if (isNew) setTimeout(() => $('[name="qty"]', el).focus(), 350); },
  });
}

/* =========================================================
   SAVED VIEW
   ========================================================= */
let selectMode = false;
const selected = new Set();

function savedSubtitle(e) {
  const d = e.data;
  if (e.type === 'plan') return `Plan · ${d.days} ${d.days == 1 ? 'day' : 'days'} · ${fmtNum(d.kcal)} kcal/day${d.people > 1 ? ` · ${d.people} people` : ''} · ${d.items.length} foods`;
  return `Recipe · ${d.mode === 'prep' ? `prep ${d.days} days` : 'one meal'} · ${d.people} ${d.people == 1 ? 'person' : 'people'}${d.kcalTarget ? ` · ${fmtNum(d.kcalTarget)} kcal/serving` : ''}`;
}

function needsForEntry(e) {
  return e.type === 'plan' ? needsFromPlan(e.data, foods) : needsFromRecipe(e.data, foods);
}

function renderSaved() {
  const el = $('#view-saved');
  const filter = S.ui.savedFilter || 'all';
  setNav('Saved', selectMode ? `<button class="nav-btn" data-action="saved-select-all">All</button>` : '', S.saved.length ? `<button class="nav-btn ${selectMode ? 'bold' : ''}" data-action="saved-select">${selectMode ? 'Done' : 'Select'}</button>` : '');
  const items = S.saved
    .filter((e) => filter === 'all' || (filter === 'staple' ? e.staple : e.type === filter))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const staples = S.saved.filter((e) => e.staple);
  const rows = items
    .map((e) => {
      const inner = `<div class="row ${selectMode ? 'item-row' : 'tappable'}" ${selectMode ? '' : `data-action="saved-open" data-id="${esc(e.id)}"`}>${selectMode ? checkbox(selected.has(e.id), 'saved-toggle', e.id) : ''}<div class="row-main" ${selectMode ? `data-action="saved-toggle-row" data-id="${esc(e.id)}"` : ''}><div class="row-title">${esc(e.name)}${e.staple ? '<span class="tag">Staple</span>' : ''}</div><div class="row-sub">${esc(savedSubtitle(e))}</div></div>${selectMode ? '' : ICONS.chevron}</div>`;
      return selectMode ? inner : swipeWrap(e.id, inner);
    })
    .join('');
  el.innerHTML = `
    <h1 class="large-title">Saved</h1>
    <div class="seg" style="margin-bottom:4px">${[['all', 'All'], ['plan', 'Plans'], ['recipe', 'Recipes'], ['staple', 'Staples']].map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-action="saved-filter" data-f="${k}">${l}</button>`).join('')}</div>
    ${items.length ? `<div class="spacer"></div><div class="group ${selectMode ? 'indent-sep' : ''}" id="saved-rows">${rows}</div>` : `<div class="empty"><div class="et">${S.saved.length ? 'Nothing here' : 'Nothing saved yet'}</div>Tap Save on a meal plan or recipe to keep it here. Mark favorites as staples to rebuild your usual weekly list in one tap.</div>`}
    <div class="group-footer">${selectMode ? 'Pick meals to merge into one list. Duplicate ingredients are combined and quantities summed.' : 'Tap to retweak days, people, or calories. Tap Select to combine several into one list.'}</div>
    <div class="spacer"></div>
    ${selectMode ? `<button class="btn" data-action="saved-combine" ${selected.size ? '' : 'disabled'}>Make List from ${selected.size || ''} ${selected.size === 1 ? 'Meal' : 'Meals'}</button>` : staples.length ? `<button class="btn" data-action="saved-staples">Build Staples List (${staples.length})</button><div class="group-footer">Weekly reuse: builds a fresh list from every meal marked as a staple, at its saved settings.</div>` : ''}
  `;
  if (!selectMode) enableSwipe(el, async (id, wrap) => {
    S.saved = S.saved.filter((e) => e.id !== id);
    save();
    renderSaved();
  });
}

function openSavedEntry(id) {
  const e = S.saved.find((x) => x.id === id);
  if (!e) return;
  const t = clone(e.data);
  const isPlan = e.type === 'plan';
  const stepKeys = isPlan ? ['sv.days', 'sv.people'] : ['sv.people', 'sv.days'];
  stepHandlers['sv.days'] = (d, s) => { t.days = clampInt(t.days + d, 1, isPlan ? 31 : 14); s.textContent = t.days; };
  stepHandlers['sv.people'] = (d, s) => { t.people = clampInt(t.people + d, 1, 24); s.textContent = t.people; };
  const readKcal = (el) => {
    const v = numOrNull($('[name="svkcal"]', el).value);
    if (isPlan) t.kcal = v || t.kcal;
    else t.kcalTarget = v;
  };
  openSheet({
    title: e.name,
    full: true,
    left: { label: 'Close' },
    body: `
      <div class="group-footer" style="padding-top:8px">${esc(savedSubtitle(e))}</div>
      <div class="group-header">Retweak</div>
      <div class="group">
        ${!isPlan ? `<div class="row"><div class="seg inrow"><button class="${t.mode !== 'prep' ? 'on' : ''}" data-mode="once">One meal</button><button class="${t.mode === 'prep' ? 'on' : ''}" data-mode="prep">Meal prep</button></div></div>` : ''}
        <div class="row"><span class="row-main">Days</span>${stepper('sv.days', t.days, 1, isPlan ? 31 : 14)}</div>
        <div class="row"><span class="row-main">People</span>${stepper('sv.people', t.people, 1, 24)}</div>
        <div class="row field"><label>${isPlan ? 'Calories per day' : 'Calories per serving'}</label><input name="svkcal" type="number" inputmode="numeric" value="${esc(isPlan ? t.kcal : t.kcalTarget ?? '')}" placeholder="${isPlan ? '' : 'as written'}"></div>
      </div>
      <div class="spacer"></div>
      <div class="group actions">
        <button class="row tappable" data-a="list" style="width:100%"><span class="row-title">Make Grocery List</span></button>
        <button class="row tappable" data-a="add" style="width:100%"><span class="row-title">Add to Current List</span></button>
        <button class="row tappable" data-a="savechanges" style="width:100%"><span class="row-title">Save These Settings</span></button>
        <button class="row tappable" data-a="open" style="width:100%"><span class="row-title">Open in ${isPlan ? 'Plan' : 'Recipes'} to Edit Foods</span></button>
      </div>
      <div class="spacer"></div>
      <div class="group actions">
        <button class="row tappable" data-a="staple" style="width:100%"><span class="row-title">${e.staple ? 'Remove from Staples' : 'Mark as Weekly Staple'}</span></button>
        <button class="row tappable" data-a="dup" style="width:100%"><span class="row-title">Duplicate</span></button>
        <button class="row tappable" data-a="rename" style="width:100%"><span class="row-title">Rename</span></button>
        <button class="row tappable" data-a="delete" style="width:100%"><span class="row-title" style="color:var(--red)">Delete</span></button>
      </div>`,
    onMount(el, close) {
      el.addEventListener('click', async (ev) => {
        const m = ev.target.closest('[data-mode]');
        if (m) {
          t.mode = m.dataset.mode;
          $$('[data-mode]', el).forEach((b) => b.classList.toggle('on', b === m));
          return;
        }
        const a = ev.target.closest('[data-a]');
        if (!a) return;
        readKcal(el);
        const act = a.dataset.a;
        if (act === 'list' || act === 'add') {
          const needs = isPlan ? needsFromPlan(t, foods) : needsFromRecipe(t, foods);
          close();
          if (act === 'list') makeList(needs, e.name);
          else addNeedsToActive(needs);
          go('list');
          toast(act === 'list' ? 'List created' : 'Added to list');
        } else if (act === 'savechanges') {
          e.data = t; e.updatedAt = Date.now(); save(); close(); renderSaved(); toast('Saved');
        } else if (act === 'open') {
          close();
          if (isPlan) { S.plan = { ...clone(t), savedId: e.id, name: e.name }; save(); go('plan'); }
          else { S.recipe = { ...clone(t), savedId: e.id, name: e.name }; save(); go('recipes'); }
        } else if (act === 'staple') {
          e.staple = !e.staple; save(); close(); renderSaved(); toast(e.staple ? 'Marked as staple' : 'Removed from staples');
        } else if (act === 'dup') {
          S.saved.push({ ...clone(e), id: uid(), name: e.name + ' copy', updatedAt: Date.now(), data: { ...clone(t) } }); save(); close(); renderSaved();
        } else if (act === 'rename') {
          const n = await promptSheet('Rename', e.name);
          if (n) { e.name = n; e.data.name = n; save(); close(); renderSaved(); }
        } else if (act === 'delete') {
          if (await confirmSheet(`Delete "${e.name}"?`, 'This cannot be undone.')) {
            S.saved = S.saved.filter((x) => x.id !== e.id); save(); close(); renderSaved();
          }
        }
      });
    },
    onClose() { stepKeys.forEach((k) => delete stepHandlers[k]); },
  });
}

function clampInt(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

async function saveEntry(type, data) {
  const existing = data.savedId ? S.saved.find((x) => x.id === data.savedId) : null;
  let mode = 'new';
  if (existing) {
    const v = await actionSheet('Save', [{ label: `Update "${existing.name}"`, value: 'update' }, { label: 'Save as New', value: 'new' }]);
    if (!v) return;
    mode = v;
  }
  if (mode === 'update') {
    existing.data = clone({ ...data, savedId: null });
    existing.updatedAt = Date.now();
    existing.name = data.name;
    save();
    toast('Updated');
    return;
  }
  const name = await promptSheet('Save As', data.name);
  if (!name) return;
  const entry = { id: uid(), type, name, staple: false, updatedAt: Date.now(), data: clone({ ...data, name, savedId: null }) };
  S.saved.push(entry);
  data.savedId = entry.id;
  data.name = name;
  save();
  render();
  toast('Saved to library');
}

/* =========================================================
   MORE VIEW
   ========================================================= */
function renderMore() {
  const el = $('#view-more');
  setNav('More');
  const st = S.settings;
  const pantryRows = S.pantry
    .map((p) => swipeWrap(p.id, `<div class="row tappable" data-action="pantry-edit" data-id="${esc(p.id)}"><div class="row-main"><div class="row-title">${esc(p.name)}</div></div><span class="row-value">${p.grams == null ? 'Have plenty' : esc(fmtPortion(p.foodId ? foods.get(p.foodId) : null, p.grams, U()))}</span></div>`))
    .join('');
  const customRows = S.customFoods
    .map((f) => swipeWrap(f.id, `<div class="row tappable" data-action="custom-edit" data-id="${esc(f.id)}"><div class="row-main"><div class="row-title">${esc(f.name)}</div><div class="row-sub">${fmtNum(f.kcal)} kcal · ${fmtNum(f.p, 1)} P · ${fmtNum(f.c, 1)} C · ${fmtNum(f.f, 1)} F per 100 g ${esc(f.basis || '')}</div></div>${ICONS.chevron}</div>`))
    .join('');
  const priceCount = Object.values(S.prices).reduce((a, e) => a + Object.keys(e).length, 0);
  el.innerHTML = `
    ${a2hsBanner()}
    <h1 class="large-title">More</h1>

    <div class="group-header">Units</div>
    <div class="seg">${[['imperial', 'Imperial (lb, oz)'], ['metric', 'Metric (kg, g)']].map(([k, l]) => `<button class="${st.units === k ? 'on' : ''}" data-action="units" data-u="${k}">${l}</button>`).join('')}</div>

    <div class="group-header">Pantry</div>
    <div class="group" id="pantry-rows">${pantryRows}<button class="row tappable row-action" data-action="pantry-add" style="width:100%">${ICONS.plus}<span class="row-title">Add Pantry Item</span></button></div>
    <div class="spacer"></div>
    <div class="group"><div class="row"><span class="row-main">Subtract pantry from new lists</span>${switchInput('subtractPantry', st.subtractPantry, 'data-bind="settings.subtractPantry" data-type="bool"')}</div></div>
    <div class="group-footer">Things you already have. New lists buy only the difference. Use Recalculate in a list's menu to apply pantry changes to an existing list.</div>

    <div class="group-header">Prices</div>
    <div class="group">
      <button class="row tappable" data-action="stores-edit" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">My Stores</div><div class="row-sub">${esc(st.stores.join(', '))}</div></div>${ICONS.chevron}</button>
      <button class="row tappable" data-action="compare-open" style="width:100%;text-align:left"><span class="row-main">Compare Stores for Current List</span>${ICONS.chevron}</button>
      <button class="row tappable" data-action="protein-open" style="width:100%;text-align:left"><span class="row-main">Cheapest Protein</span>${ICONS.chevron}</button>
      <button class="row tappable" data-action="prices-clear" style="width:100%;text-align:left"><span class="row-main">Logged Prices</span><span class="row-value">${priceCount}</span></button>
    </div>
    <div class="group-footer">Of your local chains, only Kroger-owned stores (Kroger, Harris Teeter) have a free public price API, and it needs the proxy below. Everything else comes from prices you log.</div>

    <div class="group-header">Meal prep</div>
    <div class="group"><div class="row"><span class="row-main">Fridge days per cook</span>${stepper('settings.fridgeDays', st.fridgeDays, 2, 7)}</div></div>
    <div class="group-footer">USDA guidance is 3 to 4 days for cooked leftovers in the fridge.</div>

    <div class="group-header">Custom foods</div>
    <div class="group" id="custom-rows">${customRows}<button class="row tappable row-action" data-action="custom-add" style="width:100%">${ICONS.plus}<span class="row-title">Add Custom Food</span></button></div>

    <div class="group-header">USDA FoodData Central</div>
    <div class="group">
      <div class="row field"><label for="m-usda">API key</label><input id="m-usda" type="password" autocomplete="off" autocapitalize="off" data-bind="settings.usdaKey" data-type="str" value="${esc(st.usdaKey)}" placeholder="Paste key"></div>
      <button class="row tappable row-action" data-action="usda-test" style="width:100%"><span class="row-title">Test Key</span></button>
    </div>
    <div class="group-footer">Free from api.data.gov (link in the README). The key is stored only on this phone. The built-in food table works without it.</div>

    <div class="group-header">Optional proxy (Cloudflare Worker)</div>
    <div class="group">
      <div class="row field"><label for="m-proxy">Worker URL</label><input id="m-proxy" type="url" autocomplete="off" autocapitalize="off" data-bind="settings.proxyUrl" data-type="str" value="${esc(st.proxyUrl)}" placeholder="https://..."></div>
      <div class="row field"><label for="m-tok">App token</label><input id="m-tok" type="password" autocomplete="off" autocapitalize="off" data-bind="settings.proxyToken" data-type="str" value="${esc(st.proxyToken)}" placeholder="APP_TOKEN"></div>
      <button class="row tappable row-action" data-action="proxy-test" style="width:100%"><span class="row-title">Test Connection</span></button>
      <button class="row tappable" data-action="kroger-store" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">Kroger / Harris Teeter Store</div><div class="row-sub">${st.krogerLocationId ? esc(st.krogerLocationName) : 'Not set. Needs Kroger keys in the Worker.'}</div></div>${ICONS.chevron}</button>
    </div>
    <div class="group-footer">Enables recipe links, AI recipe parsing, and live Kroger prices. API keys live in the Worker, never in this app. Setup steps are in the README.</div>

    <div class="group-header">Backup</div>
    <div class="group actions">
      <button class="row tappable" data-action="export" style="width:100%"><span class="row-title">Export Backup (JSON)</span></button>
      <button class="row tappable" data-action="import" style="width:100%"><span class="row-title">Import Backup</span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" class="hidden">
    <div class="group-footer" id="persist-note">Everything is stored on this device only. Export a backup now and then.</div>

    <div class="group-header">About the numbers</div>
    <div class="group"><div class="row"><div class="row-main"><div class="row-sub" style="font-size:15px;color:var(--label2)">Nutrition comes from rounded USDA values per 100 g of food as you buy it. Package sizes are typical US sizes and vary by store. Cooked weights are estimates. Prices are never invented: they are what you logged or what Kroger's API returned.</div></div></div></div>

    <div class="spacer"></div>
    <div class="group"><button class="row tappable" data-action="reset" style="width:100%;justify-content:center"><span class="row-title" style="color:var(--red)">Erase All Data</span></button></div>
    <div class="group-footer center">Prep List 1.0</div>
  `;
  enableSwipe($('#pantry-rows', el), (id) => { S.pantry = S.pantry.filter((p) => p.id !== id); save(); renderMore(); });
  enableSwipe($('#custom-rows', el), async (id) => {
    const inUse = S.plan.items.some((i) => i.foodId === id);
    if (inUse && !(await confirmSheet('Delete this food?', 'It is used in your current plan and will be removed from it.'))) { renderMore(); return; }
    S.customFoods = S.customFoods.filter((f) => f.id !== id);
    S.plan.items = S.plan.items.filter((i) => i.foodId !== id);
    refreshFoods();
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
      refreshFoods();
      toast('Backup imported');
      render();
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  });
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      const n = $('#persist-note');
      if (n) n.textContent = `Everything is stored on this device only. Storage is ${p ? 'marked persistent' : 'not marked persistent yet (installing to the Home Screen helps)'}. Export a backup now and then.`;
    });
  }
}

function openPantryEditor(p) {
  const isNew = !p;
  const x = p || { id: uid(), key: null, foodId: null, name: '', grams: null };
  const all = [...foods.values()].sort((a, b) => foodName(a).localeCompare(foodName(b)));
  const metric = U() === 'metric';
  const food = x.foodId ? foods.get(x.foodId) : null;
  const amt = x.grams == null ? '' : food && food.unit && food.unit.show ? +(x.grams / food.unit.g).toFixed(1) : metric ? Math.round(x.grams) : +(x.grams / OZ).toFixed(1);
  const amtUnit = x.grams == null ? 'plenty' : food && food.unit && food.unit.show ? 'count' : metric ? 'g' : 'oz';
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
          if (!(a > 0)) { toast('Enter an amount, or choose Have plenty'); return false; }
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
      <div class="group-footer">"Plenty" means skip it entirely: it shows as already checked on new lists. Amounts are subtracted from what a plan needs.</div>`,
  });
}

function openProteinValue() {
  const rows = proteinValue(foods, S.prices);
  openSheet({
    title: 'Cheapest Protein',
    left: { label: 'Close' },
    body: `
      <div class="group-header">Cost per 30 g of protein</div>
      <div class="group">${rows.length ? rows.slice(0, 25).map((r, i) => `<div class="row"><div class="row-main"><div class="row-title">${esc(foodName(r.food))}${i === 0 ? '<span class="tag">Best</span>' : ''}</div><div class="row-sub">${esc(r.store)} · ${fmtNum(r.food.p, 1)} g protein per 100 g · logged ${new Date(r.date).toLocaleDateString()}</div></div><span class="row-value">${fmtMoney(r.per30)}</span></div>`).join('') : `<div class="row"><span class="row-sub">No usable prices yet. Log a price per lb, or per package with a size (like 3 lb), for protein foods on your list.</span></div>`}</div>
      <div class="group-footer">Calculated only from prices you logged, using the food's nutrition as purchased. Log more stores to compare.</div>`,
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
    $('.sheet-body', sheet.el).innerHTML = `<div class="spacer"></div><div class="group">${locs.length ? locs.map((l, i) => `<button class="row tappable" data-loc="${i}" style="width:100%;text-align:left"><div class="row-main"><div class="row-title">${esc(l.name)}</div><div class="row-sub">${esc(l.chainLabel)} · ${esc(l.address)}</div></div></button>`).join('') : '<div class="row"><span class="row-sub">No Kroger-family stores found near that ZIP.</span></div>'}</div><div class="group-footer">Kroger's API covers Kroger-owned chains, including Harris Teeter. Walmart, Aldi, Food Lion, and Costco are not available.</div>`;
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
    try {
      await navigator.share({ files: [file], title: 'Prep List backup' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* =========================================================
   Actions (event delegation)
   ========================================================= */
const actions = {
  'a2hs-dismiss': () => { S.settings.a2hsDismissed = true; save(); render(); },

  // Plan
  'plan-new': async () => {
    if (!(await confirmSheet('Start a new plan?', 'Your current draft will be replaced. Saved plans are not affected.', 'New Plan', false))) return;
    S.plan = defaultPlan();
    S.plan.items = [];
    save();
    renderPlan();
  },
  'plan-save': () => saveEntry('plan', S.plan),
  'plan-rename': async () => { const n = await promptSheet('Plan Name', S.plan.name); if (n) { S.plan.name = n; save(); renderPlan(); } },
  'plan-add-food': () => openAddFood(),
  'plan-food': (el) => openPlanFood(el.dataset.id),
  'plan-defaults': () => {
    for (const it of S.plan.items) { const f = foods.get(it.foodId); it.share = f ? ROLE_SHARE[f.role] ?? 10 : 10; }
    save(); renderPlan(); toast('Default split restored');
  },
  'plan-fit': () => {
    const r = fitShares(S.plan, foods);
    if (!r) { toast('Add a macro target and at least 2 foods'); return; }
    S.plan.items.forEach((it, i) => (it.share = r.shares[i]));
    save();
    renderPlan();
    const P = S.plan;
    const parts = [];
    if (+P.protein > 0) parts.push(`protein ${fmtNum(r.achieved.p)}/${fmtNum(P.protein)} g`);
    if (+P.carbs > 0) parts.push(`carbs ${fmtNum(r.achieved.c)}/${fmtNum(P.carbs)} g`);
    if (+P.fat > 0) parts.push(`fat ${fmtNum(r.achieved.f)}/${fmtNum(P.fat)} g`);
    toast('Best fit: ' + parts.join(', '), 3500);
  },
  'plan-make-list': () => {
    const needs = needsFromPlan(S.plan, foods);
    if (!needs.length) { toast('Add foods first'); return; }
    makeList(needs, S.plan.name);
    go('list');
    toast('Grocery list created');
  },
  'plan-add-to-list': () => {
    const needs = needsFromPlan(S.plan, foods);
    if (!needs.length) { toast('Add foods first'); return; }
    addNeedsToActive(needs);
    go('list');
    toast('Added to list');
  },

  // List
  'list-switch': () => openListSwitcher(),
  'list-new-empty': () => newEmptyList(),
  'list-menu': () => listMenu(),
  'list-add-item': () => { if (!activeList()) { newEmptyList(); return; } openItemEditor(null, true); },
  'list-rename': () => { const l = activeList(); if (l) renameList(l); },
  'list-price-store': () => choosePriceStore(),
  'sec-toggle': (el) => {
    const l = activeList();
    const sec = el.dataset.sec;
    l.collapsed[sec] = !l.collapsed[sec];
    save();
    el.classList.toggle('collapsed', l.collapsed[sec]);
    el.setAttribute('aria-expanded', !l.collapsed[sec]);
    $(`[data-secgroup="${CSS.escape(sec)}"]`).classList.toggle('hidden', l.collapsed[sec]);
  },
  'item-check': (el) => toggleItem(el.dataset.id, el),
  'item-edit': (el) => {
    if (el.closest('.swipe')?.dataset.justSwiped || el.closest('.swipe.open')) return;
    const it = activeList().items.find((i) => i.id === el.dataset.id);
    if (it) openItemEditor(it);
  },

  // Recipes
  'recipe-fetch': async (el) => {
    const inp = $('#r-url');
    let url = inp.value.trim();
    if (!url) { toast('Paste a link first'); inp.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    el.disabled = true;
    el.innerHTML = '<span class="spinner"></span>';
    try {
      const { html } = await fetchRecipePage(url);
      const parsed = extractRecipeFromHtml(html);
      if (!parsed || !parsed.ingredients.length) throw new Error('Could not find recipe data on that page. Paste the ingredient list as text instead.');
      loadParsedRecipe(parsed, url);
    } catch (err) {
      toast(err.message, 5000);
      el.disabled = false;
      el.textContent = 'Get';
    }
  },
  'recipe-parse': () => {
    const text = $('#r-text').value;
    if (!text.trim()) { toast('Paste some recipe text first'); return; }
    const parsed = parseRecipeText(text);
    if (!parsed.ingredients.length) { toast('No ingredient lines found. Try Parse with AI, or add ingredients by hand.', 4000); return; }
    loadParsedRecipe(parsed);
  },
  'recipe-ai': async (el) => {
    const text = $('#r-text').value;
    if (!text.trim()) { toast('Paste text or describe a dish first'); return; }
    el.disabled = true;
    const label = el.textContent;
    el.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await aiParseRecipe(text);
      const parsed = {
        name: r.name || '',
        servings: r.servings || null,
        steps: r.steps || [],
        ingredients: (r.ingredients || [])
          .map((i) => {
            const p = parseIngredientLine(`${i.qty ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.trim());
            if (p && i.note) p.note = [p.note, i.note].filter(Boolean).join('; ');
            return p;
          })
          .filter(Boolean),
      };
      if (!parsed.ingredients.length) throw new Error('The AI did not return any ingredients.');
      loadParsedRecipe(parsed);
    } catch (err) {
      toast(err.message, 5000);
      el.disabled = false;
      el.textContent = label;
    }
  },
  'recipe-blank': () => { S.recipe = recipeFromParsed({ name: 'New recipe', servings: 4, ingredients: [] }, foods, uid); save(); renderRecipes(); openIngredientEditor(null, true); },
  'recipe-close': () => { S.recipe = null; save(); window.scrollTo(0, 0); renderRecipes(); watchLargeTitle($('#view-recipes')); },
  'recipe-save': () => saveEntry('recipe', S.recipe),
  'recipe-rename': async () => { const n = await promptSheet('Recipe Name', S.recipe.name); if (n) { S.recipe.name = n; save(); renderRecipes(); } },
  'recipe-mode': (el) => { S.recipe.mode = el.dataset.mode; save(); renderRecipes(); },
  'recipe-fit-plan': (el) => { S.recipe.kcalTarget = +el.dataset.kcal; save(); renderRecipes(); toast('Scaled to your plan'); },
  'ing-edit': (el) => {
    if (el.closest('.swipe')?.dataset.justSwiped || el.closest('.swipe.open')) return;
    openIngredientEditor(S.recipe.ingredients.find((i) => i.id === el.dataset.id));
  },
  'ing-add': () => openIngredientEditor(null, true),
  'recipe-make-list': () => {
    const needs = needsFromRecipe(S.recipe, foods);
    if (!needs.length) { toast('Add ingredients first'); return; }
    makeList(needs, S.recipe.name);
    go('list');
    toast('Grocery list created');
  },
  'recipe-add-to-list': () => {
    const needs = needsFromRecipe(S.recipe, foods);
    if (!needs.length) { toast('Add ingredients first'); return; }
    addNeedsToActive(needs);
    go('list');
    toast('Added to list');
  },

  // Saved
  'saved-filter': (el) => { S.ui.savedFilter = el.dataset.f; save(); renderSaved(); },
  'saved-open': (el) => {
    if (el.closest('.swipe')?.dataset.justSwiped || el.closest('.swipe.open')) return;
    openSavedEntry(el.dataset.id);
  },
  'saved-select': () => { selectMode = !selectMode; selected.clear(); renderSaved(); },
  'saved-select-all': () => { S.saved.forEach((e) => selected.add(e.id)); renderSaved(); },
  'saved-toggle': (el) => { const id = el.dataset.id; selected.has(id) ? selected.delete(id) : selected.add(id); renderSaved(); },
  'saved-toggle-row': (el) => actions['saved-toggle'](el),
  'saved-combine': () => {
    const entries = S.saved.filter((e) => selected.has(e.id));
    if (!entries.length) return;
    const needs = entries.flatMap(needsForEntry);
    makeList(needs, entries.length === 1 ? entries[0].name : 'Combined list');
    selectMode = false;
    selected.clear();
    go('list');
    toast(`Merged ${entries.length} ${entries.length === 1 ? 'meal' : 'meals'}`);
  },
  'saved-staples': () => {
    const entries = S.saved.filter((e) => e.staple);
    makeList(entries.flatMap(needsForEntry), 'Weekly staples');
    go('list');
    toast('Staples list created');
  },

  // More
  units: (el) => {
    S.settings.units = el.dataset.u;
    for (const l of S.lists) if (l.needs && l.needs.length) rebuildList(l);
    save();
    renderMore();
    toast(el.dataset.u === 'metric' ? 'Metric units' : 'Imperial units');
  },
  'pantry-add': () => openPantryEditor(null),
  'pantry-edit': (el) => {
    if (el.closest('.swipe')?.dataset.justSwiped || el.closest('.swipe.open')) return;
    openPantryEditor(S.pantry.find((p) => p.id === el.dataset.id));
  },
  'custom-add': () => openFoodForm({}),
  'custom-edit': (el) => {
    if (el.closest('.swipe')?.dataset.justSwiped || el.closest('.swipe.open')) return;
    const f = S.customFoods.find((x) => x.id === el.dataset.id);
    if (f) openFoodForm(f);
  },
  'stores-edit': async () => {
    const v = await promptSheet('Stores (comma separated)', S.settings.stores.join(', '));
    if (v == null) return;
    const list = v.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) { toast('Keep at least one store'); return; }
    S.settings.stores = [...new Set(list)];
    if (S.settings.priceStore && !list.includes(S.settings.priceStore)) S.settings.priceStore = '';
    save();
    renderMore();
  },
  'compare-open': () => { const l = activeList(); if (!l) { toast('No list yet'); return; } openCompare(l); },
  'protein-open': () => openProteinValue(),
  'prices-clear': async () => {
    if (!Object.keys(S.prices).length) { toast('No prices logged yet'); return; }
    if (await confirmSheet('Clear all logged prices?', 'This removes every price you have entered or fetched.', 'Clear Prices')) {
      S.prices = {}; save(); renderMore(); toast('Prices cleared');
    }
  },
  'usda-test': async (el) => {
    const inp = $('#m-usda');
    S.settings.usdaKey = inp.value.trim();
    save();
    try {
      const r = await usdaSearch('broccoli raw');
      toast(`USDA key works (${r.length} results)`);
    } catch (err) { toast(err.message, 4000); }
  },
  'proxy-test': async () => {
    S.settings.proxyUrl = $('#m-proxy').value.trim();
    S.settings.proxyToken = $('#m-tok').value.trim();
    save();
    try {
      const h = await proxyHealth();
      const f = h.features || {};
      toast(`Connected. Recipe links ${f.fetch ? 'on' : 'off'}, AI ${f.ai ? 'on' : 'off'}, Kroger ${f.kroger ? 'on' : 'off'}.`, 4500);
    } catch (err) { toast(err.message, 4500); }
  },
  'kroger-store': () => openKrogerStore(),
  export: () => doExport(),
  import: () => $('#import-file').click(),
  reset: async () => {
    if (!(await confirmSheet('Erase all data?', 'Plans, lists, saved meals, prices, and settings will be deleted from this device. Export a backup first if you might want them.', 'Erase Everything'))) return;
    resetAll();
    refreshFoods();
    go('plan');
  },
};

/* =========================================================
   Wiring
   ========================================================= */
function setPath(path, value) {
  const [root, key] = path.split('.');
  const obj = root === 'plan' ? S.plan : root === 'recipe' ? S.recipe : root === 'settings' ? S.settings : null;
  if (obj) obj[key] = value;
}
function getPath(path) {
  const [root, key] = path.split('.');
  const obj = root === 'plan' ? S.plan : root === 'recipe' ? S.recipe : root === 'settings' ? S.settings : null;
  return obj ? obj[key] : undefined;
}

// Steppers bound to state paths.
const STEP_LIMITS = { 'plan.days': [1, 31], 'plan.people': [1, 12], 'plan.mealsPerDay': [1, 8], 'recipe.baseServings': [1, 48], 'recipe.people': [1, 24], 'recipe.days': [1, 14], 'settings.fridgeDays': [2, 7] };
for (const [key, [lo, hi]] of Object.entries(STEP_LIMITS)) {
  stepHandlers[key] = (d) => {
    setPath(key, clampInt((+getPath(key) || lo) + d, lo, hi));
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
  if (t.dataset.bind === 'plan.kcal' && v == null) v = S.plan.kcal || 2000;
  setPath(t.dataset.bind, v);
  save();
  if (t.dataset.bind.startsWith('plan.')) renderPlan();
  else if (t.dataset.bind.startsWith('recipe.')) renderRecipes();
}

function onInput(e) {
  const t = e.target;
  if (t.matches('input[type="range"][data-share]')) {
    const it = S.plan.items.find((i) => i.foodId === t.dataset.share);
    if (it) it.share = +t.value;
    t.style.setProperty('--pct', t.value + '%');
    save();
    updatePlanLive();
  }
}

function init() {
  for (const v of $$('.view')) {
    v.addEventListener('click', onClick);
    v.addEventListener('change', onChange);
    v.addEventListener('input', onInput);
  }
  $('#nav').addEventListener('click', onClick);
  document.getElementById('sheet-root').addEventListener('click', (e) => {
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) onClick(e);
  });
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (S.ui.tab === t.dataset.tab) window.scrollTo({ top: 0, behavior: 'smooth' });
    else go(t.dataset.tab);
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopSheet(); });
  // Enter in the URL field fetches.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'r-url') { e.preventDefault(); $('[data-action="recipe-fetch"]')?.click(); }
  });
  render();
  requestPersist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
  }
}

init();

// Exposed for debugging in the console only.
window.__preplist = { S, foods: () => foods };
