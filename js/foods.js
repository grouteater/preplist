// Built-in offline food table.
// All nutrition is per 100 g AS PURCHASED (raw meat, dry rice/pasta/oats, etc.).
// yield = cooked weight / purchased weight, used to show "about X g cooked".
// Values are rounded from USDA FoodData Central (SR Legacy / Foundation) entries.
// pkgs = common US package sizes in grams. loose = sold by weight, rounded to 0.25 lb.
// unit = a natural counting unit; show: true displays daily portions in that unit.
// gPerCup lets recipe volumes (cup, tbsp, tsp) convert to grams.

export const SECTIONS = [
  { id: 'produce', name: 'Produce' },
  { id: 'meat', name: 'Meat & Seafood' },
  { id: 'dairy', name: 'Dairy & Eggs' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'pantry', name: 'Pantry' },
  { id: 'other', name: 'Other' },
];

export const ROLE_SHARE = { protein: 30, carb: 30, veg: 5, fruit: 8, dairy: 12, fat: 6, other: 10 };

const LB = 453.592;
const OZ = 28.3495;

export const BUILTIN_FOODS = [
  // Meat & seafood
  { id: 'chicken-thigh', name: 'Chicken thighs, boneless skinless', short: 'Chicken thighs', section: 'meat', role: 'protein', basis: 'raw', kcal: 121, p: 19.7, c: 0, f: 4.1, yield: 0.7, cook: 'cooked', aliases: ['chicken thigh'], pkgs: [{ label: '1.5 lb pack', g: 1.5 * LB }, { label: '3 lb family pack', g: 3 * LB }], note: 'Pack weights vary by store. Check the label.' },
  { id: 'chicken-breast', name: 'Chicken breast, boneless skinless', short: 'Chicken breast', section: 'meat', role: 'protein', basis: 'raw', kcal: 120, p: 22.5, c: 0, f: 2.6, yield: 0.75, cook: 'cooked', aliases: ['chicken breast', 'chicken'], pkgs: [{ label: '1.5 lb pack', g: 1.5 * LB }, { label: '3 lb family pack', g: 3 * LB }], note: 'Pack weights vary by store. Check the label.' },
  { id: 'ground-beef-90', name: 'Ground beef, 90% lean', short: 'Ground beef 90/10', section: 'meat', role: 'protein', basis: 'raw', kcal: 176, p: 20, c: 0, f: 10, yield: 0.75, cook: 'cooked', aliases: ['lean ground beef', 'ground beef', 'beef mince'], pkgs: [{ label: '1 lb pack', g: LB }, { label: '2.25 lb pack', g: 2.25 * LB }] },
  { id: 'ground-beef-80', name: 'Ground beef, 80% lean', short: 'Ground beef 80/20', section: 'meat', role: 'protein', basis: 'raw', kcal: 254, p: 17.2, c: 0, f: 20, yield: 0.7, cook: 'cooked', aliases: ['80/20 ground beef', 'hamburger'], pkgs: [{ label: '1 lb pack', g: LB }, { label: '3 lb pack', g: 3 * LB }] },
  { id: 'ground-turkey', name: 'Ground turkey, 93% lean', short: 'Ground turkey', section: 'meat', role: 'protein', basis: 'raw', kcal: 150, p: 19, c: 0, f: 8, yield: 0.75, cook: 'cooked', aliases: ['ground turkey', 'turkey mince'], pkgs: [{ label: '1 lb pack', g: LB }, { label: '3 lb pack', g: 3 * LB }] },
  { id: 'salmon', name: 'Salmon fillet, Atlantic', short: 'Salmon', section: 'meat', role: 'protein', basis: 'raw', kcal: 208, p: 20.4, c: 0, f: 13.4, yield: 0.8, cook: 'cooked', aliases: ['salmon'], loose: true },
  { id: 'tilapia', name: 'Tilapia fillet', short: 'Tilapia', section: 'meat', role: 'protein', basis: 'raw', kcal: 96, p: 20.1, c: 0, f: 1.7, yield: 0.8, cook: 'cooked', aliases: ['tilapia', 'white fish', 'cod'], pkgs: [{ label: '1 lb pack', g: LB }, { label: '2 lb frozen bag', g: 2 * LB }] },
  { id: 'shrimp', name: 'Shrimp, raw, peeled', short: 'Shrimp', section: 'frozen', role: 'protein', basis: 'raw', kcal: 85, p: 20.1, c: 0, f: 0.5, yield: 0.85, cook: 'cooked', aliases: ['shrimp', 'prawn'], pkgs: [{ label: '1 lb frozen bag', g: LB }, { label: '2 lb frozen bag', g: 2 * LB }] },
  { id: 'tuna-can', name: 'Tuna, canned in water (drained)', short: 'Canned tuna', section: 'pantry', role: 'protein', basis: 'as sold', kcal: 116, p: 25.5, c: 0, f: 0.8, yield: 1, aliases: ['tuna', 'canned tuna'], pkgs: [{ label: '5 oz can', g: 4 * OZ }], unit: { name: 'can', plural: 'cans', g: 4 * OZ }, note: 'Grams are drained weight (about 4 oz per 5 oz can).' },
  { id: 'tofu', name: 'Tofu, firm', short: 'Firm tofu', section: 'produce', role: 'protein', basis: 'as sold', kcal: 144, p: 17.3, c: 2.8, f: 8.7, yield: 1, aliases: ['tofu'], pkgs: [{ label: '14 oz block', g: 14 * OZ }] },

  // Dairy & eggs
  { id: 'eggs', name: 'Eggs, large', short: 'Eggs', section: 'dairy', role: 'protein', basis: 'raw', kcal: 143, p: 12.6, c: 0.7, f: 9.5, yield: 1, aliases: ['egg', 'eggs'], pkgs: [{ label: '12 ct carton', g: 600 }, { label: '18 ct carton', g: 900 }], unit: { name: 'egg', plural: 'eggs', g: 50, show: true } },
  { id: 'egg-whites', name: 'Liquid egg whites', short: 'Egg whites', section: 'dairy', role: 'protein', basis: 'as sold', kcal: 52, p: 10.9, c: 0.7, f: 0.2, yield: 1, aliases: ['egg white'], pkgs: [{ label: '16 oz carton', g: LB }, { label: '32 oz carton', g: 2 * LB }], gPerCup: 243 },
  { id: 'greek-yogurt', name: 'Greek yogurt, plain nonfat', short: 'Greek yogurt', section: 'dairy', role: 'dairy', basis: 'as sold', kcal: 59, p: 10.3, c: 3.6, f: 0.4, yield: 1, aliases: ['greek yogurt', 'yogurt'], pkgs: [{ label: '32 oz tub', g: 32 * OZ }, { label: '5.3 oz cup', g: 150 }], gPerCup: 245 },
  { id: 'cottage-cheese', name: 'Cottage cheese, 2%', short: 'Cottage cheese', section: 'dairy', role: 'dairy', basis: 'as sold', kcal: 81, p: 10.5, c: 4.8, f: 2.3, yield: 1, aliases: ['cottage cheese'], pkgs: [{ label: '16 oz tub', g: LB }, { label: '24 oz tub', g: 1.5 * LB }], gPerCup: 226 },
  { id: 'milk-2', name: 'Milk, 2%', short: 'Milk 2%', section: 'dairy', role: 'dairy', basis: 'as sold', kcal: 50, p: 3.3, c: 4.8, f: 2.0, yield: 1, aliases: ['milk', '2% milk'], pkgs: [{ label: 'half gallon', g: 1950 }, { label: 'gallon', g: 3900 }], gPerCup: 244 },
  { id: 'milk-whole', name: 'Milk, whole', short: 'Whole milk', section: 'dairy', role: 'dairy', basis: 'as sold', kcal: 61, p: 3.2, c: 4.8, f: 3.3, yield: 1, aliases: ['whole milk'], pkgs: [{ label: 'half gallon', g: 1950 }, { label: 'gallon', g: 3900 }], gPerCup: 244 },
  { id: 'cheddar', name: 'Cheddar cheese', short: 'Cheddar', section: 'dairy', role: 'fat', basis: 'as sold', kcal: 403, p: 24.9, c: 1.3, f: 33.1, yield: 1, aliases: ['cheddar', 'cheese', 'shredded cheese'], pkgs: [{ label: '8 oz block', g: 8 * OZ }], gPerCup: 113 },
  { id: 'butter', name: 'Butter, salted', short: 'Butter', section: 'dairy', role: 'fat', basis: 'as sold', kcal: 717, p: 0.9, c: 0.1, f: 81.1, yield: 1, aliases: ['butter'], pkgs: [{ label: '1 lb (4 sticks)', g: LB }], gPerCup: 227 },

  // Pantry starches and staples
  { id: 'white-rice', name: 'White rice, long grain (dry)', short: 'White rice', section: 'pantry', role: 'carb', basis: 'dry', kcal: 365, p: 7.1, c: 80, f: 0.7, yield: 2.8, cook: 'cooked', aliases: ['rice', 'white rice', 'jasmine rice', 'basmati rice', 'long grain rice'], pkgs: [{ label: '2 lb bag', g: 2 * LB }, { label: '5 lb bag', g: 5 * LB }], gPerCup: 185 },
  { id: 'brown-rice', name: 'Brown rice (dry)', short: 'Brown rice', section: 'pantry', role: 'carb', basis: 'dry', kcal: 367, p: 7.5, c: 76.2, f: 3.2, yield: 2.8, cook: 'cooked', aliases: ['brown rice'], pkgs: [{ label: '2 lb bag', g: 2 * LB }], gPerCup: 190 },
  { id: 'pasta', name: 'Pasta, dry', short: 'Pasta', section: 'pantry', role: 'carb', basis: 'dry', kcal: 371, p: 13, c: 74.7, f: 1.5, yield: 2.3, cook: 'cooked', aliases: ['pasta', 'spaghetti', 'penne', 'macaroni', 'rotini', 'noodle'], pkgs: [{ label: '1 lb box', g: LB }] },
  { id: 'oats', name: 'Rolled oats (dry)', short: 'Oats', section: 'pantry', role: 'carb', basis: 'dry', kcal: 379, p: 13.2, c: 67.7, f: 6.5, yield: 1, aliases: ['oat', 'oats', 'oatmeal', 'rolled oats'], pkgs: [{ label: '18 oz canister', g: 18 * OZ }, { label: '42 oz canister', g: 42 * OZ }], gPerCup: 81 },
  { id: 'quinoa', name: 'Quinoa (dry)', short: 'Quinoa', section: 'pantry', role: 'carb', basis: 'dry', kcal: 368, p: 14.1, c: 64.2, f: 6.1, yield: 2.7, cook: 'cooked', aliases: ['quinoa'], pkgs: [{ label: '12 oz bag', g: 12 * OZ }, { label: '2 lb bag', g: 2 * LB }], gPerCup: 170 },
  { id: 'lentils', name: 'Lentils (dry)', short: 'Lentils', section: 'pantry', role: 'protein', basis: 'dry', kcal: 352, p: 24.6, c: 63.4, f: 1.1, yield: 2.9, cook: 'cooked', aliases: ['lentil'], pkgs: [{ label: '1 lb bag', g: LB }], gPerCup: 192 },
  { id: 'black-beans', name: 'Black beans, canned (drained)', short: 'Black beans', section: 'pantry', role: 'carb', basis: 'as sold', kcal: 91, p: 6, c: 16.6, f: 0.3, yield: 1, aliases: ['black bean', 'beans', 'kidney bean', 'pinto bean'], pkgs: [{ label: '15 oz can', g: 240 }], unit: { name: 'can', plural: 'cans', g: 240 }, gPerCup: 172, note: 'Grams are drained weight (about 240 g per 15 oz can).' },
  { id: 'peanut-butter', name: 'Peanut butter', short: 'Peanut butter', section: 'pantry', role: 'fat', basis: 'as sold', kcal: 588, p: 25, c: 20, f: 50, yield: 1, aliases: ['peanut butter'], pkgs: [{ label: '16 oz jar', g: LB }, { label: '40 oz jar', g: 40 * OZ }], gPerCup: 258 },
  { id: 'olive-oil', name: 'Olive oil', short: 'Olive oil', section: 'pantry', role: 'fat', basis: 'as sold', kcal: 884, p: 0, c: 0, f: 100, yield: 1, aliases: ['olive oil', 'oil', 'vegetable oil', 'canola oil'], pkgs: [{ label: '16.9 oz bottle', g: 460 }], gPerCup: 216 },
  { id: 'almonds', name: 'Almonds', short: 'Almonds', section: 'pantry', role: 'fat', basis: 'as sold', kcal: 579, p: 21.2, c: 21.6, f: 49.9, yield: 1, aliases: ['almond'], pkgs: [{ label: '16 oz bag', g: LB }], gPerCup: 143 },
  { id: 'whey', name: 'Whey protein powder', short: 'Whey protein', section: 'pantry', role: 'protein', basis: 'as sold', kcal: 400, p: 78, c: 8, f: 6, yield: 1, aliases: ['protein powder', 'whey'], pkgs: [{ label: '2 lb tub', g: 2 * LB }, { label: '5 lb tub', g: 5 * LB }], unit: { name: 'scoop', plural: 'scoops', g: 30, show: true }, note: 'Varies a lot by brand. Edit to match your label.' },
  { id: 'flour', name: 'All-purpose flour', short: 'Flour', section: 'pantry', role: 'carb', basis: 'as sold', kcal: 364, p: 10.3, c: 76.3, f: 1, yield: 1, aliases: ['flour', 'all purpose flour'], pkgs: [{ label: '5 lb bag', g: 5 * LB }], gPerCup: 125 },
  { id: 'sugar', name: 'Granulated sugar', short: 'Sugar', section: 'pantry', role: 'other', basis: 'as sold', kcal: 387, p: 0, c: 100, f: 0, yield: 1, aliases: ['sugar', 'white sugar'], pkgs: [{ label: '4 lb bag', g: 4 * LB }], gPerCup: 200 },

  // Bakery
  { id: 'bread-wheat', name: 'Whole wheat bread', short: 'Wheat bread', section: 'bakery', role: 'carb', basis: 'as sold', kcal: 252, p: 12.4, c: 42.7, f: 3.5, yield: 1, aliases: ['bread', 'toast', 'wheat bread', 'whole wheat bread'], pkgs: [{ label: '20 oz loaf', g: 20 * OZ }], unit: { name: 'slice', plural: 'slices', g: 32, show: true } },
  { id: 'bread-white', name: 'White bread', short: 'White bread', section: 'bakery', role: 'carb', basis: 'as sold', kcal: 266, p: 8.9, c: 49.4, f: 3.3, yield: 1, aliases: ['white bread', 'sandwich bread'], pkgs: [{ label: '20 oz loaf', g: 20 * OZ }], unit: { name: 'slice', plural: 'slices', g: 25, show: true } },
  { id: 'tortilla', name: 'Flour tortillas, 8 inch', short: 'Tortillas', section: 'bakery', role: 'carb', basis: 'as sold', kcal: 312, p: 8.2, c: 51.6, f: 8, yield: 1, aliases: ['tortilla', 'wrap'], pkgs: [{ label: '10 ct pack', g: 450 }], unit: { name: 'tortilla', plural: 'tortillas', g: 45, show: true } },

  // Produce
  { id: 'broccoli', name: 'Broccoli', short: 'Broccoli', section: 'produce', role: 'veg', basis: 'raw', kcal: 34, p: 2.8, c: 6.6, f: 0.4, yield: 1, cook: 'cooked', aliases: ['broccoli'], loose: true, gPerCup: 91 },
  { id: 'green-beans', name: 'Green beans', short: 'Green beans', section: 'produce', role: 'veg', basis: 'raw', kcal: 31, p: 1.8, c: 7, f: 0.2, yield: 1, aliases: ['green bean'], pkgs: [{ label: '12 oz bag', g: 12 * OZ }], gPerCup: 110 },
  { id: 'spinach', name: 'Spinach, baby', short: 'Spinach', section: 'produce', role: 'veg', basis: 'raw', kcal: 23, p: 2.9, c: 3.6, f: 0.4, yield: 1, aliases: ['spinach'], pkgs: [{ label: '5 oz clamshell', g: 5 * OZ }, { label: '10 oz bag', g: 10 * OZ }], gPerCup: 30 },
  { id: 'carrots', name: 'Carrots', short: 'Carrots', section: 'produce', role: 'veg', basis: 'raw', kcal: 41, p: 0.9, c: 9.6, f: 0.2, yield: 1, aliases: ['carrot'], pkgs: [{ label: '1 lb bag', g: LB }, { label: '2 lb bag', g: 2 * LB }], gPerCup: 128, unit: { name: 'carrot', plural: 'carrots', g: 61 } },
  { id: 'bell-pepper', name: 'Bell pepper', short: 'Bell peppers', section: 'produce', role: 'veg', basis: 'raw', kcal: 31, p: 1, c: 6, f: 0.3, yield: 1, aliases: ['bell pepper', 'red pepper', 'green pepper'], unit: { name: 'pepper', plural: 'peppers', g: 160 }, gPerCup: 149 },
  { id: 'onion', name: 'Yellow onion', short: 'Onions', section: 'produce', role: 'veg', basis: 'raw', kcal: 40, p: 1.1, c: 9.3, f: 0.1, yield: 1, aliases: ['onion'], unit: { name: 'onion', plural: 'onions', g: 150 }, gPerCup: 160 },
  { id: 'garlic', name: 'Garlic', short: 'Garlic', section: 'produce', role: 'other', basis: 'raw', kcal: 149, p: 6.4, c: 33, f: 0.5, yield: 1, aliases: ['garlic', 'garlic clove'], unit: { name: 'head', plural: 'heads', g: 40 }, clove: 4, gPerCup: 136 },
  { id: 'potato', name: 'Russet potatoes', short: 'Potatoes', section: 'produce', role: 'carb', basis: 'raw', kcal: 79, p: 2.1, c: 18.1, f: 0.1, yield: 0.85, cook: 'baked', aliases: ['potato', 'russet'], loose: true, pkgs: [{ label: '5 lb bag', g: 5 * LB }], unit: { name: 'potato', plural: 'potatoes', g: 213 } },
  { id: 'sweet-potato', name: 'Sweet potatoes', short: 'Sweet potatoes', section: 'produce', role: 'carb', basis: 'raw', kcal: 86, p: 1.6, c: 20.1, f: 0.1, yield: 0.95, cook: 'baked', aliases: ['sweet potato', 'yam'], loose: true, unit: { name: 'sweet potato', plural: 'sweet potatoes', g: 130 } },
  { id: 'banana', name: 'Bananas', short: 'Bananas', section: 'produce', role: 'fruit', basis: 'peeled', kcal: 89, p: 1.1, c: 22.8, f: 0.3, yield: 1, aliases: ['banana'], unit: { name: 'banana', plural: 'bananas', g: 118, show: true } },
  { id: 'apple', name: 'Apples', short: 'Apples', section: 'produce', role: 'fruit', basis: 'raw', kcal: 52, p: 0.3, c: 13.8, f: 0.2, yield: 1, aliases: ['apple'], unit: { name: 'apple', plural: 'apples', g: 182, show: true } },
  { id: 'blueberries', name: 'Blueberries', short: 'Blueberries', section: 'produce', role: 'fruit', basis: 'raw', kcal: 57, p: 0.7, c: 14.5, f: 0.3, yield: 1, aliases: ['blueberry', 'berries'], pkgs: [{ label: '6 oz clamshell', g: 6 * OZ }, { label: '18 oz clamshell', g: 18 * OZ }], gPerCup: 148 },
  { id: 'avocado', name: 'Avocados', short: 'Avocados', section: 'produce', role: 'fat', basis: 'flesh', kcal: 160, p: 2, c: 8.5, f: 14.7, yield: 1, aliases: ['avocado'], unit: { name: 'avocado', plural: 'avocados', g: 136, show: true } },
  { id: 'tomato', name: 'Tomatoes', short: 'Tomatoes', section: 'produce', role: 'veg', basis: 'raw', kcal: 18, p: 0.9, c: 3.9, f: 0.2, yield: 1, aliases: ['tomato'], unit: { name: 'tomato', plural: 'tomatoes', g: 123 }, gPerCup: 180 },
  { id: 'lemon', name: 'Lemons', short: 'Lemons', section: 'produce', role: 'other', basis: 'raw', kcal: 29, p: 1.1, c: 9.3, f: 0.3, yield: 1, aliases: ['lemon', 'lime'], unit: { name: 'lemon', plural: 'lemons', g: 84 } },

  // Frozen
  { id: 'frozen-veg', name: 'Frozen mixed vegetables', short: 'Frozen mixed veg', section: 'frozen', role: 'veg', basis: 'as sold', kcal: 64, p: 2.9, c: 13.3, f: 0.5, yield: 1, aliases: ['mixed vegetable', 'frozen vegetable'], pkgs: [{ label: '12 oz bag', g: 12 * OZ }, { label: '2 lb bag', g: 2 * LB }], gPerCup: 135 },
  { id: 'chicken-tenders', name: 'Breaded chicken tenders (frozen)', short: 'Frozen chicken tenders', section: 'frozen', role: 'protein', basis: 'as sold', kcal: 240, p: 15, c: 16, f: 12.5, yield: 1, aliases: ['chicken tender', 'chicken strip', 'chicken nugget'], pkgs: [{ label: '25 oz bag', g: 25 * OZ }, { label: '40 oz bag', g: 40 * OZ }], unit: { name: 'tender', plural: 'tenders', g: 42, show: true } },
  { id: 'fries', name: 'Frozen french fries', short: 'Frozen fries', section: 'frozen', role: 'carb', basis: 'as sold', kcal: 150, p: 2.3, c: 23, f: 5.6, yield: 1, aliases: ['french fry', 'fries', 'tater tot'], pkgs: [{ label: '32 oz bag', g: 2 * LB }] },
  { id: 'frozen-pizza', name: 'Frozen pizza, 12 inch', short: 'Frozen pizza', section: 'frozen', role: 'carb', basis: 'as sold', kcal: 265, p: 11, c: 30, f: 11, yield: 1, aliases: ['frozen pizza', 'pizza'], pkgs: [{ label: '12 in pizza', g: 560 }], unit: { name: 'slice', plural: 'slices', g: 93, show: true } },
  { id: 'potstickers', name: 'Frozen potstickers / dumplings', short: 'Frozen potstickers', section: 'frozen', role: 'carb', basis: 'as sold', kcal: 210, p: 8, c: 27, f: 7, yield: 1, aliases: ['potsticker', 'dumpling', 'gyoza'], pkgs: [{ label: '24 oz bag', g: 24 * OZ }], unit: { name: 'potsticker', plural: 'potstickers', g: 28, show: true } },
  { id: 'marinara', name: 'Marinara sauce', short: 'Marinara', section: 'pantry', role: 'other', basis: 'as sold', kcal: 50, p: 1.4, c: 8, f: 1.5, yield: 1, aliases: ['marinara', 'pasta sauce', 'tomato sauce', 'spaghetti sauce'], pkgs: [{ label: '24 oz jar', g: 24 * OZ }], gPerCup: 250 },
  { id: 'salsa', name: 'Salsa', short: 'Salsa', section: 'pantry', role: 'other', basis: 'as sold', kcal: 36, p: 1.5, c: 7, f: 0.2, yield: 1, aliases: ['salsa'], pkgs: [{ label: '16 oz jar', g: LB }], gPerCup: 260 },
  { id: 'salad-greens', name: 'Salad greens', short: 'Salad greens', section: 'produce', role: 'veg', basis: 'raw', kcal: 17, p: 1.5, c: 3, f: 0.2, yield: 1, aliases: ['salad', 'lettuce', 'mixed green', 'romaine'], pkgs: [{ label: '5 oz clamshell', g: 5 * OZ }], gPerCup: 47 },
  { id: 'frozen-berries', name: 'Frozen mixed berries', short: 'Frozen berries', section: 'frozen', role: 'fruit', basis: 'as sold', kcal: 50, p: 0.7, c: 12, f: 0.3, yield: 1, aliases: ['frozen berry', 'mixed berry'], pkgs: [{ label: '16 oz bag', g: LB }, { label: '3 lb bag', g: 3 * LB }], gPerCup: 140 },
];

