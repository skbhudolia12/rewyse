import type { ListingCategory } from '@/types/domain';

/**
 * Golden set for the pricing model.
 *
 * `band` is the range of base values (INR, second-hand, assumed working) a
 * reasonable campus seller would accept as right. It is wide on purpose: the
 * eval catches answers that are wrong, not answers that differ from ours by
 * a few hundred rupees.
 *
 * Every item's reviewed answer is written to demo-assets/model-answers.json,
 * which `npm run seed:demo` uses for the seeded feed: the "How this price was
 * set" note on each demo listing is the model's real output, checked here.
 *
 * `demo: true` items are the ones listed on camera. Their reviewed answers are
 * frozen into price_cache by `npm run seed:demo`, so every take of the video
 * shows the same answer. Type exactly these fields when recording; any change
 * to the text is a different cache key and a fresh, unreviewed model call.
 * To demo different items, edit them here and re-run `npm run eval:pricing`.
 */
export interface GoldenItem {
  slug: string;
  category: ListingCategory;
  title: string;
  cosmeticFlaws?: string;
  accessories?: string;
  description?: string;
  band: [number, number];
  demo?: boolean;
}

export const GOLDEN_ITEMS: GoldenItem[] = [
  {
    slug: 'dell-monitor',
    demo: true,
    category: 'electronics',
    title: 'Dell 24" IPS monitor P2419H',
    cosmeticFlaws: 'Minor scuffs on the stand',
    accessories: 'Power cable and HDMI cable',
    description: 'Bought in 2023 for my room. No dead pixels and the stand adjusts fully.',
    band: [4500, 10000],
  },
  {
    slug: 'mini-fridge',
    demo: true,
    category: 'appliances',
    title: 'Godrej 45L mini fridge',
    cosmeticFlaws: 'Small dent on the left side',
    accessories: 'Both shelves and the ice tray',
    description: 'Two years old, cools well. Used in my hostel room.',
    band: [3500, 9000],
  },
  {
    slug: 'study-chair',
    demo: true,
    category: 'furniture',
    title: 'Ergonomic mesh study chair',
    cosmeticFlaws: 'Armrest padding slightly worn',
    accessories: 'Adjustable headrest',
    description: 'Height and tilt adjust. Comfortable for long study sessions.',
    band: [1200, 5000],
  },
  { slug: 'casio-calculator', category: 'electronics', title: 'Casio fx-991EX scientific calculator', band: [500, 1300] },
  { slug: 'jbl-speaker', category: 'electronics', title: 'JBL Flip 5 bluetooth speaker', accessories: 'Charging cable', band: [3000, 7500] },
  { slug: 'mx-master', category: 'electronics', title: 'Logitech MX Master 3 mouse', band: [3000, 7000] },
  { slug: 'sony-xm4', category: 'electronics', title: 'Sony WH-1000XM4 noise cancelling headphones', accessories: 'Case and cable', band: [8000, 17000] },
  { slug: 'hp-laptop', category: 'electronics', title: 'HP Pavilion 15 laptop, i5 11th gen, 8GB RAM', cosmeticFlaws: 'Light scratches on the lid', band: [18000, 40000] },
  { slug: 'kettle', category: 'appliances', title: 'Philips 1.5L electric kettle', band: [400, 1300] },
  { slug: 'induction', category: 'appliances', title: 'Prestige induction cooktop 1600W', band: [800, 2500] },
  { slug: 'table-fan', category: 'appliances', title: 'Usha table fan, 3 speed', band: [600, 1800] },
  { slug: 'bookshelf', category: 'furniture', title: 'Wooden bookshelf, 4 shelves', band: [700, 3000] },
  { slug: 'gate-books', category: 'books', title: 'GATE CS preparation book set, 6 books', description: 'Made Easy series with solved papers', band: [500, 2500] },
  { slug: 'clrs', category: 'books', title: 'Introduction to Algorithms (CLRS), 3rd edition', band: [300, 1200] },
  { slug: 'cycle', category: 'other', title: 'Hero single speed bicycle', accessories: 'Lock and key', band: [1500, 5000] },
  { slug: 'samsung-monitor', category: 'electronics', title: 'Samsung 27" curved monitor C27F390', accessories: 'HDMI cable', band: [5000, 11000] },
  { slug: 'power-bank', category: 'electronics', title: 'Mi 20000mAh power bank', band: [600, 1600] },
  { slug: 'boat-headphones', category: 'electronics', title: 'boAt Rockerz 450 bluetooth headphones', band: [500, 1500] },
  { slug: 'k380', category: 'electronics', title: 'Logitech K380 bluetooth keyboard', band: [1200, 2800] },
  { slug: 'kindle', category: 'electronics', title: 'Kindle Paperwhite 10th generation', cosmeticFlaws: 'Small scratch on the back', band: [4000, 9000] },
  { slug: 'heater', category: 'appliances', title: 'Bajaj 2000W room heater', band: [700, 2200] },
  { slug: 'steam-iron', category: 'appliances', title: 'Philips steam iron 1440W', band: [500, 1600] },
  { slug: 'badminton', category: 'other', title: 'Yonex Nanoray badminton racket', accessories: 'Cover', band: [800, 3000] },
  { slug: 'football', category: 'other', title: 'Cosco football, size 5', band: [200, 800] },
  { slug: 'wooden-stool', category: 'furniture', title: 'Solid sheesham wood stool', band: [300, 1500] },
  { slug: 'bedside-table', category: 'furniture', title: 'Wooden bedside cabinet with drawer', band: [600, 3000] },
  { slug: 'desk-lamp', category: 'furniture', title: 'Desk lamp with fabric shade', band: [300, 1500] },
  { slug: 'whiteboard', category: 'other', title: 'Whiteboard 2x3 ft with markers', accessories: 'Four markers and a duster', band: [400, 1800] },
  { slug: 'backpack', category: 'other', title: 'Wildcraft 45L backpack', band: [700, 2200] },
];
