/**
 * Copy, demo data and season maths for F01 Farmer home, F02 Alert detail and F03 My fields —
 * ported 1:1 from the prototype's `CzFarm` (T, TX, FXS, FD, FDT, CROPS, CL and season()).
 */
import { B } from '@/constants/cz';
import type { Lang } from '@/lib/cz/format';
import { DEMO_TODAY } from '@/lib/cz/demo';

/* ───────────────────────────── Copy ───────────────────────────── */

const T_EN = {
  place: 'Chilmari, Kurigram',
  field: 'North plot · 1.2 acres',
  crop: 'Aman rice',
  stageLine: 'Flowering · day 78 of 120',
  airNow: 'Air now',
  growth: 'Growth stage',
  stages: ['Seedling', 'Tillering', 'Panicle', 'Flowering', 'Ripening'],
  alertTag: 'Heat alert',
  alertWhy: 'Above 35 °C while rice flowers, pollen dies and grains come out empty.',
  today: 'Do this today',
  oneThing: 'Raise standing water to 5 cm this evening.',
  whatToDo: 'See why & how',
  forecast: '5-day forecast',
  edgeTitle: 'Field-edge trees still earn points',
  edgeSub: '6 trees on the north bund shade the water channel · +240 pts',
  log: 'Log',
  alertTitle: 'Heat at flowering',
  alertSub: 'North plot · Aman rice',
  risk: 'Empty-grain risk',
  lead: 'Lead time',
  confidence: 'Confidence',
  trigger: 'Trigger rule',
  issued: 'GEOS-FP run 2 Oct 06:00 UTC · 4 of 5 runs agree',
  hourly: 'Sunday, hour by hour',
  anthesis: 'Rice flowers open 09:00–12:00 — that’s the window that matters most.',
  oneToday: 'The one thing to do today',
  oneWhy: 'Standing water cools the crop canopy by 1–2 °C through the hottest hours. Top up again Sunday at dawn if it drops.',
  done: 'I’ve done it',
  doneOk: 'Done · we’ll remind you Sunday 05:30',
  weather: 'Field weather',
  wxSrc: 'GEOS-FP + SMAP soil moisture · 14:00',
  feelsL: 'Feels',
  hum: 'Humidity',
  windL: 'Wind',
  rain48: 'Rain 48 h',
  soil: 'Soil',
  suggest: 'For this field',
  days: ['Today', 'Sat', 'Sun', 'Mon', 'Tue'],
  mm: 'mm',
  fieldNames: ['North plot', 'River plot', 'Home garden'],
  chips: ['Flowering', 'Panicle', 'Growing'],
  metaL: ['1.2 acres · Aman rice', '1.6 acres · Aman rice', '0.6 acres · Vegetables'],
  fieldsSub: '3 fields · 3.4 acres',
  alertWhen: 'Sun 4 Oct · 11:00–15:00',
  alertAt: 'at flowering on Sunday',
  myFields: 'My fields',
  tap: 'Tap corners',
  walk: 'Walk the edge',
  tapHint: 'Tap each corner of the field on the map. Tap the first point again to close it.',
  walkHint: 'Walk along the bund with your phone. We trace the edge with GPS — accuracy ± 3 m.',
  notifications: 'Notifications',
  threshold: 'threshold',
  rule: 'Max air temperature ≥ {t} on any day during flowering (anthesis), from the GEOS-FP 5-day forecast for your field’s grid cell.',
};

const T_BN: Partial<typeof T_EN> = {
  place: 'চিলমারী, কুড়িগ্রাম',
  field: 'উত্তরের জমি · ১.২ একর',
  crop: 'আমন ধান',
  stageLine: 'ফুল আসছে · ১২০ দিনের ৭৮তম দিন',
  airNow: 'এখন বাতাস',
  growth: 'বৃদ্ধির ধাপ',
  stages: ['চারা', 'কুশি', 'থোড়', 'ফুল', 'পাকা'],
  alertTag: 'তাপ সতর্কতা',
  alertWhy: 'ফুল ফোটার সময় ৩৫ °সে-র বেশি হলে পরাগ মরে যায়, ধান চিটা হয়।',
  today: 'আজ এটা করুন',
  oneThing: 'আজ সন্ধ্যায় জমিতে ৫ সেমি পানি রাখুন।',
  whatToDo: 'কেন ও কীভাবে',
  forecast: '৫ দিনের পূর্বাভাস',
  log: 'লগ',
  alertTitle: 'ফুলের সময় তাপ',
  risk: 'চিটার ঝুঁকি',
  lead: 'আগাম সময়',
  confidence: 'আস্থা',
  oneToday: 'আজকের একটি কাজ',
  done: 'করেছি',
  doneOk: 'সম্পন্ন · রবিবার ০৫:৩০-এ মনে করিয়ে দেব',
  weather: 'জমির আবহাওয়া',
  wxSrc: 'GEOS-FP + SMAP মাটির আর্দ্রতা · ১৪:০০',
  feelsL: 'অনুভূত',
  hum: 'আর্দ্রতা',
  windL: 'বাতাস',
  rain48: '৪৮ ঘণ্টায় বৃষ্টি',
  soil: 'মাটি',
  suggest: 'এই জমির জন্য',
  days: ['আজ', 'শনি', 'রবি', 'সোম', 'মঙ্গল'],
  mm: 'মিমি',
  fieldNames: ['উত্তরের জমি', 'নদীর পাড়ের জমি', 'বাড়ির বাগান'],
  chips: ['ফুল', 'থোড়', 'বাড়ছে'],
  metaL: ['১.২ একর · আমন ধান', '১.৬ একর · আমন ধান', '০.৬ একর · সবজি'],
  fieldsSub: '৩টি জমি · ৩.৪ একর',
  alertWhen: 'রবি ৪ অক্টো · ১১:০০–১৫:০০',
  alertAt: 'রবিবার ফুল ফোটার সময়',
  myFields: 'আমার জমি',
  tap: 'কোণে ট্যাপ',
  walk: 'আইল ধরে হাঁটুন',
  notifications: 'বিজ্ঞপ্তি',
};