// How to cook each food on prep day. {cups} and {water} are filled in from the amount.
// min = total minutes. temp for ovens and air fryers.
export const COOK = {
  'chicken-thigh': { how: 'Oven', temp: '425°F', min: 25, text: 'Season, spread on a lined sheet pan, and roast until 165°F inside.', alt: 'Air fryer: 380°F for 18 to 20 min, flip halfway.' },
  'chicken-breast': { how: 'Oven', temp: '425°F', min: 22, text: 'Season, roast on a lined sheet pan until 165°F inside. Rest 5 min before slicing.', alt: 'Air fryer: 380°F for 16 to 18 min.' },
  'ground-beef-90': { how: 'Skillet', min: 12, text: 'Brown over medium high, breaking it up, until no pink remains (160°F). Season.' },
  'ground-beef-80': { how: 'Skillet', min: 12, text: 'Brown over medium high, breaking it up, until no pink remains (160°F). Drain the fat.' },
  'ground-turkey': { how: 'Skillet', min: 12, text: 'Brown over medium high with a little oil, breaking it up, until 165°F. Season.' },
  'salmon': { how: 'Oven', temp: '400°F', min: 14, text: 'Season and bake until it flakes and reads 145°F.', alt: 'Air fryer: 390°F for 9 to 10 min.' },
  'tilapia': { how: 'Oven', temp: '400°F', min: 12, text: 'Season and bake until it flakes (145°F).' },
  'shrimp': { how: 'Skillet', min: 6, text: 'Thaw, pat dry, and sear 2 min per side until pink.' },
  'tofu': { how: 'Air fryer', temp: '400°F', min: 20, text: 'Press 10 min, cube, toss with oil and cornstarch, air fry 15 min shaking halfway.' },
  'eggs': { how: 'Stovetop', min: 20, text: 'Hard boil: cover with cold water, bring to a boil, cover and take off heat for 11 min, then ice bath.' },
  'white-rice': { how: 'Stovetop', min: 30, water: 1.5, text: 'Rinse {cups} cups rice. Boil {water} cups water, add rice, cover and simmer on low 18 min, then rest 10 min. A rice cooker works with the same water.' },
  'brown-rice': { how: 'Stovetop', min: 50, water: 2, text: 'Rinse {cups} cups rice. Boil {water} cups water, add rice, cover and simmer 45 min, then rest 5 min.' },
  'quinoa': { how: 'Stovetop', min: 22, water: 2, text: 'Rinse {cups} cups quinoa. Simmer in {water} cups water, covered, 15 min. Rest 5 min and fluff.' },
  'lentils': { how: 'Stovetop', min: 25, water: 3, text: 'Rinse {cups} cups lentils. Simmer uncovered in {water} cups water 20 to 25 min until tender, then drain.' },
  'pasta': { how: 'Stovetop', min: 15, text: 'Boil in well salted water 9 to 11 min. Drain and toss with a little oil so it does not clump in the containers.' },
  'potato': { how: 'Oven', temp: '425°F', min: 35, text: 'Cut into 1 inch cubes, toss with oil and salt, roast, flipping halfway.' },
  'sweet-potato': { how: 'Oven', temp: '425°F', min: 30, text: 'Cut into 1 inch cubes, toss with oil and salt, roast, flipping halfway.' },
  'broccoli': { how: 'Oven', temp: '425°F', min: 18, text: 'Cut into florets, toss with oil and salt, roast until the edges brown.', alt: 'Or steam 5 min for softer broccoli.' },
  'green-beans': { how: 'Oven', temp: '425°F', min: 15, text: 'Trim, toss with oil and salt, roast until blistered.' },
  'carrots': { how: 'Oven', temp: '425°F', min: 25, text: 'Cut into coins, toss with oil and salt, roast.' },
  'bell-pepper': { how: 'Skillet', min: 8, text: 'Slice and saute with a little oil until soft.' },
  'onion': { how: 'Skillet', min: 8, text: 'Slice and saute until soft.' },
  'frozen-veg': { how: 'Microwave', min: 6, text: 'Steam in the bag or microwave covered until hot.' },
  'black-beans': { how: 'Stovetop', min: 5, text: 'Rinse, drain, and warm with a pinch of cumin and salt.' },
  'spinach': { how: 'No cook', min: 0, text: 'Add raw to containers; it wilts when you reheat.' },
};

