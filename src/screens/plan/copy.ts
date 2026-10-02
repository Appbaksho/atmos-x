/**
 * Copy for the Plan flow (S08 goal wizard, S09 feasibility, S10 plan, S11 species), ported from the
 * prototype's `CzPlan` dictionaries. Bangla / Urdu fall back to English per key via `f.pick`.
 */

export const PLAN_T = {
  en: {
    goalTitle: 'Cooling goal', goalSub: 'Step 1 of 2 · set the target', zoneSet: 'Zone', zoneMeta: 'Heat Score 86 · 180 m from you',
    existing: 'Already in this zone', join: 'Join', existingNote: 'Joining counts your effort once, instead of splitting it across parallel goals in the same zone.',
    space: 'Space you can work with', spaceSrc: 'From OSM footprints + Sentinel-2 · 27 Sep', roofs: 'Flat roofs', ground: 'Open ground', edge: 'Street edge', walls: 'Sunny walls',
    target: 'Target', rec: 'Recommended', recNote: 'is what this space can realistically deliver.', timeline: 'Timeline', tls: ['3 months', '1 year', '2 years', '5 years'],
    actionNote: 'Under 6 months this becomes an action goal: we track the work itself, because satellites can’t confirm cooling that fast.', goalDate: 'Goal date', checkFeas: 'Check feasibility',
    feasTitle: 'Feasibility', verdict: 'Verdict', confidence: 'Confidence', milestones: 'Milestones', seePlan: 'See the plan', startTeam: 'Start a team',
    plantMap: 'Plan the planting', plantHint: 'Tap the map to place a tree, tap a tree to remove it. Dashed circles are suggested spots along the street edge.', spot: 'Suggested spot', zoneEdge: 'Zone edge',
    placed: 'Trees', coolL: 'Modeled', shadeL: 'Shade, mature', autofill: 'Fill suggested spots', clear: 'Clear',
    solo: 'Solo', team: 'Team', org: 'Organization', vC: 'Comfortable', vD: 'Doable', vS: 'Stretch', vN: 'Not realistic',
    planTitle: 'Your plan', modeled: 'Modeled', budget: 'Budget', firstEffect: 'First effect', wk1: '1 week', actions: 'Actions · cooling per ৳', effectIn: 'Effect in', perTk: 'Cooling per ৳',
    whereTitle: 'Where to plant', whereNote: 'Along the south street edge, about 8 m apart and clear of drains and wires. The two courtyard spots shade the hostel walls in the afternoon.', editMap: 'Edit planting map', placedW: 'placed', spotsW: 'open spots',
    species: 'Recommended species', nurseries: 'Nurseries', nurseLine: '3 nearby stock Neem · nearest 0.8 km', logFirst: 'Log your first action', seeBudget: 'See budget',
    cooling: 'Cooling contribution', perTree: 'per tree at maturity, within 25 m', yourTwelve: 'Your 12 Neem, of the whole goal', coolSrc: 'Modeled from canopy area × ENVI-met coefficients for Dhaka · range ±30%',
    care: 'Care', price: 'Price & where', add: 'Add 12 to plan', added: 'Added · 12 Neem', findN: 'See nurseries',
  },
  bn: {
    goalTitle: 'শীতলতার লক্ষ্য', zoneSet: 'জোন', existing: 'এই জোনে ইতিমধ্যে', join: 'যোগ দিন', space: 'কাজের জায়গা', target: 'লক্ষ্যমাত্রা', rec: 'প্রস্তাবিত', timeline: 'সময়সীমা',
    tls: ['৩ মাস', '১ বছর', '২ বছর', '৫ বছর'], goalDate: 'লক্ষ্য তারিখ', checkFeas: 'সম্ভাব্যতা দেখুন', feasTitle: 'সম্ভাব্যতা', verdict: 'রায়', confidence: 'আস্থা', milestones: 'মাইলফলক',
    seePlan: 'পরিকল্পনা দেখুন', startTeam: 'দল শুরু করুন', whereTitle: 'কোথায় লাগাবেন',
    whereNote: 'দক্ষিণের রাস্তার ধারে, প্রায় ৮ মিটার পরপর, নালা ও বিদ্যুতের তার থেকে দূরে। উঠানের দুটি জায়গা বিকেলে হোস্টেলের দেয়ালে ছায়া দেয়।',
    editMap: 'রোপণ মানচিত্র সম্পাদনা', placedW: 'লাগানো', spotsW: 'খালি জায়গা', spot: 'প্রস্তাবিত জায়গা', solo: 'একা', team: 'দল', org: 'সংগঠন', planTitle: 'আপনার পরিকল্পনা',
    modeled: 'মডেলকৃত', budget: 'বাজেট', firstEffect: 'প্রথম প্রভাব', species: 'প্রস্তাবিত প্রজাতি', nurseries: 'নার্সারি', logFirst: 'প্রথম কাজ লগ করুন', seeBudget: 'বাজেট দেখুন',
    cooling: 'শীতলতায় অবদান', care: 'যত্ন', price: 'দাম ও কোথায়', add: 'পরিকল্পনায় ১২টি যোগ করুন', added: 'যোগ হয়েছে · ১২টি নিম', findN: 'নার্সারি দেখুন',
  },
  ur: {
    goalTitle: 'ٹھنڈک کا ہدف', zoneSet: 'زون', existing: 'اس زون میں پہلے سے', join: 'شامل ہوں', space: 'دستیاب جگہ', target: 'ہدف', rec: 'تجویز کردہ', timeline: 'مدت',
    tls: ['۳ ماہ', '۱ سال', '۲ سال', '۵ سال'], goalDate: 'ہدف کی تاریخ', checkFeas: 'قابلِ عمل جانچیں', feasTitle: 'قابلِ عمل', verdict: 'فیصلہ', confidence: 'اعتماد', milestones: 'سنگِ میل',
    seePlan: 'منصوبہ دیکھیں', startTeam: 'ٹیم بنائیں', whereTitle: 'کہاں لگائیں',
    whereNote: 'جنوبی سڑک کے کنارے، تقریباً ۸ میٹر کے فاصلے پر، نالیوں اور تاروں سے دور۔ صحن کی دو جگہیں دوپہر کے بعد ہاسٹل کی دیواروں پر سایہ دیتی ہیں۔',
    editMap: 'شجرکاری کا نقشہ بدلیں', placedW: 'لگائے', spotsW: 'خالی جگہیں', spot: 'تجویز کردہ جگہ', solo: 'اکیلے', team: 'ٹیم', org: 'ادارہ', planTitle: 'آپ کا منصوبہ',
    modeled: 'ماڈل شدہ', budget: 'بجٹ', firstEffect: 'پہلا اثر', species: 'تجویز کردہ انواع', nurseries: 'نرسریاں', logFirst: 'پہلا کام لاگ کریں', seeBudget: 'بجٹ دیکھیں',
    cooling: 'ٹھنڈک میں حصہ', care: 'دیکھ بھال', price: 'قیمت اور کہاں', add: 'منصوبے میں ۱۲ شامل کریں', added: 'شامل · ۱۲ نیم', findN: 'نرسریاں دیکھیں',
  },
};
export type PlanCopy = (typeof PLAN_T)['en'];

