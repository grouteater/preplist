# Prep List

A grocery list and meal prep planner for iPhone, styled like Apple Notes in dark mode. It is a static web app (plain HTML, CSS, and JavaScript, no framework, no build step) that runs on GitHub Pages and installs to your Home Screen. Everything is stored on your phone. No account.

---

## 1. Feasibility summary

### Works on GitHub Pages with no external services (Tier 1, built)

| Feature | Notes |
|---|---|
| Meal plan builder | Pick foods, days, people, meals per day, calorie target. Sliders set each food's share of calories. Optional protein, carb, and fat targets with a **Fit to Macros** button that rebalances shares while holding calories fixed. |
| Nutrition data | Built-in table of about 50 common foods, per 100 g **as purchased** (raw meat, dry rice, dry pasta) with a cooked-yield factor, so the app tells you what to buy and roughly what it weighs cooked. |
| Grocery list | Notes-style checklist, grouped by store section, collapsible. Checked items turn gray, strike through, and animate to the bottom. Swipe left to delete, tap to edit, manual items. |
| Package rounding | Rounds up to real package sizes (can mix two sizes, like "5 lb bag + 2 lb bag"), shows leftover amount and "covers N days at 2,200 kcal/day". Loose produce rounds to 0.25 lb. |
| Recipes | Local parser for pasted ingredient lists (fractions, ranges, units, "1 (15 oz) can"). Portion for N people as one meal or a meal prep batch for X days, optional calories per serving, or one tap to match your plan's calories per meal. |
| Saved library | Save plans and recipes, retweak days, people, or calories, and combine several into one merged list (duplicates summed). Mark staples for a one-tap weekly list. |
| Pricing (honest version) | Log the price you paid per item per store (per package, per lb, per kg, or each). The app remembers the last price per store and builds list totals, a store comparison, and a "cheapest protein" ranking from your own data only. |
| Extras | Pantry subtraction, per-day macro summary, per-meal portions, prep-day schedule (based on fridge life), imperial and metric toggle, text export for Messages or Notes, JSON backup and restore, Add to Home Screen prompt, offline via service worker. |

### Needs the optional proxy (Tier 2, built, off by default)

| Feature | Why it needs a server |
|---|---|
| Import from a recipe link | Recipe sites do not send CORS headers, so Safari blocks a page on your site from reading them. The Worker fetches the page, then the app reads its schema.org Recipe JSON-LD. The app always tries a direct fetch first, and pasting text always works as a fallback. |
| Parse with AI | Uses the Anthropic API for messy text or a plain description ("chicken burrito bowls for 4"). A key in client code would be public, so it only runs through the Worker. Default model is Claude Haiku 4.5, which is cheap for this. |
| Live Kroger and Harris Teeter prices | Kroger's developer API is free and returns store-specific prices, including Harris Teeter (a Kroger banner). It uses a client secret, so it must go through the Worker. |

USDA FoodData Central search does **not** need the proxy. It is called directly from the browser with your free key, which is stored only on your phone.

### Not feasible, stated plainly

- **Walmart**: product and price APIs require an approved partner or affiliate account and signed requests. Not realistic for a personal app.
- **Instacart**: its Developer Platform creates shoppable list links, not a price feed, and keys come through an Instacart representative.
- **Aldi, Food Lion, Costco**: no public pricing APIs.
- **Open Prices (Open Food Facts)**: real and open, but crowdsourced and barcode based, with thin US coverage. It would show mostly empty results for Charlotte.
- **Scraping store websites**: against their terms and breaks constantly. Not built.

So the app never shows invented prices. Prices come from you, or from Kroger's API for the store you pick.

### What I changed from the brief, and why

1. **Nutrition is stored "as purchased" with a cooked-yield factor** instead of cooked values. The shopping list is what you act on, so the math runs in purchase weights. You can still enter cooked values for a custom food and the app converts them.
2. **localStorage instead of IndexedDB.** Your data is small (well under 1 MB), the code stays simple to edit, and the app asks the browser for persistent storage. The real protection against iOS eviction is installing to the Home Screen plus the JSON backup.
3. **Local recipe parser first, AI second.** Normal ingredient lists parse on the phone for free. AI is a separate button for messy text and descriptions. This keeps the app fully usable with no proxy and keeps API cost near zero.
4. **Lists remember how they were built.** Each generated list stores its ingredient needs, so you can add another meal to it, switch units, or apply pantry changes with Recalculate, and your checkmarks and edits carry over.