const T_UR: Partial<typeof T_EN> = {
  place: 'چلماری، کڑیگرام',
  field: 'شمالی کھیت · ۱٫۲ ایکڑ',
  crop: 'امن چاول',
  stageLine: 'پھول · ۱۲۰ میں سے ۷۸واں دن',
  airNow: 'ابھی ہوا',
  growth: 'نشوونما کا مرحلہ',
  stages: ['پنیری', 'شاخیں', 'بالی', 'پھول', 'پکنا'],
  alertTag: 'گرمی انتباہ',
  alertWhy: 'پھول کے وقت ۳۵ °C سے زیادہ ہو تو زردانہ مر جاتا ہے اور دانے خالی رہتے ہیں۔',
  today: 'آج یہ کریں',
  oneThing: 'آج شام کھیت میں ۵ سینٹی میٹر پانی کھڑا کریں۔',
  whatToDo: 'کیوں اور کیسے',
  forecast: '۵ دن کی پیش گوئی',
  log: 'لاگ',
  alertTitle: 'پھول کے وقت گرمی',
  risk: 'خالی دانے کا خطرہ',
  lead: 'پیشگی وقت',
  confidence: 'اعتماد',
  oneToday: 'آج کا ایک کام',
  done: 'کر لیا',
  doneOk: 'مکمل · اتوار ۰۵:۳۰ کو یاد دلائیں گے',
  weather: 'کھیت کا موسم',
  wxSrc: 'GEOS-FP + SMAP مٹی کی نمی · ۱۴:۰۰',
  feelsL: 'محسوس',
  hum: 'نمی',
  windL: 'ہوا',
  rain48: '۴۸ گھنٹے بارش',
  soil: 'مٹی',
  suggest: 'اس کھیت کے لیے',
  days: ['آج', 'ہفتہ', 'اتوار', 'پیر', 'منگل'],
  fieldNames: ['شمالی کھیت', 'دریائی کھیت', 'گھر کا باغ'],
  chips: ['پھول', 'بالی', 'بڑھ رہا'],
  metaL: ['۱٫۲ ایکڑ · امن چاول', '۱٫۶ ایکڑ · امن چاول', '۰٫۶ ایکڑ · سبزیاں'],
  fieldsSub: '۳ کھیت · ۳٫۴ ایکڑ',
  alertWhen: 'اتوار ۴ اکتوبر · ۱۱:۰۰–۱۵:۰۰',
  alertAt: 'اتوار کو پھول کے وقت',
  myFields: 'میرے کھیت',
  tap: 'کونے ٹیپ کریں',
  walk: 'کنارے پر چلیں',
  notifications: 'اطلاعات',
};

const TX_EN = {
  mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  cropN: { aman: 'Aman rice', boro: 'Boro rice', wheat: 'Wheat', potato: 'Potato', jute: 'Jute', mustard: 'Mustard', tomato: 'Tomato' } as Record<string, string>,
  stN: {
    seedling: 'Seedling',
    tillering: 'Tillering',
    panicle: 'Panicle',
    flowering: 'Flowering',
    ripening: 'Ripening',
    crown: 'Crown root',
    heading: 'Heading',
    grainfill: 'Grain fill',
    maturity: 'Maturity',
    sprout: 'Sprouting',
    veg: 'Vegetative',
    tuber: 'Tuber set',
    bulking: 'Bulking',
    germ: 'Germination',
    fast: 'Fast growth',
    fibre: 'Fibre ready',
    podfill: 'Pod fill',
    nursery: 'Nursery',
    fruiting: 'Fruiting',
    harvest: 'Harvest',
  } as Record<string, string>,
  rt: {
    heat: 'Heat at {s}',
    cold: 'Cold nights at {s}',
    blight: 'Fog — blight weather',
    flood: 'Flash flood & waterlogging',
    dry: 'Dry spell at {s}',
    storm: 'Nor’wester & hail at harvest',
    harvestRain: 'Rain at harvest',
  } as Record<RiskType, string>,
  ra: {
    heat: 'Irrigate in the evening before hot days — we’ll alert you 2–3 days ahead.',
    cold: 'Cover seedbeds with clear polythene at night; drain cold water in the morning.',
    blight: 'Spray a preventive fungicide before foggy spells.',
    flood: 'Keep drains open and hold spare seedlings in case of loss.',
    dry: 'Line up irrigation for this stage.',
    storm: 'Harvest when 80% of grains are ripe — don’t wait.',
    harvestRain: 'Watch the 5-day forecast and harvest in a dry window.',
  } as Record<RiskType, string>,
  whyHeat: 'Hot spells to {a} · crop limit {b}',
  whyCold: 'Nights near {a}',
  whyBlight: 'Cool, foggy nights',
  whyFlood: '{a} mm of rain in {m}',
  whyDry: 'Only {a} mm of rain in {m}',
  whyStorm: 'Nor’wester season (Apr–May)',
  whyRain: '{a} mm of rain',
  whyLive: 'Live alert: {a} on Sunday',
  outlook: 'Season outlook',
  harvestL: 'Harvest',
  daysW: 'days',
  nowL: 'Now',
  risksAhead: 'Weather risks ahead',
  noRisk: 'No major weather risks expected this season.',
  hi: 'High',
  med: 'Medium',
  outSrc: 'From NASA POWER 20-year normals + 2026–27 seasonal outlook (+0.8 °C). Updated weekly.',
  addTitle: 'Add a field',
  fName: 'Field name',
  newField: 'New field',
  area: 'Area',
  acresW: 'acres',
  fromMap: 'From your map outline',
  cropL: 'Crop you’ll sow',
  sowL: 'Sowing date',
  window: 'Best sowing window',
  outWin: 'Outside the usual window — more risk.',
  save: 'Save field',
  cancel: 'Cancel',
  sownL: 'sown',
  sowingL: 'sowing',
  planned: 'Planned',
  addBtn: 'Add field',
};

