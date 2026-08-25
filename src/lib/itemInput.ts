// Smart parsing for the single "Add an item" field.
//
// The whole point of this module is that the customer only ever types one
// thing: what they want to buy. Quantity, and the aisle it belongs to, are
// worked out from that sentence instead of asking for three separate inputs.
//
//   "2 milk"          -> { text: "Milk",   quantity: "2",     category: "Dairy & Eggs" }
//   "500g flour"      -> { text: "Flour",  quantity: "500 g", category: "Pantry" }
//   "bread x3"        -> { text: "Bread",  quantity: "3",     category: "Bakery" }
//   "batteries #shed" -> { text: "Batteries", category: "Shed" }
//
// Everything here is pure so it can be unit-tested without Firebase or React.

export const MAX_ITEM_TEXT_LENGTH = 500;
export const MAX_QUANTITY_LENGTH = 40;
export const MAX_CATEGORY_LENGTH = 80;
/** Short brand/size hint on a row — not a free-form memo pad. */
export const MAX_NOTE_LENGTH = 120;
export const DEFAULT_CATEGORY = "General";

/** Aisles used for auto-grouping and as edit-field suggestions. */
export const AISLES = [
  "Produce",
  "Bakery",
  "Dairy & Eggs",
  "Meat & Fish",
  "Pantry",
  "Frozen",
  "Drinks",
  "Snacks",
  "Household",
  "Health & Beauty",
  "Baby",
  "Pet",
] as const;

