// Optional network features. Everything here is off until you add a key or
// a proxy URL in More. The core app never needs these.
import { state } from './store.js';

/* ---------------- USDA FoodData Central (direct, CORS enabled) ---------------- */
const FDC = 'https://api.nal.usda.gov/fdc/v1';

function nutrient(list, numbers, names) {
  for (const n of list || []) {
    const num = String(n.nutrientNumber ?? n.nutrient?.number ?? '');
    const name = String(n.nutrientName ?? n.nutrient?.name ?? '').toLowerCase();
    const unit = String(n.unitName ?? n.nutrient?.unitName ?? '').toLowerCase();
    if (numbers.includes(num) || names.some((x) => name.startsWith(x))) {
      if (names[0] === 'energy' && unit && unit !== 'kcal') continue;
      const v = n.value ?? n.amount;
      if (v != null) return +v;
    }
  }
  return null;
}

/** Search Foundation and SR Legacy foods. Values come back per 100 g. */
export async function usdaSearch(query) {
  const key = state.settings.usdaKey.trim();
  if (!key) throw new Error('Add your free USDA API key in More first.');
  const url = `${FDC}/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&dataType=${encodeURIComponent('Foundation,SR Legacy')}&pageSize=20`;
  const res = await fetch(url);
  if (res.status === 403 || res.status === 401) throw new Error('USDA rejected the API key. Check it in More.');
  if (res.status === 429) throw new Error('USDA rate limit reached. Try again in a bit.');
  if (!res.ok) throw new Error(`USDA search failed (${res.status}).`);
  const data = await res.json();
  return (data.foods || [])
    .map((f) => {
      const kcal = nutrient(f.foodNutrients, ['208', '957', '958'], ['energy']);
      return {
        fdcId: f.fdcId,
        description: f.description,
        dataType: f.dataType,
        kcal,
        p: nutrient(f.foodNutrients, ['203'], ['protein']) ?? 0,
        c: nutrient(f.foodNutrients, ['205'], ['carbohydrate, by difference']) ?? 0,
        f: nutrient(f.foodNutrients, ['204'], ['total lipid']) ?? 0,
      };
    })
    .filter((f) => f.kcal != null && f.kcal > 0);
}

/* ---------------- Optional Cloudflare Worker proxy ---------------- */
export function proxyConfigured() {
  return !!state.settings.proxyUrl.trim();
}
function proxyBase() {
  return state.settings.proxyUrl.trim().replace(/\/+$/, '');
}
async function proxyFetch(path, init = {}) {
  if (!proxyConfigured()) throw new Error('No proxy set up. See More > Optional Proxy.');
  const headers = { ...(init.headers || {}) };
  if (state.settings.proxyToken) headers['X-App-Token'] = state.settings.proxyToken;
  let res;
  try {
    res = await fetch(proxyBase() + path, { ...init, headers });
  } catch (e) {
    throw new Error('Could not reach your proxy. Check the URL and that the Worker is deployed.');
  }
  if (res.status === 401) throw new Error('Proxy refused the app token. Check it matches APP_TOKEN in the Worker.');
  if (!res.ok) {
    let msg = `Proxy error ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

export async function proxyHealth() {
  const res = await proxyFetch('/health');
  return res.json();
}

/**
 * Fetch a recipe page. Tries the browser first (works only for the rare site
 * that allows cross-origin reads), then the proxy.
 * Returns { html, via } or throws with an honest message.
 */
export async function fetchRecipePage(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return { html: await res.text(), via: 'direct' };
  } catch (e) { /* expected: CORS block */ }
  if (!proxyConfigured()) {
    const err = new Error('This site does not allow apps to read its pages directly (a browser CORS block). Paste the recipe text below instead, or set up the free proxy in More.');
    err.cors = true;
    throw err;
  }
  const res = await proxyFetch('/fetch?url=' + encodeURIComponent(url));
  return { html: await res.text(), via: 'proxy' };
}

export async function aiParseRecipe(text) {
  const res = await proxyFetch('/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function krogerLocations(zip) {
  const res = await proxyFetch('/kroger/locations?zip=' + encodeURIComponent(zip));
  return res.json();
}

export async function krogerProducts(term, locationId) {
  const res = await proxyFetch(`/kroger/products?term=${encodeURIComponent(term)}&locationId=${encodeURIComponent(locationId)}`);
  return res.json();
}
