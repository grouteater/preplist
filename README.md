# Prep List

A weekly meal prep and grocery app for iPhone, styled like Apple Notes in dark mode. It is a static web app (plain HTML, CSS, and JavaScript, no framework, no build step) that runs on GitHub Pages and installs to your Home Screen. Everything is stored on your phone. No account.

---

## 1. How it works: the weekly loop

**Plan, Shop, Prep, Eat, repeat.** The Week tab shows where you are in the loop and gives you one button for the next step.

| Tab | What it does |
|---|---|
| **Week** | Seven days, three slots each. Breakfast is usually cook fresh, lunch is prepped, dinner can be prepped, cook fresh, easy (oven or air fryer), or eating out. Pick a meal for one day, Mon to Fri, or every day at once. Every meal resizes to its share of your daily calories (default split 25 / 35 / 40). Shows each day's calories and protein, how many of your 8 containers each prep session uses, and which prepped meals must go in the freezer. |
| **Shop** | One list for the whole week, rounded to real package sizes, grouped by section, with pantry leftovers subtracted. **Start Shopping** keeps the screen on, flattens the list into the order you walked that store last time (it learns the aisle layout from the order you check things off), and pops up a quick price field each time you check an item. Quick add understands "milk, 2 lb ground turkey, paper towels". **Finish Trip** saves the trip for the Store Scorecard. |
| **Prep** | A cook plan for prep day: preheat and setup, every cooking step with amounts (for example "Rinse 2½ cups rice, boil 3¾ cups water"), start times so everything finishes together, oven sharing, and one tap timers that beep and stay visible on every tab. Then a portion card per meal (cooked grams per container), a check that it fits your 30 oz containers, and a label list telling you which containers go in the fridge and which go in the freezer. Supports prepping once (Sunday) or twice (Sunday and Wednesday). |
| **Meals** | Your meal library: 15 starter meals (5 prepped lunches, 4 breakfasts including overnight oats, 3 easy air fryer or oven dinners, 3 cook fresh dinners). Edit ingredients per serving, mark a meal as prepped, cook fresh, or easy, and set cooking method, temperature, and time. Import recipes from pasted text, a link (proxy), or an AI description (proxy). |
| **More** | Container count and size, fridge days before freezing, pantry, stores, Store Scorecard, cheapest protein, custom foods, USDA search, the optional proxy, backup and restore. |

**The pantry runs itself.** Checking an item off adds what you bought to the pantry. **Start Next Week** subtracts what the week's meals used, shows you what should be left so you can correct it, and optionally repeats the same meals. The next list only buys the difference, so half a bag of rice carries over automatically.

**Undecided on a store?** Shop in shopping mode at a few stores and log prices as you check items off (or scan the receipt). The Store Scorecard compares them using only your real numbers. Aisle order, prices, and totals are all kept per store.

### Honesty notes
- Nutrition comes from rounded USDA values per 100 g as purchased (raw meat, dry rice), with cooked-yield factors for cooked weights. Estimates, not lab values.
- Package sizes are typical US sizes and vary by store.
- Prices are only what you log, read from your receipt photo, or fetch live from Kroger. Never invented.
- Food safety: cooked food is planned for about 4 days in the fridge (USDA guidance is 3 to 4), then the freezer. Overnight oats are never planned for the freezer.

### Needs the optional proxy (Tier 2, built, off by default)

| Feature | Why it needs a server |
|---|---|
| Receipt scanning | Photo of your receipt, read by Claude through the Worker, matched to your list, and saved as prices after you review them. Uses the same Anthropic key as AI parsing. |
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
js/app.js             Views and actions (Week, Shop, Prep, Meals, More)
js/week.js            Weekly loop: meal scaling, week needs, prep sessions, containers, cook timeline
js/templates.js       Starter meals and the default week
js/engine.js          Math: plan scaling, macro fit, packages, list merge, recipe parsing, prices
js/foods.js           Built-in food table, cooking steps, and ready-to-eat volumes
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
| `ANTHROPIC_API_KEY` | Secret | Optional. From console.anthropic.com, **API Keys**. Enables Parse with AI and receipt scanning. |
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

- [ ] Open the app from the Home Screen. It starts on **This Week** with a starter plan.
- [ ] Tap a lunch, choose **Mon to Fri**, and pick a different prepped meal. The Prep day card updates its container count.
- [ ] Change calories per day. Day totals update and the list shows "out of date" if you already built one.
- [ ] Switch **Twice a week** and back. Freezer notes appear or disappear on later lunches.
- [ ] Tap **Build Shopping List**. Items show package amounts, leftovers, and which meals they are for.
- [ ] Pick your store, tap **Start Shopping**. The screen stays on. Check an item: it fills yellow, grays out, drops to the bottom, and a price bar slides up. Save a price.
- [ ] Type "paper towels, 2 lb ground turkey" in the add field.
- [ ] Tap **Finish**. Next time you shop that store, the order follows how you walked it.
- [ ] Prep tab: start a timer, switch tabs, and confirm it keeps counting at the top and beeps when done (turn the ringer switch off silent).
- [ ] Portion cards show cooked grams per container and warn if a meal will overfill your 30 oz containers.
- [ ] Meals tab: edit a meal, change an amount, save. Import a recipe by pasting its ingredient list.
- [ ] **Start Next Week** from the Week menu: review leftovers, keep "Repeat this week's meals" on, and confirm the new list skips what you still have.
- [ ] Airplane Mode, force-quit, reopen: everything works offline.
- [ ] More: Export a backup to Files.

## 8. Customizing

- **Add or fix built-in foods:** edit `js/foods.js`. Nutrition is per 100 g as purchased. `yield` is cooked weight divided by purchased weight. `pkgs` lists package sizes in grams.
- **Colors and spacing:** CSS variables at the top of `css/app.css`.
- **Starter meals and default week:** `js/templates.js`.
- **Cooking steps:** the `COOK` table in `js/foods.js`.
- Remember to bump `VERSION` in `sw.js` after any change.

Nutrition values are rounded from USDA FoodData Central and are estimates. Package sizes are typical US sizes and vary by store.
