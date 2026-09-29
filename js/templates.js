// Starter meal templates. Grams are per serving, as purchased (raw meat, dry rice).
// When scale is true the whole meal is resized to hit that meal's calorie target.
// kind: prep = cooked on prep day and portioned into containers,
//       fresh = cooked the day you eat it, easy = oven or air fryer shortcut.

export const SEED_TEMPLATES = [
  // Prepped lunches
  { id: 't-chicken-bowl', name: 'Chicken, rice & broccoli', slot: 'lunch', kind: 'prep', scale: true, usesContainer: true,
    items: [{ foodId: 'chicken-thigh', g: 170 }, { foodId: 'white-rice', g: 75 }, { foodId: 'broccoli', g: 120 }, { foodId: 'olive-oil', g: 5 }] },
  { id: 't-turkey-taco-bowl', name: 'Turkey taco bowl', slot: 'lunch', kind: 'prep', scale: true, usesContainer: true,
    items: [{ foodId: 'ground-turkey', g: 150 }, { foodId: 'white-rice', g: 65 }, { foodId: 'black-beans', g: 80 }, { foodId: 'bell-pepper', g: 60 }, { foodId: 'salsa', g: 40 }, { foodId: 'cheddar', g: 15 }] },
  { id: 't-salmon-sweet-potato', name: 'Salmon, sweet potato & green beans', slot: 'lunch', kind: 'prep', scale: true, usesContainer: true,
    items: [{ foodId: 'salmon', g: 140 }, { foodId: 'sweet-potato', g: 200 }, { foodId: 'green-beans', g: 100 }] },
  { id: 't-beef-potato', name: 'Beef, potatoes & carrots', slot: 'lunch', kind: 'prep', scale: true, usesContainer: true,
    items: [{ foodId: 'ground-beef-90', g: 150 }, { foodId: 'potato', g: 250 }, { foodId: 'carrots', g: 80 }, { foodId: 'olive-oil', g: 5 }] },
  { id: 't-chicken-pasta', name: 'Chicken marinara pasta', slot: 'lunch', kind: 'prep', scale: true, usesContainer: true,
    items: [{ foodId: 'chicken-breast', g: 150 }, { foodId: 'pasta', g: 85 }, { foodId: 'marinara', g: 120 }, { foodId: 'spinach', g: 30 }] },

  // Breakfasts
  { id: 't-eggs-toast', name: 'Eggs & toast', slot: 'breakfast', kind: 'fresh', scale: true,
    items: [{ foodId: 'eggs', g: 150 }, { foodId: 'bread-wheat', g: 64 }, { foodId: 'butter', g: 5 }],
    method: { how: 'Stovetop', min: 8, text: 'Scramble or fry the eggs in the butter while the bread toasts.' } },
  { id: 't-yogurt-bowl', name: 'Greek yogurt bowl', slot: 'breakfast', kind: 'fresh', scale: true,
    items: [{ foodId: 'greek-yogurt', g: 250 }, { foodId: 'blueberries', g: 100 }, { foodId: 'oats', g: 30 }, { foodId: 'peanut-butter', g: 16 }],
    method: { how: 'No cook', min: 3, text: 'Yogurt topped with berries, oats, and a spoon of peanut butter.' } },
  { id: 't-oatmeal-banana', name: 'Oatmeal & banana', slot: 'breakfast', kind: 'fresh', scale: true,
    items: [{ foodId: 'oats', g: 60 }, { foodId: 'milk-2', g: 240 }, { foodId: 'banana', g: 118 }],
    method: { how: 'Microwave', min: 4, text: 'Microwave oats and milk 2 to 3 min, stir, top with sliced banana.' } },
  { id: 't-overnight-oats', name: 'Overnight oats', slot: 'breakfast', kind: 'prep', scale: true, usesContainer: true, freezable: false,
    items: [{ foodId: 'oats', g: 50 }, { foodId: 'milk-2', g: 150 }, { foodId: 'greek-yogurt', g: 100 }, { foodId: 'blueberries', g: 75 }, { foodId: 'peanut-butter', g: 16 }],
    method: { how: 'No cook', min: 5, text: 'Stir oats, milk, and yogurt together in each container. Top with berries and peanut butter. Fridge overnight.' } },

  // Easy dinners
  { id: 't-tenders-fries', name: 'Air fryer tenders & fries', slot: 'dinner', kind: 'easy', scale: true,
    items: [{ foodId: 'chicken-tenders', g: 170 }, { foodId: 'fries', g: 150 }],
    method: { how: 'Air fryer', temp: '400°F', min: 14, text: 'Fries first for 4 min, then add tenders. Shake halfway.' } },
  { id: 't-pizza', name: 'Frozen pizza & salad', slot: 'dinner', kind: 'easy', scale: true,
    items: [{ foodId: 'frozen-pizza', g: 240 }, { foodId: 'salad-greens', g: 60 }],
    method: { how: 'Oven', temp: '425°F', min: 16, text: 'Bake straight on the rack until the cheese bubbles. Salad while it bakes.' } },
  { id: 't-potstickers', name: 'Potstickers & veggies', slot: 'dinner', kind: 'easy', scale: true,
    items: [{ foodId: 'potstickers', g: 280 }, { foodId: 'frozen-veg', g: 150 }],
    method: { how: 'Air fryer', temp: '380°F', min: 12, text: 'Brush or spray with oil, air fry, shake halfway. Microwave the veggies.' } },

  // Cook fresh dinners
  { id: 't-turkey-tacos', name: 'Turkey tacos', slot: 'dinner', kind: 'fresh', scale: true,
    items: [{ foodId: 'ground-turkey', g: 150 }, { foodId: 'tortilla', g: 90 }, { foodId: 'cheddar', g: 20 }, { foodId: 'salsa', g: 50 }, { foodId: 'bell-pepper', g: 60 }],
    method: { how: 'Skillet', min: 15, text: 'Brown the turkey with taco seasoning, saute peppers, warm tortillas.' },
    extras: [{ name: 'taco seasoning', qty: 1, unit: 'tbsp', section: 'pantry' }] },
  { id: 't-salmon-rice', name: 'Salmon, rice & green beans', slot: 'dinner', kind: 'fresh', scale: true,
    items: [{ foodId: 'salmon', g: 150 }, { foodId: 'white-rice', g: 70 }, { foodId: 'green-beans', g: 100 }],
    method: { how: 'Air fryer', temp: '390°F', min: 25, text: 'Start rice first. Air fry salmon 9 to 10 min and beans 8 min.' } },
  { id: 't-spaghetti', name: 'Spaghetti & meat sauce', slot: 'dinner', kind: 'fresh', scale: true,
    items: [{ foodId: 'ground-beef-90', g: 120 }, { foodId: 'pasta', g: 100 }, { foodId: 'marinara', g: 150 }],
    method: { how: 'Stovetop', min: 20, text: 'Boil pasta. Brown beef, add sauce, simmer 5 min.' } },
];

export function defaultWeekDays() {
  // Mon to Sun. Lunch prepped on weekdays, breakfast fresh, dinners a mix, Friday out.
  const b = ['t-eggs-toast', 't-yogurt-bowl', 't-eggs-toast', 't-yogurt-bowl', 't-eggs-toast', 't-oatmeal-banana', 't-eggs-toast'];
  const l = ['t-chicken-bowl', 't-chicken-bowl', 't-chicken-bowl', 't-turkey-taco-bowl', 't-turkey-taco-bowl', null, null];
  const d = ['t-salmon-rice', 't-tenders-fries', 't-turkey-tacos', 't-potstickers', 'out', 't-spaghetti', 't-pizza'];
  return b.map((_, i) => ({
    breakfast: { t: b[i] },
    lunch: { t: l[i] },
    dinner: d[i] === 'out' ? { t: null, out: true } : { t: d[i] },
  }));
}