const TX_BN: Partial<typeof TX_EN> = {
  mon: ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'],
  cropN: { aman: 'আমন ধান', boro: 'বোরো ধান', wheat: 'গম', potato: 'আলু', jute: 'পাট', mustard: 'সরিষা', tomato: 'টমেটো' },
  stN: {
    seedling: 'চারা',
    tillering: 'কুশি',
    panicle: 'থোড়',
    flowering: 'ফুল',
    ripening: 'পাকা',
    crown: 'শিকড় গঠন',
    heading: 'শীষ বের হওয়া',
    grainfill: 'দানা পুষ্ট',
    maturity: 'পরিপক্বতা',
    sprout: 'অঙ্কুর',
    veg: 'অঙ্গজ বৃদ্ধি',
    tuber: 'আলু ধরা',
    bulking: 'আলু বড় হওয়া',
    germ: 'অঙ্কুরোদগম',
    fast: 'দ্রুত বৃদ্ধি',
    fibre: 'আঁশ প্রস্তুত',
    podfill: 'শুঁটি পুষ্ট',
    nursery: 'বীজতলা',
    fruiting: 'ফল ধরা',
    harvest: 'ফসল তোলা',
  },
  rt: {
    heat: 'তাপ — {s} ধাপে',
    cold: 'ঠান্ডা রাত — {s} ধাপে',
    blight: 'কুয়াশা — রোগের আবহাওয়া',
    flood: 'আকস্মিক বন্যা ও জলাবদ্ধতা',
    dry: 'শুকনো সময় — {s} ধাপে',
    storm: 'কালবৈশাখী ও শিলা — কাটার সময়',
    harvestRain: 'কাটার সময় বৃষ্টি',
  },
  ra: {
    heat: 'গরম দিনের আগের সন্ধ্যায় সেচ দিন — ২–৩ দিন আগে সতর্ক করব।',
    cold: 'রাতে বীজতলা স্বচ্ছ পলিথিনে ঢাকুন; সকালে ঠান্ডা পানি বের করে দিন।',
    blight: 'কুয়াশার আগে প্রতিরোধমূলক ছত্রাকনাশক দিন।',
    flood: 'নালা খোলা রাখুন, ক্ষতির জন্য বাড়তি চারা রাখুন।',
    dry: 'এই ধাপের জন্য সেচের ব্যবস্থা রাখুন।',
    storm: '৮০% দানা পাকলেই কেটে ফেলুন — দেরি নয়।',
    harvestRain: '৫ দিনের পূর্বাভাস দেখে শুকনো দিনে কাটুন।',
  },
  whyHeat: 'তাপপ্রবাহে {a} পর্যন্ত · ফসলের সীমা {b}',
  whyCold: 'রাতে প্রায় {a}',
  whyBlight: 'ঠান্ডা, কুয়াশাচ্ছন্ন রাত',
  whyFlood: '{m}-এ {a} মিমি বৃষ্টি',
  whyDry: '{m}-এ মাত্র {a} মিমি বৃষ্টি',
  whyStorm: 'কালবৈশাখীর মৌসুম (এপ্রি–মে)',
  whyRain: '{a} মিমি বৃষ্টি',
  whyLive: 'সরাসরি সতর্কতা: রবিবার {a}',
  outlook: 'মৌসুমের পূর্বাভাস',
  harvestL: 'ফসল তোলা',
  daysW: 'দিন',
  nowL: 'এখন',
  risksAhead: 'সামনের আবহাওয়া ঝুঁকি',
  noRisk: 'এই মৌসুমে বড় কোনো আবহাওয়া ঝুঁকি নেই।',
  hi: 'বেশি',
  med: 'মাঝারি',
  outSrc: 'NASA POWER ২০ বছরের গড় + ২০২৬–২৭ মৌসুমি পূর্বাভাস (+০.৮ °সে) থেকে। প্রতি সপ্তাহে হালনাগাদ।',
  addTitle: 'নতুন জমি যোগ করুন',
  fName: 'জমির নাম',
  newField: 'নতুন জমি',
  area: 'আয়তন',
  acresW: 'একর',
  fromMap: 'মানচিত্রের সীমানা থেকে',
  cropL: 'কোন ফসল বুনবেন',
  sowL: 'বোনার তারিখ',
  window: 'বোনার উপযুক্ত সময়',
  outWin: 'সাধারণ সময়ের বাইরে — ঝুঁকি বেশি।',
  save: 'জমি সংরক্ষণ করুন',
  cancel: 'বাতিল',
  sownL: 'বোনা',
  sowingL: 'বোনা হবে',
  planned: 'পরিকল্পিত',
  addBtn: 'জমি যোগ',
};

