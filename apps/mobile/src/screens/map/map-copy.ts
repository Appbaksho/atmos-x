/**
 * Copy + demo maths for S05 Heat map, S06 Zone detail and S07 Projection — ported 1:1 from the
 * prototype's `CzMap` dictionaries (T, ZX, DX) and its renderVals() maths.
 */
import type { Lang } from '@/lib/cz/format';

const MAP_EN = {
  title: 'Heat map',
  within: 'Within',
  lst: 'Roof & road',
  airL: 'Air',
  ranked: 'Hottest in your radius',
  count: '24 zones',
  nearTie: 'Near-tie',
  tieNote: 'Scores within ±3 are flagged as near-ties — treat them as equally hot.',
  lstShort: 'LST',
  /** `{d}` = distance in metres (the prototype hard-codes Asad Gate's 180 m) */
  zoneSub: 'Mohammadpur · {d} m from you',
  vhigh: 'Very high',
  high: 'High',
  observed: 'Heat level · observed',
  air: 'Air',
  feels: 'Feels like',
  roof: 'Roof & road',
  lstNote: 'Roof & road is surface temperature from satellite — hotter than the air you feel.',
  drivers: 'Drivers · causes',
  why: 'Why this block is hot',
  sealed: 'Sealed surface',
  green: 'Green cover',
  roofs: 'Dark roofs',
  density: 'Building density',
  source: 'Observed: Landsat 9 + weather API · Drivers: OSM + Sentinel-2',
  setGoal: 'Set a cooling goal',
  seeProj: 'See projection',
  proj: 'Projection',
  projSub: 'mean air temperature',
  h: ['Goal date', '+1 year', '+5 years'],
  doNothing: 'Do nothing',
  withPlan: 'With plan',
  goalMark: 'Goal date',
  rangesNote: 'Ranges, not promises. Trend fitted on MODIS LST 2003–2026 and NASA POWER; plan effect from your goal’s actions.',
  start: 'Start the plan',
  back: 'Back',
  openZone: 'Zone details',
};
export type MapCopy = typeof MAP_EN;

export const MAP_T: { en: MapCopy } & Partial<Record<Lang, Partial<MapCopy>>> = {
  en: MAP_EN,
  bn: {
    title: 'তাপ মানচিত্র',
    within: 'ব্যাসার্ধ',
    lst: 'ছাদ ও রাস্তা',
    airL: 'বাতাস',
    ranked: 'আপনার এলাকায় সবচেয়ে গরম',
    count: '২৪টি জোন',
    nearTie: 'প্রায় সমান',
    tieNote: '±৩ এর মধ্যে স্কোরগুলো প্রায় সমান — সমান গরম ধরুন।',
    lstShort: 'LST',
    zoneSub: 'মোহাম্মদপুর · আপনার থেকে {d} মি',
    vhigh: 'খুব বেশি',
    high: 'বেশি',
    observed: 'তাপের মাত্রা · পর্যবেক্ষিত',
    air: 'বাতাস',
    feels: 'অনুভূত',
    roof: 'ছাদ ও রাস্তা',
    lstNote: 'ছাদ ও রাস্তা হলো উপগ্রহ থেকে পৃষ্ঠের তাপমাত্রা — অনুভূত বাতাসের চেয়ে বেশি।',
    drivers: 'কারণ',
    why: 'এই ব্লক কেন গরম',
    sealed: 'পাকা পৃষ্ঠ',
    green: 'সবুজ আচ্ছাদন',
    roofs: 'গাঢ় ছাদ',
    density: 'ভবনের ঘনত্ব',
    source: 'পর্যবেক্ষণ: Landsat 9 + আবহাওয়া API · কারণ: OSM + Sentinel-2',
    setGoal: 'শীতলতার লক্ষ্য ঠিক করুন',
    seeProj: 'পূর্বাভাস দেখুন',
    proj: 'পূর্বাভাস',
    projSub: 'গড় বাতাসের তাপমাত্রা',
    h: ['লক্ষ্য তারিখ', '+১ বছর', '+৫ বছর'],
    doNothing: 'কিছু না করলে',
    withPlan: 'পরিকল্পনায়',
    goalMark: 'লক্ষ্য',
    rangesNote: 'পরিসর, প্রতিশ্রুতি নয়। MODIS ও NASA POWER থেকে প্রবণতা।',
    start: 'পরিকল্পনা শুরু',
    back: 'পেছনে',
    openZone: 'জোনের বিস্তারিত',
  },
  ur: {
    title: 'ہیٹ نقشہ',
    within: 'دائرہ',
    lst: 'چھت اور سڑک',
    airL: 'ہوا',
    ranked: 'آپ کے دائرے میں گرم ترین',
    count: '۲۴ زون',
    nearTie: 'تقریباً برابر',
    tieNote: '±۳ کے اندر اسکور تقریباً برابر ہیں — انہیں یکساں گرم سمجھیں۔',
    lstShort: 'LST',
    zoneSub: 'محمدپور · آپ سے {d} میٹر',
    vhigh: 'بہت زیادہ',
    high: 'زیادہ',
    observed: 'گرمی کی سطح · مشاہدہ',
    air: 'ہوا',
    feels: 'محسوس',
    roof: 'چھت اور سڑک',
    lstNote: 'چھت اور سڑک سیٹلائٹ سے سطح کا درجۂ حرارت ہے — محسوس ہونے والی ہوا سے زیادہ۔',
    drivers: 'وجوہات',
    why: 'یہ بلاک گرم کیوں ہے',
    sealed: 'پکی سطح',
    green: 'سبزہ',
    roofs: 'گہری چھتیں',
    density: 'عمارتوں کی کثافت',
    source: 'مشاہدہ: Landsat 9 + موسم API · وجوہات: OSM + Sentinel-2',
    setGoal: 'ٹھنڈک کا ہدف بنائیں',
    seeProj: 'پیش گوئی دیکھیں',
    proj: 'پیش گوئی',
    projSub: 'اوسط ہوا کا درجۂ حرارت',
    h: ['ہدف کی تاریخ', '+۱ سال', '+۵ سال'],
    doNothing: 'کچھ نہ کریں',
    withPlan: 'منصوبے کے ساتھ',
    goalMark: 'ہدف',
    rangesNote: 'حدود، وعدے نہیں۔ MODIS اور NASA POWER سے رجحان۔',
    start: 'منصوبہ شروع کریں',
    back: 'واپس',
    openZone: 'زون کی تفصیل',
  },
};

