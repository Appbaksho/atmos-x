/**
 * Species data for the Plan flow: the 20-tree catalog (S10), the recommended-species strip (S10)
 * and species detail (S11). Neem is the prototype's fully specified species; the others follow the
 * same shape so /species/[id] works for every card that links to it.
 */
import type { Lang } from '@/lib/cz/format';

const U = (id: string, w: number, h: number, x = '') => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70${x}`;
const NEEM_IMG = '1663074898186-21b020623d09';
const NURSERY_IMG = '1523284998774-f6d3960be911';
const SAPLING_IMG = '1683994857980-280afa59a3f8';

/** Catalog category: s shade, f flowering, r fruit, n narrow lanes. */
export type Cat = 's' | 'f' | 'r' | 'n';
/** [id, English, Bangla, Urdu, scientific, category, canopy m, price low ৳, price high ৳, listed online (1) or estimate (0)] */
export type TreeRow = [string, string, string, string, string, Cat, number, number, number, 0 | 1];

export const TREES: TreeRow[] = [
  ['neem', 'Neem', 'নিম', 'نیم', 'Azadirachta indica', 's', 10, 60, 60, 1],
  ['krish', 'Krishnachura', 'কৃষ্ণচূড়া', 'گل مہر', 'Delonix regia', 'f', 14, 140, 200, 1],
  ['arjun', 'Arjun', 'অর্জুন', 'ارجن', 'Terminalia arjuna', 's', 12, 110, 350, 1],
  ['jarul', 'Jarul', 'জারুল', 'جارول', 'Lagerstroemia speciosa', 'f', 8, 90, 90, 1],
  ['bokul', 'Bokul', 'বকুল', 'مولسری', 'Mimusops elengi', 'n', 8, 70, 160, 1],
  ['kadam', 'Kadam', 'কদম', 'کدم', 'Neolamarckia cadamba', 's', 12, 80, 150, 0],
  ['sonalu', 'Sonalu', 'সোনালু', 'املتاس', 'Cassia fistula', 'f', 7, 80, 150, 0],
  ['radha', 'Radhachura', 'রাধাচূড়া', 'پیلا گل مہر', 'Peltophorum pterocarpum', 'f', 12, 100, 180, 0],
  ['rain', 'Rain tree', 'রেইনট্রি', 'رین ٹری', 'Samanea saman', 's', 20, 60, 120, 0],
  ['kanchan', 'Kanchan', 'কাঞ্চন', 'کچنار', 'Bauhinia variegata', 'n', 6, 100, 200, 0],
  ['pitraj', 'Pitraj', 'পিতরাজ', 'پترج', 'Aphanamixis polystachya', 's', 9, 60, 120, 0],
  ['chhatim', 'Chhatim', 'ছাতিম', 'چھتون', 'Alstonia scholaris', 's', 10, 100, 200, 0],
  ['debdaru', 'Debdaru', 'দেবদারু', 'اشوک', 'Polyalthia longifolia', 'n', 4, 80, 150, 0],
  ['bot', 'Banyan', 'বট', 'برگد', 'Ficus benghalensis', 's', 25, 150, 300, 0],
  ['peepal', 'Peepal', 'অশ্বত্থ', 'پیپل', 'Ficus religiosa', 's', 18, 150, 300, 0],
  ['jam', 'Jamun', 'কালোজাম', 'جامن', 'Syzygium cumini', 'r', 11, 80, 150, 0],
  ['aam', 'Mango', 'আম', 'آم', 'Mangifera indica', 'r', 12, 120, 250, 0],
  ['kathal', 'Jackfruit', 'কাঁঠাল', 'کٹہل', 'Artocarpus heterophyllus', 'r', 10, 100, 200, 0],
  ['tetul', 'Tamarind', 'তেঁতুল', 'املی', 'Tamarindus indica', 'r', 12, 80, 150, 0],
  ['champa', 'Champa', 'চাঁপা', 'چمپا', 'Magnolia champaca', 'n', 7, 150, 250, 0],
];

/** Pollen level per species (1 some, 2 high). */
export const POLLEN: Record<string, 1 | 2> = { neem: 1, rain: 1, jam: 1, aam: 2, chhatim: 2 };

/** Cooling per tree at maturity (°C) from canopy width. */
export const coolOf = (r: TreeRow) => r[6] * 0.0025;
/** Mid sapling price, rounded to ৳10. */
export const midPrice = (r: TreeRow) => Math.round((r[7] + r[8]) / 20) * 10;
export const treeName = (r: TreeRow, lang: Lang) => (lang === 'bn' ? r[2] : lang === 'ur' ? r[3] : r[1]);

/** Recommended species strip on S10. */
export const RECOMMENDED = [
  { key: 'neem', name: 'Neem', sci: 'Azadirachta indica', tag: 'Tree · shade + hardy', src: U(NEEM_IMG, 320, 220, '&crop=focalpoint&fp-x=.8&fp-y=.5&fp-z=2.2') },
  { key: 'krish', name: 'Krishnachura', sci: 'Delonix regia', tag: 'Tree · wide canopy', src: U(NURSERY_IMG, 320, 220) },
  { key: 'arjun', name: 'Arjun', sci: 'Terminalia arjuna', tag: 'Tree · roadside', src: U(NEEM_IMG, 320, 220, '&crop=focalpoint&fp-x=.2&fp-y=.5&fp-z=2.4') },
  { key: 'madhabilata', name: 'Madhabilata', sci: 'Hiptage benghalensis', tag: 'Climber · walls', src: U(SAPLING_IMG, 320, 220) },
];

export type SpeciesDetail = {
  key: string;
  name: Record<Lang, string>;
  sci: string;
  img: string;
  localNames: [string, string][];
  /** [label, value, sub] */
  facts: [string, string, string][];
  /** Cooling per tree at maturity, °C (positive = cooling) */
  perTree: number;
  /** Flowering months, 0 = Jan */
  bloom: number[];
  care: string[];
  price: [number, number];
  /** How many are already in the team's plan */
  planQty: number;
  /** Name used on nursery stock lists */
  stock: string;
};

const CARE_TREE = [
  'Water twice a week for the first 12 months, then only in dry spells.',
  'Street trees need a guard — goats, bikes and rickshaws.',
  'Plant in monsoon, June to September.',
  'Keep 3 m from walls, drains and pipes.',
];

export const DETAIL: Record<string, SpeciesDetail> = {
  neem: {
    key: 'neem',
    name: { en: 'Neem', bn: 'নিম', ur: 'نیم' },
    sci: 'Azadirachta indica A.Juss.',
    img: U(NEEM_IMG, 900, 800),
    localNames: [['নিম', 'Bengali'], ['نیم', 'Urdu'], ['Margosa', 'English']],
    facts: [['Height', '15–20 m', 'at maturity'], ['Canopy', '8–12 m', 'wide, dense'], ['Growth', 'Fast', '≈ 1 m a year'], ['Water need', 'Low', 'after year one']],
    perTree: 0.025,
    bloom: [2, 3, 4],
    care: CARE_TREE,
    price: [150, 300],
    planQty: 12,
    stock: 'Neem',
  },
  krish: {
    key: 'krish',
    name: { en: 'Krishnachura', bn: 'কৃষ্ণচূড়া', ur: 'گل مہر' },
    sci: 'Delonix regia (Bojer ex Hook.) Raf.',
    img: U(NURSERY_IMG, 900, 800),
    localNames: [['কৃষ্ণচূড়া', 'Bengali'], ['گل مہر', 'Urdu'], ['Flame tree', 'English']],
    facts: [['Height', '10–12 m', 'at maturity'], ['Canopy', '12–15 m', 'wide, umbrella'], ['Growth', 'Fast', '≈ 1.5 m a year'], ['Water need', 'Medium', 'in dry spells']],
    perTree: 0.035,
    bloom: [3, 4, 5],
    care: [CARE_TREE[0], CARE_TREE[1], CARE_TREE[2], 'Shallow roots — keep 4 m from walls, drains and paving.'],
    price: [140, 200],
    planQty: 12,
    stock: 'Krishnachura',
  },
  arjun: {
    key: 'arjun',
    name: { en: 'Arjun', bn: 'অর্জুন', ur: 'ارجن' },
    sci: 'Terminalia arjuna (Roxb. ex DC.) Wight & Arn.',
    img: U(NEEM_IMG, 900, 800, '&crop=focalpoint&fp-x=.2&fp-y=.5&fp-z=1.6'),
    localNames: [['অর্জুন', 'Bengali'], ['ارجن', 'Urdu'], ['Arjuna', 'English']],
    facts: [['Height', '20–25 m', 'at maturity'], ['Canopy', '10–12 m', 'evergreen'], ['Growth', 'Medium', '≈ 0.6 m a year'], ['Water need', 'Low', 'tolerates floods']],
    perTree: 0.03,
    bloom: [3, 4, 5, 6],
    care: CARE_TREE,
    price: [110, 350],
    planQty: 0,
    stock: 'Arjun',
  },
  madhabilata: {
    key: 'madhabilata',
    name: { en: 'Madhabilata', bn: 'মাধবীলতা', ur: 'مادھوی لتا' },
    sci: 'Hiptage benghalensis (L.) Kurz',
    img: U(SAPLING_IMG, 900, 800),
    localNames: [['মাধবীলতা', 'Bengali'], ['مادھوی لتا', 'Urdu'], ['Hiptage', 'English']],
    facts: [['Height', '3–6 m', 'on a trellis'], ['Wall cover', '4–6 m²', 'per plant'], ['Growth', 'Fast', '≈ 2 m a year'], ['Water need', 'Medium', 'keep roots moist']],
    perTree: 0.007,
    bloom: [1, 2, 3],
    care: ['Water every other day for the first 3 months, then twice a week.', 'Give it a trellis or wire mesh 10 cm off the wall.', 'Plant in monsoon, June to September.', 'Trim after flowering to keep it off gutters and wires.'],
    price: [80, 150],
    planQty: 30,
    stock: 'Madhabilata',
  },
};

/** Detail for any catalog species; unknown ids fall back to Neem. */
export function speciesDetail(id: string): SpeciesDetail {
  if (DETAIL[id]) return DETAIL[id];
  const r = TREES.find((x) => x[0] === id);
  if (!r) return DETAIL.neem;
  return {
    key: r[0],
    name: { en: r[1], bn: r[2], ur: r[3] },
    sci: r[4],
    img: U(NEEM_IMG, 900, 800, '&crop=focalpoint&fp-x=.5&fp-y=.5&fp-z=1.4'),
    localNames: [[r[2], 'Bengali'], [r[3], 'Urdu']],
    facts: [
      ['Canopy', `${r[6]} m`, 'at maturity'],
      ['Type', { s: 'Shade', f: 'Flowering', r: 'Fruit', n: 'Narrow lanes' }[r[5]], r[6] >= 18 ? 'needs 20 m clear' : 'street friendly'],
      ['Sapling', r[7] === r[8] ? `৳ ${r[7]}` : `৳ ${r[7]}–${r[8]}`, r[9] ? 'listed online' : 'est. market price'],
      ['Pollen', POLLEN[r[0]] === 2 ? 'High' : POLLEN[r[0]] ? 'Some' : 'Low', 'for allergy-prone streets'],
    ],
    perTree: coolOf(r),
    bloom: [],
    care: CARE_TREE,
    price: [r[7], r[8]],
    planQty: 0,
    stock: r[1],
  };
}