const TX_UR: Partial<typeof TX_EN> = {
  mon: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
  cropN: { aman: 'امن چاول', boro: 'بورو چاول', wheat: 'گندم', potato: 'آلو', jute: 'پٹ سن', mustard: 'سرسوں', tomato: 'ٹماٹر' },
  stN: {
    seedling: 'پنیری',
    tillering: 'شاخیں',
    panicle: 'بالی',
    flowering: 'پھول',
    ripening: 'پکنا',
    crown: 'جڑ بننا',
    heading: 'سٹہ نکلنا',
    grainfill: 'دانہ بھرنا',
    maturity: 'پختگی',
    sprout: 'اگاؤ',
    veg: 'بڑھوتری',
    tuber: 'آلو بننا',
    bulking: 'آلو بڑھنا',
    germ: 'اگاؤ',
    fast: 'تیز بڑھوتری',
    fibre: 'ریشہ تیار',
    podfill: 'پھلی بھرنا',
    nursery: 'نرسری',
    fruiting: 'پھل لگنا',
    harvest: 'کٹائی',
  },
  rt: {
    heat: 'گرمی — {s} مرحلے پر',
    cold: 'ٹھنڈی راتیں — {s} مرحلے پر',
    blight: 'دھند — بیماری کا موسم',
    flood: 'اچانک سیلاب اور پانی کھڑا ہونا',
    dry: 'خشک دور — {s} مرحلے پر',
    storm: 'آندھی اور اولے — کٹائی پر',
    harvestRain: 'کٹائی پر بارش',
  },
  ra: {
    heat: 'گرم دنوں سے پہلے شام کو آبپاشی کریں — ۲–۳ دن پہلے خبردار کریں گے۔',
    cold: 'رات کو پنیری شفاف پلاسٹک سے ڈھانپیں؛ صبح ٹھنڈا پانی نکال دیں۔',
    blight: 'دھند سے پہلے حفاظتی فنگس کش اسپرے کریں۔',
    flood: 'نالیاں کھلی رکھیں اور نقصان کے لیے اضافی پنیری رکھیں۔',
    dry: 'اس مرحلے کے لیے آبپاشی کا انتظام رکھیں۔',
    storm: '۸۰٪ دانے پکتے ہی کاٹ لیں — انتظار نہ کریں۔',
    harvestRain: '۵ دن کی پیش گوئی دیکھ کر خشک دن میں کاٹیں۔',
  },
  whyHeat: 'گرمی کی لہر میں {a} تک · فصل کی حد {b}',
  whyCold: 'راتیں تقریباً {a}',
  whyBlight: 'ٹھنڈی، دھند والی راتیں',
  whyFlood: '{m} میں {a} ملی میٹر بارش',
  whyDry: '{m} میں صرف {a} ملی میٹر بارش',
  whyStorm: 'آندھی کا موسم (اپریل–مئی)',
  whyRain: '{a} ملی میٹر بارش',
  whyLive: 'براہ راست انتباہ: اتوار کو {a}',
  outlook: 'موسم کا جائزہ',
  harvestL: 'کٹائی',
  daysW: 'دن',
  nowL: 'ابھی',
  risksAhead: 'آگے موسمی خطرات',
  noRisk: 'اس موسم میں کوئی بڑا موسمی خطرہ متوقع نہیں۔',
  hi: 'زیادہ',
  med: 'درمیانہ',
  outSrc: 'NASA POWER کی ۲۰ سالہ اوسط + ۲۰۲۶–۲۷ موسمی پیش گوئی (+۰٫۸ °C) سے۔ ہر ہفتے تازہ۔',
  addTitle: 'نیا کھیت شامل کریں',
  fName: 'کھیت کا نام',
  newField: 'نیا کھیت',
  area: 'رقبہ',
  acresW: 'ایکڑ',
  fromMap: 'نقشے کی حد سے',
  cropL: 'کون سی فصل بوئیں گے',
  sowL: 'بوائی کی تاریخ',
  window: 'بوائی کا بہترین وقت',
  outWin: 'معمول کے وقت سے باہر — خطرہ زیادہ۔',
  save: 'کھیت محفوظ کریں',
  cancel: 'منسوخ',
  sownL: 'بوائی',
  sowingL: 'بوائی ہوگی',
  planned: 'منصوبہ',
  addBtn: 'کھیت شامل',
};