/** "Over the years" card (ZX). */
const YEARS_EN = {
  yearsTitle: 'Over the years',
  layers: ['Heat', 'Greenness'],
  planted: '▲ Trees planted 2024',
  lst: 'Roof & road',
  ndvi: 'Greenness',
  vsAvg: 'vs 20-yr avg',
  before: 'Before (2023) vs after (2026) planting',
  gt: 'Ground truth: 37 photos from this zone match the satellite greenness (r = 0.82).',
  anom: 'vs 20-year average',
  ev: 'Trees planted',
  year: 'Year',
};
export type YearsCopy = typeof YEARS_EN;

export const YEARS_T: { en: YearsCopy } & Partial<Record<Lang, Partial<YearsCopy>>> = {
  en: YEARS_EN,
  bn: {
    yearsTitle: 'বছর বছর পরিবর্তন',
    layers: ['তাপ', 'সবুজতা'],
    planted: '▲ ২০২৪-এ গাছ লাগানো',
    lst: 'ছাদ ও রাস্তা',
    ndvi: 'সবুজতা',
    vsAvg: '২০ বছরের গড়ের তুলনায়',
    before: 'লাগানোর আগে (২০২৩) বনাম পরে (২০২৬)',
    gt: 'মাঠের প্রমাণ: এই জোনের ৩৭টি ছবি স্যাটেলাইটের সবুজতার সাথে মেলে (r = ০.৮২)।',
    anom: '২০ বছরের গড়ের চেয়ে',
    ev: 'গাছ লাগানো',
    year: 'বছর',
  },
  ur: {
    yearsTitle: 'سال بہ سال',
    layers: ['گرمی', 'سبزہ'],
    planted: '▲ ۲۰۲۴ میں درخت لگے',
    lst: 'چھت اور سڑک',
    ndvi: 'سبزہ',
    vsAvg: '۲۰ سالہ اوسط سے',
    before: 'شجرکاری سے پہلے (۲۰۲۳) اور بعد (۲۰۲۶)',
    gt: 'زمینی ثبوت: اس زون کی ۳۷ تصاویر سیٹلائٹ سبزے سے ملتی ہیں (r = ۰٫۸۲)۔',
    anom: '۲۰ سالہ اوسط سے',
    ev: 'درخت لگے',
    year: 'سال',
  },
};

