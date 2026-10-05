import 'server-only';

/**
 * Curated Bangladesh species, ported from apps/mobile/src/screens/plan/species-data.ts.
 * Row: [id, English, Bangla, Urdu, scientific, category, canopy m, price low ৳, price high ৳, listed online (1) or estimate (0)]
 */
export type Cat = 's' | 'f' | 'r' | 'n';
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

const U = (id: string, w: number, h: number, x = '') => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70${x}`;
export const NEEM_IMG = '1663074898186-21b020623d09';
export const NURSERY_IMG = '1523284998774-f6d3960be911';
export const SAPLING_IMG = '1683994857980-280afa59a3f8';
export const img = U;

/** Pollen level per species (1 some, 2 high). */
export const POLLEN: Record<string, 1 | 2> = { neem: 1, rain: 1, jam: 1, aam: 2, chhatim: 2 };

/** Detailed species from the prototype (facts are English; names are localised). */
export const DETAIL: Record<
  string,
  { names: { en: string; bn: string; ur: string }; sci: string; img: string; facts: [string, string, string][]; water: 'high' | 'medium' | 'low'; growth: string; bloom: number[]; care: 'tree' | 'neem' | 'krish' | 'climber'; price: [number, number]; canopy: number }
> = {
  neem: {
    names: { en: 'Neem', bn: 'নিম', ur: 'نیم' },
    sci: 'Azadirachta indica A.Juss.',
    img: U(NEEM_IMG, 900, 800),
    facts: [['Height', '15–20 m', 'at maturity'], ['Canopy', '8–12 m', 'wide, dense'], ['Growth', 'Fast', '≈ 1 m a year'], ['Water need', 'Low', 'after year one']],
    water: 'low',
    growth: 'Fast, ≈ 1 m a year',
    bloom: [2, 3, 4],
    care: 'tree',
    price: [150, 300],
    canopy: 10,
  },
  krish: {
    names: { en: 'Krishnachura', bn: 'কৃষ্ণচূড়া', ur: 'گل مہر' },
    sci: 'Delonix regia (Bojer ex Hook.) Raf.',
    img: U(NURSERY_IMG, 900, 800),
    facts: [['Height', '10–12 m', 'at maturity'], ['Canopy', '12–15 m', 'wide, umbrella'], ['Growth', 'Fast', '≈ 1.5 m a year'], ['Water need', 'Medium', 'in dry spells']],
    water: 'medium',
    growth: 'Fast, ≈ 1.5 m a year',
    bloom: [3, 4, 5],
    care: 'krish',
    price: [140, 200],
    canopy: 14,
  },
  arjun: {
    names: { en: 'Arjun', bn: 'অর্জুন', ur: 'ارجن' },
    sci: 'Terminalia arjuna (Roxb. ex DC.) Wight & Arn.',
    img: U(NEEM_IMG, 900, 800, '&crop=focalpoint&fp-x=.2&fp-y=.5&fp-z=1.6'),
    facts: [['Height', '20–25 m', 'at maturity'], ['Canopy', '10–12 m', 'evergreen'], ['Growth', 'Medium', '≈ 0.6 m a year'], ['Water need', 'Low', 'tolerates floods']],
    water: 'low',
    growth: 'Medium, ≈ 0.6 m a year',
    bloom: [3, 4, 5, 6],
    care: 'tree',
    price: [110, 350],
    canopy: 12,
  },
  madhabilata: {
    names: { en: 'Madhabilata', bn: 'মাধবীলতা', ur: 'مادھوی لتا' },
    sci: 'Hiptage benghalensis (L.) Kurz',
    img: U(SAPLING_IMG, 900, 800),
    facts: [['Height', '3–6 m', 'on a trellis'], ['Wall cover', '4–6 m²', 'per plant'], ['Growth', 'Fast', '≈ 2 m a year'], ['Water need', 'Medium', 'keep roots moist']],
    water: 'medium',
    growth: 'Fast, ≈ 2 m a year',
    bloom: [1, 2, 3],
    care: 'climber',
    price: [80, 150],
    canopy: 3,
  },
};

/** Care notes (prototype's CARE_TREE) in en / bn / ur. */
export const CARE: Record<'tree' | 'krish' | 'climber', Record<'en' | 'bn' | 'ur', string[]>> = {
  tree: {
    en: [
      'Water twice a week for the first 12 months, then only in dry spells.',
      'Street trees need a guard — goats, bikes and rickshaws.',
      'Plant in monsoon, June to September.',
      'Keep 3 m from walls, drains and pipes.',
    ],
    bn: [
      'প্রথম ১২ মাস সপ্তাহে দুবার পানি দিন, পরে শুধু শুকনো সময়ে।',
      'রাস্তার গাছে খাঁচা দিন — ছাগল, সাইকেল ও রিকশা থেকে রক্ষা করতে।',
      'বর্ষায় লাগান, জুন থেকে সেপ্টেম্বর।',
      'দেয়াল, নালা ও পাইপ থেকে ৩ মিটার দূরে রাখুন।',
    ],
    ur: [
      'پہلے ۱۲ ماہ ہفتے میں دو بار پانی دیں، پھر صرف خشک موسم میں۔',
      'سڑک کے درختوں کو جنگلہ چاہیے — بکریوں، سائیکلوں اور رکشوں سے بچاؤ کے لیے۔',
      'برسات میں لگائیں، جون سے ستمبر۔',
      'دیواروں، نالیوں اور پائپوں سے ۳ میٹر دور رکھیں۔',
    ],
  },
  krish: {
    en: [
      'Water twice a week for the first 12 months, then only in dry spells.',
      'Street trees need a guard — goats, bikes and rickshaws.',
      'Plant in monsoon, June to September.',
      'Shallow roots — keep 4 m from walls, drains and paving.',
    ],
    bn: [
      'প্রথম ১২ মাস সপ্তাহে দুবার পানি দিন, পরে শুধু শুকনো সময়ে।',
      'রাস্তার গাছে খাঁচা দিন — ছাগল, সাইকেল ও রিকশা থেকে রক্ষা করতে।',
      'বর্ষায় লাগান, জুন থেকে সেপ্টেম্বর।',
      'শিকড় অগভীর — দেয়াল, নালা ও ফুটপাত থেকে ৪ মিটার দূরে রাখুন।',
    ],
    ur: [
      'پہلے ۱۲ ماہ ہفتے میں دو بار پانی دیں، پھر صرف خشک موسم میں۔',
      'سڑک کے درختوں کو جنگلہ چاہیے — بکریوں، سائیکلوں اور رکشوں سے بچاؤ کے لیے۔',
      'برسات میں لگائیں، جون سے ستمبر۔',
      'جڑیں کم گہری — دیواروں، نالیوں اور فرش سے ۴ میٹر دور رکھیں۔',
    ],
  },
  climber: {
    en: [
      'Water every other day for the first 3 months, then twice a week.',
      'Give it a trellis or wire mesh 10 cm off the wall.',
      'Plant in monsoon, June to September.',
      'Trim after flowering to keep it off gutters and wires.',
    ],
    bn: [
      'প্রথম ৩ মাস একদিন পরপর পানি দিন, পরে সপ্তাহে দুবার।',
      'দেয়াল থেকে ১০ সেমি দূরে মাচা বা তারের জাল দিন।',
      'বর্ষায় লাগান, জুন থেকে সেপ্টেম্বর।',
      'ফুল ফোটার পর ছেঁটে দিন যাতে নালা ও তারে না ওঠে।',
    ],
    ur: [
      'پہلے ۳ ماہ ہر دوسرے دن پانی دیں، پھر ہفتے میں دو بار۔',
      'دیوار سے ۱۰ سینٹی میٹر دور جالی یا تار لگائیں۔',
      'برسات میں لگائیں، جون سے ستمبر۔',
      'پھول آنے کے بعد تراشیں تاکہ نالیوں اور تاروں پر نہ چڑھے۔',
    ],
  },
};

export const SEASON: Record<'en' | 'bn' | 'ur', string> = {
  en: 'Monsoon, June to September',
  bn: 'বর্ষা, জুন থেকে সেপ্টেম্বর',
  ur: 'برسات، جون سے ستمبر',
};

/** Cooling per tree at maturity (°C, within ~25 m) from canopy width, as in the prototype. */
export const coolOf = (canopyM: number) => canopyM * 0.0025;
/** Mid sapling price, rounded to ৳10. */
export const midPrice = (lo: number, hi: number) => Math.round((lo + hi) / 20) * 10;
