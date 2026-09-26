export interface Food {
  id: string;
  name: string;
  emoji: string;
  healthy: boolean;
  satiety: number;
  energy: number;
  hydration: number;
  mood: number;
  /** Direct body-fat impact (negative = supports fat loss). */
  fat: number;
  /** Protein boosts the gains of the next workout. */
  protein?: boolean;
  price: number;
  desc: string;
}

export const FOODS: Record<string, Food> = {
  poke: { id: 'poke', name: 'פוקי סלמון', emoji: '🍣', healthy: true, satiety: 45, energy: 22, hydration: 4, mood: 8, fat: -0.4, protein: true, price: 32, desc: 'חלבון, אבוקדו ואורז — דלק לאימון' },
  salad: { id: 'salad', name: 'סלט ירוק', emoji: '🥗', healthy: true, satiety: 28, energy: 14, hydration: 8, mood: 4, fat: -0.6, price: 22, desc: 'קליל, רענן ומלא ויטמינים' },
  oats: { id: 'oats', name: 'שיבולת שועל ופירות', emoji: '🥣', healthy: true, satiety: 35, energy: 25, hydration: 2, mood: 6, fat: -0.2, price: 18, desc: 'אנרגיה איטית לכל הבוקר' },
  omelet: { id: 'omelet', name: 'חביתת ירק', emoji: '🍳', healthy: true, satiety: 32, energy: 16, hydration: 0, mood: 5, fat: -0.2, protein: true, price: 20, desc: 'חלבון נקי לשרירים' },
  smoothie: { id: 'smoothie', name: 'שייק ירוק', emoji: '🥤', healthy: true, satiety: 18, energy: 18, hydration: 18, mood: 7, fat: -0.3, price: 20, desc: 'בננה, תרד וחמאת בוטנים' },
  chicken: { id: 'chicken', name: 'עוף ואורז', emoji: '🍗', healthy: true, satiety: 48, energy: 20, hydration: 0, mood: 6, fat: -0.2, protein: true, price: 34, desc: 'ארוחת ספורטאים קלאסית' },
  fruit: { id: 'fruit', name: 'קערת פירות', emoji: '🍓', healthy: true, satiety: 15, energy: 12, hydration: 10, mood: 6, fat: -0.2, price: 12, desc: 'מתוק — בלי רגשות אשם' },
  avocado: { id: 'avocado', name: 'טוסט אבוקדו', emoji: '🥑', healthy: true, satiety: 30, energy: 16, hydration: 2, mood: 7, fat: 0, price: 24, desc: 'שומן טוב ושובע' },
  burger: { id: 'burger', name: 'המבורגר כפול', emoji: '🍔', healthy: false, satiety: 55, energy: 8, hydration: -6, mood: 14, fat: 5.5, price: 38, desc: 'טעים... אבל הגוף ירגיש את זה' },
  pizza: { id: 'pizza', name: 'פיצה משפחתית', emoji: '🍕', healthy: false, satiety: 50, energy: 6, hydration: -5, mood: 14, fat: 5, price: 34, desc: 'עוד משולש? ועוד אחד?' },
  donut: { id: 'donut', name: 'דונאט שוקולד', emoji: '🍩', healthy: false, satiety: 14, energy: 12, hydration: -2, mood: 12, fat: 3, price: 12, desc: 'קפיצת סוכר ואז נפילה' },
  fries: { id: 'fries', name: 'צ׳יפס גדול', emoji: '🍟', healthy: false, satiety: 30, energy: 4, hydration: -8, mood: 10, fat: 3.8, price: 16, desc: 'מלוח, שמנוני, ממכר' },
  icecream: { id: 'icecream', name: 'גלידה', emoji: '🍦', healthy: false, satiety: 16, energy: 8, hydration: 0, mood: 14, fat: 2.8, price: 14, desc: 'פינוק קר ומתוק' },
  cake: { id: 'cake', name: 'עוגת שוקולד', emoji: '🍰', healthy: false, satiety: 22, energy: 10, hydration: -2, mood: 15, fat: 3.5, price: 18, desc: 'פרוסה אחת זה אף פעם לא פרוסה אחת' },
  soda: { id: 'soda', name: 'קולה', emoji: '🥫', healthy: false, satiety: 4, energy: 10, hydration: 4, mood: 8, fat: 2, price: 8, desc: '10 כפיות סוכר בפחית' },
};

export const MENUS = {
  fridge: ['salad', 'oats', 'omelet', 'fruit', 'avocado', 'cake', 'icecream', 'soda'],
  cafe: ['poke', 'smoothie', 'chicken', 'salad', 'avocado', 'donut'],
  foodtruck: ['burger', 'pizza', 'fries', 'donut', 'icecream', 'soda'],
  delivery: ['poke', 'chicken', 'salad', 'burger', 'pizza', 'fries'],
} as const;
