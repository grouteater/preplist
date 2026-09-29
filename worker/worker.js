// Prep List proxy: a single Cloudflare Worker (free plan is enough).
//
// What it does, and why it has to live on a server:
//   GET  /health                 Shows which features are configured.
//   GET  /fetch?url=...          Downloads a recipe page so the app can read its
//                                schema.org Recipe data (browsers block this with CORS).
//   POST /parse  {text}          Sends messy recipe text to the Anthropic API and returns
//                                clean JSON. Your API key stays here, never in the app.
//   POST /receipt {image,...}    Reads a receipt photo (Claude vision) and matches lines to
//                                items on your list so the app can log what you paid.
//   GET  /kroger/locations?zip=  Finds Kroger-family stores (Kroger, Harris Teeter, ...).
//   GET  /kroger/products?term=&locationId=
//                                Live shelf prices for one store (needs a client secret).
//
// Secrets and variables (set in the Cloudflare dashboard, Settings > Variables and Secrets):
//   APP_TOKEN            required. Any long random string. Paste the same value in the app.
//   ALLOWED_ORIGIN       recommended. Your site, e.g. https://yourname.github.io
//   ANTHROPIC_API_KEY    optional. Enables /parse and /receipt.
//   ANTHROPIC_MODEL      optional. Defaults to claude-haiku-4-5-20251001.
//   KROGER_CLIENT_ID     optional. Enables /kroger/*.
//   KROGER_CLIENT_SECRET optional.

const MAX_PAGE_BYTES = 3_000_000;
let krogerToken = null; // { value, expires } cached per Worker instance

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (!env.APP_TOKEN) return json({ error: 'APP_TOKEN is not set on the Worker.' }, 500, cors);
      if (request.headers.get('X-App-Token') !== env.APP_TOKEN) return json({ error: 'Unauthorized' }, 401, cors);

      if (url.pathname === '/health') {
        return json({
          ok: true,
          features: {
            fetch: true,
            ai: !!env.ANTHROPIC_API_KEY,
            kroger: !!(env.KROGER_CLIENT_ID && env.KROGER_CLIENT_SECRET),
          },
        }, 200, cors);
      }
      if (url.pathname === '/fetch' && request.method === 'GET') return await fetchPage(url, cors);
      if (url.pathname === '/parse' && request.method === 'POST') return await parseRecipe(request, env, cors);
      if (url.pathname === '/receipt' && request.method === 'POST') return await readReceipt(request, env, cors);
      if (url.pathname === '/kroger/locations') return await krogerLocations(url, env, cors);
      if (url.pathname === '/kroger/products') return await krogerProducts(url, env, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Proxy error' }, 502, cors);
    }
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim());
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/* ---------- Recipe page fetch ---------- */
async function fetchPage(url, cors) {
  const target = url.searchParams.get('url');
  let t;
  try {
    t = new URL(target);
  } catch (e) {
    return json({ error: 'That is not a valid link.' }, 400, cors);
  }
  if (!/^https?:$/.test(t.protocol)) return json({ error: 'Only http and https links are allowed.' }, 400, cors);
  const res = await fetch(t.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!res.ok) return json({ error: `The recipe site answered with status ${res.status}. Some sites block automated requests; paste the text instead.` }, 502, cors);
  const type = res.headers.get('Content-Type') || '';
  if (!/text\/html|application\/xhtml|json/.test(type)) return json({ error: 'That link is not a web page.' }, 415, cors);
  const text = await res.text();
  if (text.length > MAX_PAGE_BYTES) return json({ error: 'That page is too large.' }, 413, cors);
  return new Response(text, { status: 200, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ---------- Anthropic recipe parsing ---------- */
const PARSE_PROMPT = `You turn recipe text into JSON for a grocery app. The input may be a full recipe, a messy paste, or just a short description of a dish.

Return ONLY a JSON object, no prose, with this shape:
{"name": string, "servings": number, "ingredients": [{"qty": number|null, "unit": string, "name": string, "note": string}], "steps": [string]}

Rules:
- unit must be one of: "", g, kg, oz, lb, cup, tbsp, tsp, ml, l, floz, can, clove, slice, stick, pinch, bunch, head, pkg, piece. Use "" for counted items (3 eggs).
- qty is a decimal number (1.5, not "1 1/2"). Use null only for "to taste" items.
- name is the plain grocery item ("chicken thighs", not "chicken thighs, cut into cubes"). Put prep words in note.
- If the input is only a description, write a sensible standard recipe for it with realistic quantities, and set servings to what the user asked for or 4.
- Do not invent nutrition or prices.`;

async function parseRecipe(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI parsing is not set up. Add ANTHROPIC_API_KEY to the Worker.' }, 501, cors);
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || '').slice(0, 20000);
  if (!text.trim()) return json({ error: 'No text sent.' }, 400, cors);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: PARSE_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return json({ error: `Anthropic API error ${res.status}: ${detail.slice(0, 200)}` }, 502, cors);
  }
  const data = await res.json();
  const out = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start < 0 || end < start) return json({ error: 'The AI reply was not JSON. Try again or paste cleaner text.' }, 502, cors);
  try {
    return json(JSON.parse(out.slice(start, end + 1)), 200, cors);
  } catch (e) {
    return json({ error: 'The AI reply could not be read. Try again.' }, 502, cors);
  }
}