/** Tree catalog copy (S10 "20 trees for this zone"). */
export const CAT_T = {
  en: {
    title: '20 trees for this zone', sub: 'Price per sapling, 1–1.5 m tall', cats: ['All', 'Shade', 'Flowering', 'Fruit', 'Narrow lanes'], sorts: ['Cooling per ৳', 'Lowest price', 'Biggest shade'],
    perTree: 'per tree', canopyW: 'Canopy', est: 'est.', best: { s: 'Open ground', f: 'Street edge', n: 'Narrow lanes', r: 'Courtyards', big: 'Needs 20 m clear' },
    showAll: 'Show all {n}', showLess: 'Show fewer', sumTrees: 'Trees', sumSap: 'Saplings', sumAll: 'All-in', sumCool: 'Modeled', perTreeAll: 'All-in per tree', placeMap: 'Place on map',
    allInNote: 'All-in adds a tree guard ৳300, soil & compost ৳120 and 12 months of watering ৳250 to each sapling.',
    srcNote: 'Prices without “est.” are listed by Dhaka online nurseries (Satvai, PlantsBD, Ongkoor). “est.” is a typical market range. Prices change with sapling size — confirm at the nursery.',
    pollen: ['Some pollen', 'High pollen', 'Low pollen only · city mode'],
  },
  bn: {
    title: 'এই জোনের জন্য ২০টি গাছ', sub: 'প্রতি চারার দাম, ১–১.৫ মি উঁচু', cats: ['সব', 'ছায়া', 'ফুল', 'ফল', 'সরু গলি'], sorts: ['প্রতি টাকায় শীতলতা', 'কম দাম', 'বড় ছায়া'],
    perTree: 'প্রতি গাছ', canopyW: 'ছাউনি', est: 'আনুমানিক', best: { s: 'খোলা জায়গা', f: 'রাস্তার ধার', n: 'সরু গলি', r: 'উঠান', big: '২০ মি খালি জায়গা লাগে' },
    showAll: 'সব {n}টি দেখুন', showLess: 'কম দেখান', sumTrees: 'গাছ', sumSap: 'চারা', sumAll: 'সব মিলিয়ে', sumCool: 'মডেলকৃত', perTreeAll: 'প্রতি গাছে সব মিলিয়ে', placeMap: 'মানচিত্রে বসান',
    allInNote: 'সব মিলিয়ে = চারার দাম + গার্ড ৳৩০০ + মাটি ও কম্পোস্ট ৳১২০ + ১২ মাস পানি ৳২৫০।',
    srcNote: '“আনুমানিক” ছাড়া দামগুলো ঢাকার অনলাইন নার্সারি (Satvai, PlantsBD, Ongkoor)-এর তালিকা থেকে। “আনুমানিক” = সাধারণ বাজারদর। চারার আকারভেদে দাম বদলায় — নার্সারিতে যাচাই করুন।',
    pollen: ['কিছু পরাগ', 'বেশি পরাগ', 'শুধু কম পরাগের গাছ · শহর মোড'],
  },
  ur: {
    title: 'اس زون کے لیے ۲۰ درخت', sub: 'فی پودا قیمت، ۱–۱٫۵ میٹر اونچا', cats: ['سب', 'سایہ', 'پھول', 'پھل', 'تنگ گلیاں'], sorts: ['فی ٹکا ٹھنڈک', 'کم قیمت', 'بڑا سایہ'],
    perTree: 'فی درخت', canopyW: 'چھتری', est: 'تخمینہ', best: { s: 'کھلی جگہ', f: 'سڑک کنارہ', n: 'تنگ گلیاں', r: 'صحن', big: '۲۰ میٹر کھلی جگہ چاہیے' },
    showAll: 'تمام {n} دیکھیں', showLess: 'کم دکھائیں', sumTrees: 'درخت', sumSap: 'پودے', sumAll: 'کل خرچ', sumCool: 'ماڈل شدہ', perTreeAll: 'فی درخت کل خرچ', placeMap: 'نقشے پر لگائیں',
    allInNote: 'کل خرچ = پودے کی قیمت + حفاظتی جنگلہ ৳۳۰۰ + مٹی و کھاد ৳۱۲۰ + ۱۲ ماہ پانی ৳۲۵۰۔',
    srcNote: '“تخمینہ” کے بغیر قیمتیں ڈھاکہ کی آن لائن نرسریوں (Satvai، PlantsBD، Ongkoor) کی فہرست سے ہیں۔ “تخمینہ” = عام بازاری حد۔ پودے کے سائز سے قیمت بدلتی ہے — نرسری سے تصدیق کریں۔',
    pollen: ['کچھ پولن', 'زیادہ پولن', 'صرف کم پولن · شہر موڈ'],
  },
};
export type CatCopy = (typeof CAT_T)['en'];

/** Flowering calendar copy (S11). The prototype ships English + Bangla only. */
export const FL_T = {
  en: {
    title: 'Flowering calendar', now: 'Not in flower now · next in Mar', mon: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], bTitle: 'My tree is flowering',
    bSub: 'Add a photo · earn the Bloom spotter badge, +30 pts', bDone: 'Bloom spotter badge earned', bDoneSub: 'Your photo also checks the satellite bloom signal',
  },
  bn: {
    title: 'ফুলের ক্যালেন্ডার', now: 'এখন ফুল নেই · পরের ফুল মার্চে', mon: ['জা', 'ফে', 'মা', 'এ', 'মে', 'জু', 'জু', 'আ', 'সে', 'অ', 'ন', 'ডি'], bTitle: 'আমার গাছে ফুল এসেছে',
    bSub: 'ছবি দিন · Bloom spotter ব্যাজ, +৩০ পয়েন্ট', bDone: 'Bloom spotter ব্যাজ পেয়েছেন', bDoneSub: 'আপনার ছবি স্যাটেলাইটের ফুলের সংকেতও যাচাই করে',
  },
};