// Grams per cup of the food once cooked or ready to eat. Used to check container fit.
export const READY_G_PER_CUP = {
  'chicken-thigh': 140, 'chicken-breast': 140, 'ground-beef-90': 150, 'ground-beef-80': 150, 'ground-turkey': 150, salmon: 140, tilapia: 140, shrimp: 145, tofu: 150,
  eggs: 136, 'white-rice': 158, 'brown-rice': 195, quinoa: 185, lentils: 198, pasta: 140, potato: 150, 'sweet-potato': 150, broccoli: 156, 'green-beans': 125,
  carrots: 156, 'bell-pepper': 150, onion: 160, 'frozen-veg': 180, 'black-beans': 172, spinach: 30, 'greek-yogurt': 245, 'milk-2': 244, oats: 81,
};

for (const f of BUILTIN_FOODS) if (COOK[f.id]) f.cookHow = COOK[f.id];

export function makeFoodIndex(customFoods) {
  const map = new Map();
  for (const f of BUILTIN_FOODS) map.set(f.id, f);
  for (const f of customFoods || []) map.set(f.id, f);
  return map;
}

export function sectionName(id) {
  return (SECTIONS.find((s) => s.id === id) || SECTIONS[SECTIONS.length - 1]).name;
}
export function sectionOrder(id) {
  const i = SECTIONS.findIndex((s) => s.id === id);
  return i < 0 ? SECTIONS.length : i;
}