/** Satellite-stage copy (FXS) — the prototype has en + bn only; Urdu falls back to English. */
const FX_EN = {
  sat: 'Satellite-detected · 28 Sep',
  ndviL: 'Greenness (NDVI)',
  cap: 'Flowering detected from Sentinel-2 greenness — no need to remember the sowing date or variety. Heat alerts now use this detected stage.',
  gt: '✓ Matches 3 farmer photos within 2 km',
  anom: 'Flowering came 6 days earlier than the 20-year average · Sunday is {a} above normal',
  unk: 'I don’t know the date or variety',
  unkSub: 'We’ll detect sowing, flowering and harvest from satellite greenness within 2–3 weeks. Until then the outlook uses your area’s typical dates.',
  unkOff: 'Not sure? Tick this — the satellite will work it out.',
  beeTitle: 'Beekeeper view',
  idea: 'Idea',
  beeSub: 'Mustard bloom map for beekeepers — where fields are starting to flower, so hives can be moved in time.',
  bee: ['Ulipur · from 2 Dec', 'Chilmari · from 8 Dec', 'Rajarhat · from 15 Dec'],
  today: 'Today',
  fl: 'Flowering',
};

const FX_BN: Partial<typeof FX_EN> = {
  sat: 'স্যাটেলাইটে শনাক্ত · ২৮ সেপ্টে',
  ndviL: 'সবুজতা (NDVI)',
  cap: 'Sentinel-2 সবুজতা থেকে ফুল আসা শনাক্ত — বোনার তারিখ বা জাত মনে রাখতে হবে না। তাপ সতর্কতা এখন এই ধাপ ধরে হিসাব করে।',
  gt: '✓ ২ কিমির মধ্যে ৩টি কৃষকের ছবির সাথে মিলেছে',
  anom: '২০ বছরের গড়ের চেয়ে ৬ দিন আগে ফুল এসেছে · রবিবার স্বাভাবিকের চেয়ে {a} বেশি',
  unk: 'তারিখ বা জাত জানি না',
  unkSub: '২–৩ সপ্তাহের মধ্যে স্যাটেলাইটের সবুজতা থেকে বোনা, ফুল ও কাটার সময় শনাক্ত করব। ততদিন এলাকার সাধারণ তারিখ ধরা হবে।',
  unkOff: 'নিশ্চিত না হলে টিক দিন — স্যাটেলাইট বের করে নেবে।',
  beeTitle: 'মৌচাষি ভিউ',
  idea: 'আইডিয়া',
  beeSub: 'মৌচাষিদের জন্য সরিষা ফুলের মানচিত্র — কোথায় ফুল আসছে, যাতে সময়মতো বাক্স নেওয়া যায়।',
  bee: ['উলিপুর · ২ ডিসে থেকে', 'চিলমারী · ৮ ডিসে থেকে', 'রাজারহাট · ১৫ ডিসে থেকে'],
  today: 'আজ',
  fl: 'ফুল',
};

export type FarmCopy = typeof T_EN & typeof TX_EN;

/** Merged farm dictionary for a language, falling back to English per key. */
export function farmCopy(lang: Lang): FarmCopy {
  const T = { en: T_EN, bn: T_BN, ur: T_UR }[lang];
  const TX = { en: TX_EN, bn: TX_BN, ur: TX_UR }[lang];
  return { ...T_EN, ...TX_EN, ...T, ...TX } as FarmCopy;
}

export function fxCopy(lang: Lang): typeof FX_EN {
  return { ...FX_EN, ...(lang === 'bn' ? FX_BN : {}) };
}

/** Farm heat colour by air temperature (°C) — the prototype's farm-specific scale. */
export function farmHeat(c: number): string {
  return c < 30 ? B.green : c < 33 ? B.yellow : c < 35 ? B.orange : c < 37 ? B.red : B.deepRed;
}

/** 5-day forecast for the North plot: [max °C, rain mm]. */
export const FORECAST: [number, number][] = [
  [33, 2],
  [34, 0],
  [36, 0],
  [34, 4],
  [31, 12],
];

/* ───────────────────────────── Icons ───────────────────────────── */

export const TI = {
  drop: 'M12 3.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z',
  leaf: 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7',
  tree: 'M12 21v-5M12 3l6 9h-3l4 4H5l4-4H6z',
  bug: 'M9 7a3 3 0 0 1 6 0M8 9h8v6a4 4 0 0 1-8 0zM4 11h4M16 11h4M4 17h4M16 17h4M12 9v10',
  channel: 'M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 14c3 0 3 2 6 2s3-2 6-2 3 2 6 2',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2',
  /** Rice plant (fields list) */
  plant: 'M12 21V10M12 10c0-3 2-5 5-5 0 3-2 5-5 5zM12 14c0-2.5-2-4.5-5-4.5 0 2.5 2 4.5 5 4.5zM4 21h16',
  calendar: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4',
  tapMode: 'M5 5l4 14 3-6 6-3z',
  walkMode: 'M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 22l2-7 3 3v6M7 12l3-4h4l3 4M11 15l-1-5',
} as const;

export type RiskType = 'heat' | 'cold' | 'blight' | 'flood' | 'dry' | 'storm' | 'harvestRain';

export const RISK_ICON: Record<RiskType, string> = {
  heat: TI.sun,
  cold: 'M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2',
  blight: 'M4 10h16M6 14h12M8 18h8M7 6h10',
  flood: TI.channel,
  dry: TI.drop,
  storm: 'M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3 3 0 0 1 0 6zM11 15l-2 4h3l-2 4',
  harvestRain: 'M7 14a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3 3 0 0 1 0 6zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
};