### Tier 3: ideas considered but not built

- Barcode scanning with the camera (needs a product database lookup per scan; USDA Branded search could back it later).
- Receipt photo OCR to log prices automatically.
- Weekly flyer or sale data (only available through paid scrapers or partner APIs).
- Cloud sync between devices (needs an account and a database; the JSON backup covers moving data for now).
- Instacart "shop this list" link (needs an Instacart-issued key).
- Automatic nutrition for every recipe ingredient via USDA (tempting, but name matching is unreliable; the app shows a clear "no nutrition match" instead and lets you pick).
- Calendar export of prep days (easy to add later as an .ics file).

---

## 2. Files

```
index.html            App shell and tab bar
manifest.json         PWA manifest
sw.js                 Service worker (offline cache)
css/app.css           All styling (Apple Notes dark look)
js/app.js             Views and actions
js/engine.js          Math: plan scaling, macro fit, packages, list merge, recipe parsing, prices
js/foods.js           Built-in food table (edit here to add foods for everyone)
js/store.js           Local storage, backup and restore
js/ui.js              Sheets, swipe to delete, checklist animation, collapsing title
js/api.js             USDA search and proxy calls
icons/                App icons (apple-touch-icon, 192, 512, maskable)
worker/worker.js      Optional Cloudflare Worker (not deployed to GitHub Pages)
```

---

## 3. Put it on GitHub Pages

1. Sign in at github.com and click **New repository**. Name it something like `preplist`. Choose **Public** (GitHub Pages on free accounts needs a public repo). Click **Create repository**.
2. On the new repo page, click **uploading an existing file**. Drag in everything from this folder (index.html, manifest.json, sw.js, and the css, js, icons, and worker folders). Click **Commit changes**.
3. Go to **Settings** then **Pages** (left sidebar).
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main`, folder `/ (root)`. Click **Save**.
5. Wait a minute or two, then refresh the Pages settings. Your site URL appears at the top, like `https://yourname.github.io/preplist/`.

**Updating later:** after changing any file, open `sw.js` and bump `VERSION` (for example `preplist-v1.0.1`). Otherwise phones keep serving the old cached files. After uploading, open the app, close it fully, and open it again to pick up the update.

## 4. Install on your iPhone

1. Open your site URL in **Safari** (not Chrome, for Home Screen installs on iOS).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open Prep List from the Home Screen icon. It runs full screen with a black status bar.
4. In the app, go to **More** and tap **Export Backup** once to confirm the share sheet works. Save it to Files.

Data added in Safari and data added in the installed app are separate on iOS. Use the installed app.

## 5. Get a free USDA API key (optional)

1. Go to https://fdc.nal.usda.gov/api-key-signup and fill in your name and email.
2. The key arrives by email within a minute.
3. In the app, go to **More**, paste it into **USDA FoodData Central, API key**, and tap **Test Key**.
   Do not put the key in any file in your repo. USDA deactivates keys it finds posted publicly. The app keeps it only in your phone's storage (and in your JSON backups, so keep those private).
4. On the Plan tab, **Add Food**, type a food, and tap **Search USDA**. Picking a result opens a form so you can set the store section, package size, and whether the values are raw or cooked before saving it as your own food.

## 6. Deploy the optional Cloudflare Worker proxy

Free Cloudflare accounts include 100,000 Worker requests per day, far more than you need.

### 6a. Create the Worker

1. Sign up at https://dash.cloudflare.com (free plan).
2. In the left sidebar open **Compute (Workers)** then **Workers & Pages**, and click **Create**. Choose **Create Worker** (the "Hello World" starter). Name it `preplist-proxy` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste the contents of `worker/worker.js`, and click **Deploy**.
4. Copy the Worker URL shown at the top, like `https://preplist-proxy.yourname.workers.dev`.

### 6b. Add secrets and settings

In the Worker, go to **Settings** then **Variables and Secrets**, and add each of these with **Add**. Choose type **Secret** for anything marked secret.