// Keyword -> aisle. Keywords are singular and lowercase; plurals are handled by
// the matcher. Multi-word keywords are matched as phrases before single words.
const AISLE_KEYWORDS: Record<(typeof AISLES)[number], string[]> = {
  Produce: [
    "apple",
    "banana",
    "orange",
    "clementine",
    "satsuma",
    "lemon",
    "lime",
    "grape",
    "strawberry",
    "blueberry",
    "raspberry",
    "blackberry",
    "berry",
    "melon",
    "watermelon",
    "pineapple",
    "mango",
    "peach",
    "nectarine",
    "pear",
    "plum",
    "kiwi",
    "avocado",
    "tomato",
    "potato",
    "sweet potato",
    "onion",
    "spring onion",
    "garlic",
    "ginger",
    "carrot",
    "celery",
    "cucumber",
    "lettuce",
    "spinach",
    "kale",
    "cabbage",
    "broccoli",
    "cauliflower",
    "sprout",
    "bell pepper",
    "mushroom",
    "courgette",
    "zucchini",
    "aubergine",
    "eggplant",
    "sweetcorn",
    "green bean",
    "asparagus",
    "leek",
    "radish",
    "beetroot",
    "butternut",
    "squash",
    "pumpkin",
    "basil",
    "coriander",
    "cilantro",
    "parsley",
    "mint",
    "rosemary",
    "salad",
    "fruit",
    "veg",
    "vegetable",
    "banana bunch",
    "chilli",
    "chili",
  ],
  Bakery: [
    "bread",
    "loaf",
    "roll",
    "bun",
    "bagel",
    "baguette",
    "croissant",
    "muffin",
    "tortilla",
    "pitta",
    "pita",
    "wrap",
    "cake",
    "doughnut",
    "donut",
    "pastry",
    "brioche",
    "crumpet",
    "naan",
    "sourdough",
    "scone",
    "focaccia",
    "ciabatta",
  ],
  "Dairy & Eggs": [
    "milk",
    "oat milk",
    "almond milk",
    "soy milk",
    "cheese",
    "cheddar",
    "mozzarella",
    "parmesan",
    "feta",
    "halloumi",
    "brie",
    "butter",
    "margarine",
    "yogurt",
    "yoghurt",
    "cream",
    "sour cream",
    "creme fraiche",
    "cottage cheese",
    "egg",
    "custard",
    "buttermilk",
    "ghee",
  ],
  "Meat & Fish": [
    "chicken",
    "beef",
    "pork",
    "lamb",
    "turkey",
    "bacon",
    "sausage",
    "ham",
    "mince",
    "steak",
    "rib",
    "salami",
    "pepperoni",
    "chorizo",
    "fish",
    "salmon",
    "tuna",
    "cod",
    "haddock",
    "prawn",
    "shrimp",
    "crab",
    "lobster",
    "mussel",
    "squid",
    "mackerel",
    "sardine",
    "trout",
    "burger",
    "meatball",
  ],
  Pantry: [
    "rice",
    "pasta",
    "spaghetti",
    "penne",
    "noodle",
    "flour",
    "sugar",
    "salt",
    "pepper",
    "oil",
    "olive oil",
    "vinegar",
    "stock",
    "broth",
    "sauce",
    "ketchup",
    "mayonnaise",
    "mayo",
    "mustard",
    "honey",
    "jam",
    "marmalade",
    "peanut butter",
    "cereal",
    "oat",
    "porridge",
    "granola",
    "muesli",
    "bean",
    "lentil",
    "chickpea",
    "soup",
    "curry",
    "spice",
    "cumin",
    "paprika",
    "cinnamon",
    "oregano",
    "thyme",
    "yeast",
    "baking powder",
    "bicarbonate",
    "cornflour",
    "cocoa",
    "couscous",
    "quinoa",
    "tofu",
    "coconut milk",
    "tahini",
    "soy sauce",
    "sriracha",
    "pesto",
    "gravy",
    "breadcrumb",
    "syrup",
    "sweetener",
    "tin tomato",
    "passata",
    "stock cube",
  ],
  Frozen: [
    "frozen",
    "ice cream",
    "sorbet",
    "ice lolly",
    "fish finger",
    "ice cube",
    "gelato",
  ],
  Drinks: [
    "water",
    "sparkling water",
    "juice",
    "orange juice",
    "coffee",
    "tea",
    "teabag",
    "cola",
    "coke",
    "lemonade",
    "soda",
    "beer",
    "lager",
    "wine",
    "cider",
    "gin",
    "vodka",
    "whisky",
    "whiskey",
    "rum",
    "prosecco",
    "champagne",
    "smoothie",
    "milkshake",
    "energy drink",
    "tonic",
    "kombucha",
    "cordial",
  ],
  Snacks: [
    "crisp",
    "chip",
    "cracker",
    "biscuit",
    "cookie",
    "chocolate",
    "sweet",
    "candy",
    "popcorn",
    "nut",
    "peanut",
    "almond",
    "cashew",
    "pistachio",
    "raisin",
    "cereal bar",
    "granola bar",
    "pretzel",
    "olive",
    "dip",
    "hummus",
    "salsa",
    "chewing gum",
    "gum",
    "flapjack",
  ],
  Household: [
    "toilet paper",
    "toilet roll",
    "loo roll",
    "kitchen roll",
    "paper towel",
    "bin bag",
    "bin liner",
    "washing up liquid",
    "dish soap",
    "detergent",
    "washing powder",
    "fabric softener",
    "bleach",
    "cleaner",
    "sponge",
    "cling film",
    "foil",
    "tin foil",
    "candle",
    "battery",
    "light bulb",
    "laundry",
    "air freshener",
    "surface spray",
    "dishwasher tablet",
    "match",
    "lighter",
  ],
  "Health & Beauty": [
    "shampoo",
    "conditioner",
    "shower gel",
    "soap",
    "toothpaste",
    "toothbrush",
    "floss",
    "mouthwash",
    "deodorant",
    "razor",
    "shaving foam",
    "moisturiser",
    "moisturizer",
    "sun cream",
    "sunscreen",
    "hand cream",
    "plaster",
    "painkiller",
    "paracetamol",
    "ibuprofen",
    "vitamin",
    "cotton pad",
    "tampon",
    "sanitary",
    "makeup",
    "face wash",
    "lip balm",
    "tissue",
    "hand sanitiser",
    "hand sanitizer",
  ],
  Baby: [
    "nappy",
    "diaper",
    "baby wipe",
    "formula",
    "baby food",
    "dummy",
    "baby milk",
    "baby lotion",
  ],
  Pet: [
    "dog food",
    "cat food",
    "cat litter",
    "dog treat",
    "cat treat",
    "pet food",
    "kibble",
    "bird seed",
  ],
};

const KEYWORD_TO_AISLE = new Map<string, string>();
for (const [aisle, keywords] of Object.entries(AISLE_KEYWORDS)) {
  for (const keyword of keywords) KEYWORD_TO_AISLE.set(keyword, aisle);
}

// Longest first so "oat milk" beats "milk" and "sweet potato" beats "sweet".
const PHRASE_KEYWORDS = Array.from(KEYWORD_TO_AISLE.keys())
  .filter((keyword) => keyword.includes(" "))
  .sort((a, b) => b.length - a.length);

// Units we recognise directly after a leading number. "x" is treated as a bare
// multiplier ("2x milk" -> quantity "2").
const UNIT_PATTERN =
  "kg|g|lb|lbs|oz|l|ml|cl|litre|litres|liter|liters|pint|pints|pk|pack|packs|" +
  "dozen|dz|bunch|bunches|tin|tins|can|cans|jar|jars|box|boxes|bag|bags|" +
  "bottle|bottles|loaf|loaves|punnet|punnets|slice|slices|x";