/* ───────────────────────────── Season maths ───────────────────────────── */

/** Monthly climate normals for Kurigram: [Tmax °C, Tmin °C, rain mm]. */
const CL: [number, number, number][] = [
  [24, 11, 8],
  [27, 13, 15],
  [32, 17, 35],
  [34, 21, 120],
  [33, 23, 320],
  [32, 25, 520],
  [32, 26, 560],
  [32, 26, 430],
  [32, 25, 380],
  [31, 22, 160],
  [29, 16, 15],
  [26, 12, 8],
];

export type CropKey = 'aman' | 'boro' | 'wheat' | 'potato' | 'jute' | 'mustard' | 'tomato';

type Crop = {
  st: [string, number][];
  heat?: Record<string, number>;
  cold?: Record<string, number>;
  flood?: string[];
  dry?: string[];
  dryR?: number;
  blight?: string[];
  /** Sowing window: [startMonth, startDay, endMonth, endDay] (months 0-based) */
  win: [number, number, number, number];
  /** Default sowing date */
  def: string;
};

export const CROPS: Record<CropKey, Crop> = {
  aman: { st: [['seedling', 25], ['tillering', 30], ['panicle', 20], ['flowering', 15], ['ripening', 30]], heat: { panicle: 35, flowering: 35 }, cold: { flowering: 18 }, flood: ['seedling', 'tillering'], dry: ['panicle', 'flowering'], dryR: 60, win: [6, 1, 7, 15], def: '2027-07-10' },
  boro: { st: [['seedling', 40], ['tillering', 45], ['panicle', 30], ['flowering', 15], ['ripening', 30]], heat: { panicle: 35, flowering: 35 }, cold: { seedling: 15, tillering: 13 }, dry: ['tillering'], dryR: 20, win: [11, 1, 0, 15], def: '2026-12-10' },
  wheat: { st: [['crown', 25], ['tillering', 30], ['heading', 25], ['grainfill', 25], ['maturity', 10]], heat: { heading: 30, grainfill: 30 }, dry: ['crown', 'tillering'], dryR: 20, win: [10, 15, 11, 10], def: '2026-11-20' },
  potato: { st: [['sprout', 20], ['veg', 25], ['tuber', 20], ['bulking', 30], ['maturity', 15]], heat: { tuber: 29, bulking: 30 }, blight: ['veg', 'tuber', 'bulking'], win: [10, 1, 10, 30], def: '2026-11-10' },
  jute: { st: [['germ', 15], ['veg', 50], ['fast', 35], ['fibre', 20]], dry: ['germ', 'veg'], dryR: 100, flood: ['fast', 'fibre'], win: [2, 15, 3, 30], def: '2027-04-01' },
  mustard: { st: [['seedling', 20], ['veg', 20], ['flowering', 20], ['podfill', 20], ['maturity', 10]], heat: { flowering: 31, podfill: 32 }, blight: ['flowering'], win: [9, 25, 10, 20], def: '2026-11-01' },
  tomato: { st: [['nursery', 25], ['veg', 25], ['flowering', 20], ['fruiting', 40], ['harvest', 30]], heat: { flowering: 32, fruiting: 34 }, blight: ['fruiting', 'harvest'], win: [8, 1, 10, 15], def: '2026-10-15' },
};
export const CROP_KEYS = Object.keys(CROPS) as CropKey[];

export const parseDay = (iso: string) => new Date(iso + 'T00:00:00');
const valid = (d: Date) => !isNaN(d.getTime());

/** Is a sowing date inside the crop's usual window? (Invalid dates don't warn.) */
export function inWin(sow: string, w: Crop['win']): boolean {
  const d = parseDay(sow);
  if (!valid(d)) return true;
  const v = d.getMonth() * 31 + d.getDate();
  const s = w[0] * 31 + w[1];
  const e = w[2] * 31 + w[3];
  return s <= e ? v >= s && v <= e : v >= s || v <= e;
}

export type WhyArgs = ['live'] | ['heat', number, number] | ['cold', number] | ['blight'] | ['flood', number, number] | ['dry', number, number] | ['storm'] | ['rain', number];

export type Risk = { type: RiskType; level: 1 | 2; stage: string; i: number; a: Date; b: Date; why: WhyArgs };
export type SeasonStage = { k: string; n: number; a: Date; b: Date; now: boolean; done: boolean; risk: number };
export type Season = { stages: SeasonStage[]; risks: Risk[]; end: Date; total: number; prog: number; planned: boolean; cur?: SeasonStage };

const DAY = 864e5;