/** Drivers card (DX). */
const DRIVERS_EN = {
  hotterThan: 'hotter than the Dhaka average on roof & road surfaces',
  addsLbl: 'What each cause adds',
  cityAvg: 'City avg',
  adds: 'Adds',
  fixL: 'Fix',
  addGoal: 'Add to goal',
  why: [
    'Concrete and asphalt soak up sun all day and give the heat back at night, so the block never fully cools.',
    'Trees cool by shade and by evaporating water. This block has only 11 trees across 4 hectares.',
    'Dark roofs reach 60–70 °C at noon and heat the rooms under them.',
    'Tightly packed buildings trap heat and block the wind, so nights stay warm.',
  ],
  fix: [
    'Swap 10% of paving for grass pavers or tree pits',
    'Plant 24 street trees along the main road',
    'Cool-roof coating on 1,200 m² of hostel roofs',
    'Shade sails over the two narrowest lanes',
  ],
};
export type DriversCopy = typeof DRIVERS_EN;

export const DRIVERS_T: { en: DriversCopy } & Partial<Record<Lang, Partial<DriversCopy>>> = {
  en: DRIVERS_EN,
  bn: {
    hotterThan: 'ঢাকার গড়ের চেয়ে বেশি গরম (ছাদ ও রাস্তার পৃষ্ঠে)',
    addsLbl: 'প্রতিটি কারণ কত তাপ যোগ করে',
    cityAvg: 'শহরের গড়',
    adds: 'যোগ করে',
    fixL: 'সমাধান',
    addGoal: 'লক্ষ্যে যোগ করুন',
    why: [
      'কংক্রিট ও পিচ সারাদিন রোদ শুষে রাতে তাপ ছেড়ে দেয়, তাই ব্লকটি কখনো পুরো ঠান্ডা হয় না।',
      'গাছ ছায়া দিয়ে ও পানি বাষ্প করে ঠান্ডা রাখে। এই ব্লকে ৪ হেক্টরে মাত্র ১১টি গাছ।',
      'দুপুরে গাঢ় ছাদ ৬০–৭০ °সে পর্যন্ত গরম হয়, নিচের ঘরগুলোও গরম হয়ে যায়।',
      'ঘন ভবন তাপ আটকে রাখে ও বাতাস থামিয়ে দেয়, তাই রাতও গরম থাকে।',
    ],
    fix: ['১০% পাকা জায়গায় ঘাস-পেভার বা গাছের গর্ত', 'প্রধান সড়কে ২৪টি গাছ লাগান', 'হোস্টেলের ১,২০০ m² ছাদে শীতল রং', 'সবচেয়ে সরু দুটি গলিতে ছায়া-পাল'],
  },
  ur: {
    hotterThan: 'ڈھاکہ کی اوسط سے زیادہ گرم (چھت اور سڑک کی سطح)',
    addsLbl: 'ہر وجہ کتنی گرمی بڑھاتی ہے',
    cityAvg: 'شہر کی اوسط',
    adds: 'اضافہ',
    fixL: 'حل',
    addGoal: 'ہدف میں شامل کریں',
    why: [
      'کنکریٹ اور تارکول دن بھر دھوپ جذب کر کے رات کو گرمی چھوڑتے ہیں، اس لیے بلاک پوری طرح ٹھنڈا نہیں ہوتا۔',
      'درخت سایہ اور بخارات سے ٹھنڈک دیتے ہیں۔ اس بلاک میں ۴ ہیکٹر میں صرف ۱۱ درخت ہیں۔',
      'دوپہر کو گہری چھتیں ۶۰–۷۰ °C تک گرم ہو کر نیچے کے کمرے گرم کرتی ہیں۔',
      'گھنی عمارتیں گرمی روکتی ہیں اور ہوا بند کرتی ہیں، اس لیے راتیں بھی گرم رہتی ہیں۔',
    ],
    fix: ['۱۰٪ پکی جگہ پر گھاس والی اینٹیں یا درختوں کے گڑھے', 'مرکزی سڑک پر ۲۴ درخت لگائیں', 'ہاسٹل کی ۱,۲۰۰ m² چھت پر ٹھنڈی کوٹنگ', 'دو تنگ ترین گلیوں پر سایہ دار ترپال'],
  },
};

/* ───────────────────────── Zone history maths (ZX) ───────────────────────── */

/** Roof & road LST for a year (°C): slow warming, then cooling after the 2024 planting. */
export const lstY = (y: number) => 49 + 0.22 * (y - 2006) - (y >= 2024 ? 0.3 * (y - 2023) : 0);
/** NDVI greenness for a year. */
export const ndY = (y: number) => 0.24 - 0.004 * (y - 2006) + (y >= 2024 ? 0.025 * (y - 2023) : 0);
/** 2006–2025 average LST (the "20-year average"). */
export const LST_BASE = (() => {
  let b = 0;
  for (let y = 2006; y <= 2025; y++) b += lstY(y);
  return b / 20;
})();