const LEADING_QUANTITY = new RegExp(
  `^(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(${UNIT_PATTERN})?\\s+(\\S.*)$`,
  "i",
);
const TRAILING_QUANTITY = /^(\S.*?)\s+(?:[x×]\s*(\d{1,4})|(\d{1,4})\s*[x×])$/i;
const TRAILING_CATEGORY = /^(\S.*?)\s+#([a-z0-9][a-z0-9 &'-]*)$/i;

interface ParsedItemInput {
  text: string;
  quantity?: string;
  category?: string;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function capitaliseFirst(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function titleCase(value: string) {
  return collapseWhitespace(value)
    .split(" ")
    .map((word) => capitaliseFirst(word.toLowerCase()))
    .join(" ");
}

/** Candidate singular forms so "grapes" and "tomatoes" still match keywords. */
function singularForms(word: string) {
  const forms = [word];
  if (word.endsWith("ies") && word.length > 4)
    forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) forms.push(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 2) {
    forms.push(word.slice(0, -1));
  }
  return forms;
}

/**
 * Best-guess aisle for an item name, or undefined when we aren't confident.
 * Returning undefined on purpose keeps auto-grouping trustworthy: unknown
 * items simply fall into "General" rather than a wrong aisle.
 */
export function guessCategory(text: string): string | undefined {
  const cleaned = collapseWhitespace(
    text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " "),
  );
  if (!cleaned) return undefined;

  for (const phrase of PHRASE_KEYWORDS) {
    if (cleaned.includes(phrase)) return KEYWORD_TO_AISLE.get(phrase);
  }

  for (const word of cleaned.split(" ")) {
    for (const form of singularForms(word)) {
      const aisle = KEYWORD_TO_AISLE.get(form);
      if (aisle) return aisle;
    }
  }

  return undefined;
}

/** Turn one typed line into item text, quantity and category. */
export function parseItemInput(raw: string): ParsedItemInput {
  let working = collapseWhitespace(raw).slice(0, MAX_ITEM_TEXT_LENGTH);
  let quantity: string | undefined;
  let explicitCategory: string | undefined;

  const categoryMatch = working.match(TRAILING_CATEGORY);
  if (categoryMatch) {
    working = categoryMatch[1];
    explicitCategory = titleCase(categoryMatch[2]).slice(
      0,
      MAX_CATEGORY_LENGTH,
    );
  }

  const trailingMatch = working.match(TRAILING_QUANTITY);
  if (trailingMatch) {
    working = trailingMatch[1];
    quantity = trailingMatch[2] ?? trailingMatch[3];
  } else {
    const leadingMatch = working.match(LEADING_QUANTITY);
    if (leadingMatch) {
      const [, amount, unit, rest] = leadingMatch;
      working = rest;
      const normalisedUnit = unit?.toLowerCase();
      quantity =
        normalisedUnit && normalisedUnit !== "x"
          ? `${amount} ${normalisedUnit}`
          : amount;
    }
  }

  const text = capitaliseFirst(collapseWhitespace(working));

  // A bare "1" adds nothing but noise on the row.
  if (quantity === "1") quantity = undefined;

  return {
    text,
    quantity: quantity?.slice(0, MAX_QUANTITY_LENGTH),
    category: explicitCategory ?? guessCategory(text),
  };
}

interface QuantityParts {
  count: number;
  unit: string;
}

function parseQuantityParts(value: string | undefined): QuantityParts | null {
  if (!value) return { count: 1, unit: "" };

  const match = collapseWhitespace(value).match(/^(\d{1,4})\s*([a-z]*)$/i);
  if (!match) return null;

  return { count: Number(match[1]), unit: match[2].toLowerCase() };
}

/**
 * Combine the quantity already on the list with a newly added one, so adding
 * "milk" twice becomes a single row of 2 rather than two identical rows.
 * Returns the existing value untouched when the amounts can't be added up
 * (free-text quantities, or mismatched units).
 */
export function mergeQuantities(
  existing: string | undefined,
  incoming: string | undefined,
): string | undefined {
  const current = parseQuantityParts(existing);
  const added = parseQuantityParts(incoming);
  if (!current || !added) return existing;
  if (current.unit && added.unit && current.unit !== added.unit)
    return existing;

  const unit = current.unit || added.unit;
  const total = Math.min(current.count + added.count, 9999);
  return unit ? `${total} ${unit}` : String(total);
}

/** Display form for a quantity chip: bare numbers read better as "x2". */
export function formatQuantity(value: string) {
  return /^\d+$/.test(value.trim()) ? `x${value.trim()}` : value;
}

/** Case/whitespace-insensitive key for spotting an item already on a list. */
export function getDuplicateKey(text: string) {
  return collapseWhitespace(text).toLowerCase();
}
