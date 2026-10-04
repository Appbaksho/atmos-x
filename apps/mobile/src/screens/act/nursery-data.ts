/** Curated nurseries near Asad Gate block (S12, S11 "Price & where"). From the prototype's `N` list. */
const U = (id: string, w: number, h: number, x = '') => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70${x}`;

export type Nursery = {
  name: string;
  /** km */
  dist: number;
  hours: string;
  /** Closes before evening (hidden by "Open now") */
  closing: boolean;
  stock: string[];
  /** Pin position on the map, % */
  x: number;
  y: number;
  img: string;
  /** Stock count / price line for species pages */
  meta: string;
};

export const NURSERIES: Nursery[] = [
  { name: 'Mohammadpur Krishi Nursery', dist: 0.8, hours: 'Open · till 18:00', closing: false, stock: ['Neem', 'Arjun'], x: 42, y: 30, img: U('1523284998774-f6d3960be911', 240, 240), meta: '40 in stock · ৳ 180' },
  { name: 'Agargaon Nursery Market', dist: 1.9, hours: 'Open · till 19:00', closing: false, stock: ['Neem', 'Krishnachura', 'Arjun'], x: 70, y: 18, img: U('1683994857980-280afa59a3f8', 240, 240), meta: '120+ in stock · ৳ 150–300' },
  { name: 'Dhanmondi Lake Nursery', dist: 2.4, hours: 'Closes 17:00', closing: true, stock: ['Neem', 'Madhabilata'], x: 60, y: 84, img: U('1523284998774-f6d3960be911', 240, 240, '&crop=focalpoint&fp-x=.7&fp-y=.6&fp-z=2'), meta: 'In stock · ৳ 150–250' },
];

export const mapsUrl = (name: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ', Dhaka');