| Name | Type | Value |
|---|---|---|
| `APP_TOKEN` | Secret | Any long random string. Make one by mashing the keyboard for 30+ characters. Required. |
| `ALLOWED_ORIGIN` | Text | Your GitHub Pages origin, for example `https://yourname.github.io` (no path, no trailing slash). |
| `ANTHROPIC_API_KEY` | Secret | Optional. From console.anthropic.com, **API Keys**. Enables Parse with AI. |
| `ANTHROPIC_MODEL` | Text | Optional. Defaults to `claude-haiku-4-5-20251001`. |
| `KROGER_CLIENT_ID` | Secret | Optional. See 6c. |
| `KROGER_CLIENT_SECRET` | Secret | Optional. See 6c. |

Click **Deploy** after adding them if the dashboard asks.

### 6c. Kroger developer keys (optional, for live Kroger and Harris Teeter prices)

1. Create an account at https://developer.kroger.com.
2. Create a new application. Environment: **Production**. Add the **Products** and **Locations** APIs (public). A redirect URL is required by the form but not used here; `https://localhost` is fine.
3. Copy the **Client ID** and **Client Secret** into the Worker secrets above.

### 6d. Connect the app

1. In the app go to **More**, **Optional proxy**.
2. Paste the Worker URL and your `APP_TOKEN`, then tap **Test Connection**. It reports which features are on.
3. For Kroger prices, tap **Kroger / Harris Teeter Store**, enter your ZIP (28105 for Matthews), and pick a store.
4. On any list item, tap it, then **Check Live Price**. Tap a product to save its price for that store.

**Cost note:** Parse with AI calls are billed to your Anthropic account. A typical recipe parse with Haiku is a small fraction of a cent. The `APP_TOKEN` stops strangers from using your Worker.

---

## 7. Test checklist on your phone

- [ ] Install from Safari to the Home Screen. The app opens full screen with the black status bar and the icon looks right.
- [ ] Plan tab: change Days, People, and Calories per day. Scroll down and the big title collapses into the nav bar.
- [ ] Drag a food slider. Percentages, per-day amounts, and the daily summary update smoothly.
- [ ] Enter a protein target, tap **Fit to Macros**, and check the summary shows the target met.
- [ ] Add Food: search "oat" and add Oats. Swipe a food left to remove it.
- [ ] Tap **Make Grocery List**. Items show package amounts, per-day portions, "covers N days", and leftovers, grouped by section.
- [ ] Tap a circle: it fills yellow with a checkmark, the text grays and strikes through, and the row slides to the bottom of its section. Uncheck it and it returns to its original spot.
- [ ] Collapse and expand a section. Swipe an item left to delete. Tap the compose button to add a manual item.
- [ ] Tap an item, log a price at a store, and confirm the list shows an estimated total. Try **Compare Stores** from the list menu.
- [ ] Recipes: paste an ingredient list, tap **Parse Text**, switch to **Meal prep batch**, set people and days, and tap **Use my plan**. Then **Add to Current List** and check duplicates merged.
- [ ] Save the plan and the recipe. In Saved, tap **Select**, pick both, and make a combined list. Open a saved plan and change days before making a list.
- [ ] More: switch to Metric and check the list converts. Add a pantry item, then **Recalculate** from the list menu.
- [ ] Tap any input: the page should not zoom.
- [ ] Turn on Airplane Mode, force-quit, and reopen the app. It should load and work (USDA and proxy features will say they cannot connect).
- [ ] Export a backup, then Import it back.
- [ ] If you set up the proxy: **Test Connection**, import a recipe link, try **Parse with AI** on a one-line description, and check a live Kroger price.

---

## 8. Customizing

- **Add or fix built-in foods:** edit `js/foods.js`. Nutrition is per 100 g as purchased. `yield` is cooked weight divided by purchased weight. `pkgs` lists package sizes in grams.
- **Colors and spacing:** CSS variables at the top of `css/app.css`.
- **Default plan:** `defaultPlan()` in `js/store.js`.
- Remember to bump `VERSION` in `sw.js` after any change.

Nutrition values are rounded from USDA FoodData Central and are estimates. Package sizes are typical US sizes and vary by store.