/** Stage calendar + climate risks for a crop sown on `sow` (the prototype's season()). */
export function season(ck: CropKey, sow: string, live: boolean, today: Date = DEMO_TODAY): Season | null {
  const C = CROPS[ck];
  const d0 = parseDay(sow);
  if (!C || !valid(d0)) return null;
  let cur = d0.getTime();
  const stages: SeasonStage[] = [];
  const risks: Risk[] = [];
  const now0 = today.getTime();
  C.st.forEach(([k, n], i) => {
    const a = new Date(cur);
    const b = new Date(cur + n * DAY);
    const m = new Date(cur + (n * DAY) / 2).getMonth();
    const [Tx, Tn, R] = CL[m];
    const now = now0 >= a.getTime() && now0 < b.getTime();
    const done = now0 >= b.getTime();
    const last = i === C.st.length - 1;
    const add = (type: RiskType, level: 1 | 2, why: WhyArgs) => risks.push({ type, level, stage: k, i, a, b, why });
    if (C.heat && C.heat[k]) {
      const pk = Tx + 4.3;
      const th = C.heat[k];
      if (live && now) add('heat', 2, ['live']);
      else if (pk >= th + 2) add('heat', 2, ['heat', pk, th]);
      else if (pk >= th) add('heat', 1, ['heat', pk, th]);
    }
    if (C.cold && C.cold[k] && Tn <= C.cold[k]) add('cold', Tn <= C.cold[k] - 3 ? 2 : 1, ['cold', Tn]);
    if (C.blight && C.blight.includes(k) && (m === 11 || m === 0)) add('blight', 1, ['blight']);
    if (C.flood && C.flood.includes(k) && R >= 400) add('flood', R >= 500 ? 2 : 1, ['flood', R, m]);
    if (C.dry && C.dry.includes(k) && R < (C.dryR ?? 0)) add('dry', 1, ['dry', R, m]);
    if (last && (m === 3 || m === 4)) add('storm', 2, ['storm']);
    else if (last && R >= 250) add('harvestRain', 1, ['rain', R]);
    stages.push({ k, n, a, b, now, done, risk: 0 });
    cur += n * DAY;
  });
  const fut = risks.filter((r) => r.b.getTime() > now0);
  fut.forEach((r) => {
    stages[r.i].risk = Math.max(stages[r.i].risk, r.level);
  });
  return {
    stages,
    risks: fut,
    end: new Date(cur),
    total: Math.round((cur - d0.getTime()) / DAY),
    prog: Math.max(0, Math.min(1, (now0 - d0.getTime()) / (cur - d0.getTime()))),
    planned: now0 < d0.getTime(),
    cur: stages.find((s) => s.now),
  };
}

/* ───────────────────────────── Field demo data (FD / FDT) ───────────────────────────── */

export type TipKind = 'u' | 'w' | 'p';
type TipIcon = 'drop' | 'leaf' | 'tree' | 'bug' | 'channel' | 'sun';
/** [tag, kind, icon, title, why, cta?, target?] */
export type TipRow = [string, TipKind, TipIcon, string, string, string?, ('F02' | 'S14')?];

export type FieldDemo = {
  /** [air, feels, humidity %, wind km/h, rain 48 h mm, soil] */
  wx: [number, number, number, number, number, string];
  days: [number, number][];
  stage: string;
  tips: TipRow[];
};

export const FD: FieldDemo[] = [
  {
    wx: [33, 39, 74, 8, 0, 'Moist'],
    days: [[33, 2], [34, 0], [36, 0], [34, 4], [31, 12]],
    stage: 'Aman rice · flowering, day 78',
    tips: [
      ['Urgent · Sun', 'u', 'drop', 'Raise standing water to 5 cm this evening', 'Sunday reaches 36° while the rice flowers. Water cools the canopy 1–2 °C.', 'See alert', 'F02'],
      ['This week', 'w', 'leaf', 'Hold the urea top-dress until Tuesday', 'Nitrogen is wasted under heat stress; Tuesday’s rain helps it soak in.'],
      ['Earn points', 'p', 'tree', 'Plant 6 trees on the north bund', 'Shade over the channel keeps irrigation water cooler. +240 pts.', 'Log trees', 'S14'],
    ],
  },
  {
    wx: [32, 38, 78, 10, 0, 'Wet'],
    days: [[32, 3], [33, 0], [35, 0], [34, 6], [31, 14]],
    stage: 'Aman rice · panicle, day 64',
    tips: [
      ['This week', 'w', 'drop', 'Keep 3–5 cm of water through panicle', 'Second most heat-sensitive stage — Sunday touches 35°.'],
      ['Watch', 'w', 'bug', 'Check for stem borer after humid nights', '78% humidity and warm nights favour moths. Look for dead hearts.'],
      ['Before Tue', 'w', 'channel', 'Clear the side drain before 14 mm of rain', 'Stops water topping over the panicles.'],
    ],
  },
  {
    wx: [33, 40, 70, 7, 0, 'Dry top 5 cm'],
    days: [[33, 0], [34, 0], [36, 0], [35, 3], [32, 10]],
    stage: 'Tomato, okra, gourd',
    tips: [
      ['Urgent · today', 'u', 'sun', 'Shade net over seedlings 12:00–15:00', 'Young leaves scorch above 35 °C. A 50% net is enough.'],
      ['This week', 'w', 'leaf', 'Mulch the beds with rice straw', 'Keeps soil 3–4 °C cooler and roughly halves watering.'],
      ['Earn points', 'p', 'tree', 'Add a moringa on the south edge', 'Fast shade for the beds; counts as a tree action. +40 pts.', 'Log tree', 'S14'],
    ],
  },
];