/* ---------- Receipt reading ---------- */
const RECEIPT_PROMPT = `You read grocery receipt photos for a shopping list app.

Return ONLY a JSON object, no prose:
{"store": string, "lines": [{"text": string, "price": number, "item": string|null}]}

Rules:
- One entry per purchased product line. Skip tax, subtotal, total, payment, savings summary, and bag fee lines.
- price is the final amount paid for that line after any per-line discount, as a number.
- text is the receipt's own abbreviation, e.g. "HT CHKN THGH BNLS".
- item is the exact name from the provided shopping list that this line is, or null if none match. Never invent a list item.
- store is the store name printed on the receipt, or "".
- If the photo is not a receipt or is unreadable, return {"store": "", "lines": []}.`;

async function readReceipt(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'Receipt reading needs ANTHROPIC_API_KEY on the Worker.' }, 501, cors);
  const body = await request.json().catch(() => ({}));
  const image = String(body.image || '');
  if (!image || image.length > 7_000_000) return json({ error: 'Missing or oversized image.' }, 400, cors);
  const items = Array.isArray(body.items) ? body.items.slice(0, 150).map(String) : [];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.ANTHROPIC_VISION_MODEL || env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: RECEIPT_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: body.mediaType || 'image/jpeg', data: image } },
          { type: 'text', text: 'Shopping list items:\n' + items.map((i) => '- ' + i).join('\n') },
        ],
      }],
    }),
  });
  if (!res.ok) return json({ error: `Anthropic API error ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502, cors);
  const data = await res.json();
  const out = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const a = out.indexOf('{');
  const b = out.lastIndexOf('}');
  try {
    const parsed = JSON.parse(out.slice(a, b + 1));
    parsed.lines = (parsed.lines || []).filter((l) => typeof l.price === 'number' && l.price > 0).map((l) => ({ ...l, item: items.includes(l.item) ? l.item : null }));
    return json(parsed, 200, cors);
  } catch (e) {
    return json({ error: 'Could not read that receipt. Try a flatter, well lit photo.' }, 502, cors);
  }
}

/* ---------- Kroger API ---------- */
const CHAIN_LABELS = { KROGER: 'Kroger', HART: 'Harris Teeter', HARRISTEETER: 'Harris Teeter', RALPHS: 'Ralphs', FRED: 'Fred Meyer', KINGSOOPERS: 'King Soopers', SMITHS: "Smith's", FRYS: "Fry's", QFC: 'QFC', DILLONS: 'Dillons', MARIANOS: "Mariano's", PICKNSAVE: "Pick 'n Save", FOOD4LESS: 'Food 4 Less' };

async function getKrogerToken(env) {
  if (!env.KROGER_CLIENT_ID || !env.KROGER_CLIENT_SECRET) throw new Error('Kroger is not set up. Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to the Worker.');
  if (krogerToken && krogerToken.expires > Date.now() + 60_000) return krogerToken.value;
  const res = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`),
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  if (!res.ok) throw new Error(`Kroger sign-in failed (${res.status}). Check the client ID and secret.`);
  const t = await res.json();
  krogerToken = { value: t.access_token, expires: Date.now() + (t.expires_in || 1800) * 1000 };
  return krogerToken.value;
}

async function krogerGet(path, env) {
  const token = await getKrogerToken(env);
  const res = await fetch('https://api.kroger.com' + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Kroger API error ${res.status}.`);
  return res.json();
}

async function krogerLocations(url, env, cors) {
  const zip = (url.searchParams.get('zip') || '').replace(/[^0-9]/g, '').slice(0, 5);
  if (zip.length !== 5) return json({ error: 'Enter a 5 digit ZIP code.' }, 400, cors);
  const data = await krogerGet(`/v1/locations?filter.zipCode.near=${zip}&filter.radiusInMiles=15&filter.limit=15`, env);
  const locations = (data.data || []).map((l) => ({
    locationId: l.locationId,
    name: l.name,
    chain: l.chain,
    chainLabel: CHAIN_LABELS[String(l.chain || '').toUpperCase()] || l.chain,
    address: [l.address && l.address.addressLine1, l.address && l.address.city].filter(Boolean).join(', '),
  }));
  return json({ locations }, 200, cors);
}

async function krogerProducts(url, env, cors) {
  const term = (url.searchParams.get('term') || '').slice(0, 60);
  const locationId = (url.searchParams.get('locationId') || '').slice(0, 20);
  if (!term || !locationId) return json({ error: 'term and locationId are required.' }, 400, cors);
  const data = await krogerGet(`/v1/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=12`, env);
  const items = (data.data || []).map((p) => {
    const it = (p.items || [])[0] || {};
    const price = it.price || {};
    return {
      productId: p.productId,
      description: p.description,
      brand: p.brand,
      size: it.size || '',
      price: price.regular > 0 ? price.regular : null,
      promo: price.promo > 0 ? price.promo : null,
    };
  });
  return json({ items }, 200, cors);
}