/** Translated field demo: [stage line, soil, tips: [tag, title, why, cta?][]]. */
type FieldDemoT = [string, string, string[][]];
export const FDT: Partial<Record<Lang, FieldDemoT[]>> = {
  bn: [
    ['আমন ধান · ফুল আসছে, ৭৮তম দিন', 'ভেজা', [['জরুরি · রবি', 'আজ সন্ধ্যায় জমিতে ৫ সেমি পানি রাখুন', 'রবিবার ধানে ফুল থাকার সময় ৩৬° হবে। পানি ফসল ১–২ °সে ঠান্ডা রাখে।', 'সতর্কতা দেখুন'], ['এই সপ্তাহে', 'মঙ্গলবার পর্যন্ত ইউরিয়ার উপরি-প্রয়োগ বন্ধ রাখুন', 'তাপের চাপে নাইট্রোজেন নষ্ট হয়; মঙ্গলবারের বৃষ্টি সার মাটিতে মেশাবে।'], ['পয়েন্ট অর্জন', 'উত্তরের আইলে ৬টি গাছ লাগান', 'নালার ওপর ছায়া সেচের পানি ঠান্ডা রাখে। +২৪০ পয়েন্ট।', 'গাছ লগ করুন']]],
    ['আমন ধান · থোড়, ৬৪তম দিন', 'খুব ভেজা', [['এই সপ্তাহে', 'থোড় অবস্থায় ৩–৫ সেমি পানি রাখুন', 'তাপে সংবেদনশীল দ্বিতীয় ধাপ — রবিবার ৩৫° ছুঁতে পারে।'], ['নজর রাখুন', 'আর্দ্র রাতের পর মাজরা পোকা খুঁজুন', '৭৮% আর্দ্রতা ও গরম রাতে মথ বাড়ে। মরা ডিগ খুঁজে দেখুন।'], ['মঙ্গলবারের আগে', '১৪ মিমি বৃষ্টির আগে পাশের নালা পরিষ্কার করুন', 'থোড়ের ওপর দিয়ে পানি উপচে পড়া ঠেকায়।']]],
    ['টমেটো, ঢেঁড়স, লাউ', 'ওপরের ৫ সেমি শুকনো', [['জরুরি · আজ', '১২:০০–১৫:০০ চারার ওপর ছায়া-জাল দিন', '৩৫ °সে-র বেশি হলে কচি পাতা পুড়ে যায়। ৫০% জালই যথেষ্ট।'], ['এই সপ্তাহে', 'বেডে খড় দিয়ে মালচিং করুন', 'মাটি ৩–৪ °সে ঠান্ডা থাকে, পানি প্রায় অর্ধেক লাগে।'], ['পয়েন্ট অর্জন', 'দক্ষিণ পাশে একটি সজনে গাছ লাগান', 'বেডে দ্রুত ছায়া দেয়; গাছ লাগানো হিসেবে গণ্য। +৪০ পয়েন্ট।', 'গাছ লগ করুন']]],
  ],
  ur: [
    ['امن چاول · پھول، ۷۸واں دن', 'نم', [['فوری · اتوار', 'آج شام کھیت میں ۵ سینٹی میٹر پانی کھڑا کریں', 'اتوار کو پھول کے دوران ۳۶° تک گرمی ہوگی۔ پانی فصل کو ۱–۲ °C ٹھنڈا رکھتا ہے۔', 'انتباہ دیکھیں'], ['اس ہفتے', 'منگل تک یوریا کی دوسری خوراک روک دیں', 'گرمی کے دباؤ میں نائٹروجن ضائع ہوتی ہے؛ منگل کی بارش اسے جذب کرائے گی۔'], ['پوائنٹس کمائیں', 'شمالی منڈیر پر ۶ درخت لگائیں', 'نالی پر سایہ آبپاشی کا پانی ٹھنڈا رکھتا ہے۔ +۲۴۰ پوائنٹس۔', 'درخت لاگ کریں']]],
    ['امن چاول · بالی، ۶۴واں دن', 'گیلی', [['اس ہفتے', 'بالی کے دوران ۳–۵ سینٹی میٹر پانی رکھیں', 'گرمی سے حساس دوسرا مرحلہ — اتوار کو ۳۵° تک۔'], ['نظر رکھیں', 'مرطوب راتوں کے بعد تنے کے کیڑے دیکھیں', '۷۸٪ نمی اور گرم راتیں پتنگوں کو بڑھاتی ہیں۔'], ['منگل سے پہلے', '۱۴ ملی میٹر بارش سے پہلے نکاسی صاف کریں', 'بالیوں پر پانی چڑھنے سے بچاتا ہے۔']]],
    ['ٹماٹر، بھنڈی، لوکی', 'اوپر ۵ سینٹی میٹر خشک', [['فوری · آج', '۱۲:۰۰–۱۵:۰۰ پنیری پر سایہ دار جال لگائیں', '۳۵ °C سے اوپر نئے پتے جھلس جاتے ہیں۔ ۵۰٪ جال کافی ہے۔'], ['اس ہفتے', 'کیاریوں پر چاول کی پرالی بچھائیں', 'مٹی ۳–۴ °C ٹھنڈی رہتی ہے اور پانی تقریباً آدھا لگتا ہے۔'], ['پوائنٹس کمائیں', 'جنوبی کنارے پر سہانجنا لگائیں', 'کیاریوں کو جلد سایہ؛ درخت کے کام میں شمار۔ +۴۰ پوائنٹس۔', 'درخت لاگ کریں']]],
  ],
};
