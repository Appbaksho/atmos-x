/**
 * Farmer Mode: crop & weather alert engine tuned for Bangladesh.
 * Inputs: Open-Meteo 7-day forecast, NASA POWER past-30-day rainfall, an
 * upstream (Meghalaya) forecast for haor flash floods, crop + growth stage.
 * Thresholds follow BMD / BRRI / DAE advisories where available.
 */
import { LatLng } from './geo';
import { fetchPowerDaily } from './nasa';
import { fetchForecast, Forecast, heatIndex } from './weather';

export type CropId = 'boro' | 'aman' | 'aus' | 'potato' | 'wheat' | 'jute' | 'vegetables' | 'maize';
export type StageId = 'seedbed' | 'vegetative' | 'flowering' | 'ripening' | 'harvest';

export const CROPS: { id: CropId; en: string; bn: string; emoji: string }[] = [
  { id: 'boro', en: 'Boro rice', bn: 'বোরো ধান', emoji: '🌾' },
  { id: 'aman', en: 'Aman rice', bn: 'আমন ধান', emoji: '🌾' },
  { id: 'aus', en: 'Aus rice', bn: 'আউশ ধান', emoji: '🌾' },
  { id: 'potato', en: 'Potato', bn: 'আলু', emoji: '🥔' },
  { id: 'wheat', en: 'Wheat', bn: 'গম', emoji: '🌾' },
  { id: 'maize', en: 'Maize', bn: 'ভুট্টা', emoji: '🌽' },
  { id: 'jute', en: 'Jute', bn: 'পাট', emoji: '🌿' },
  { id: 'vegetables', en: 'Vegetables', bn: 'শাকসবজি', emoji: '🥬' },
];

export const STAGES: { id: StageId; en: string; bn: string }[] = [
  { id: 'seedbed', en: 'Seedbed / sowing', bn: 'বীজতলা / বপন' },
  { id: 'vegetative', en: 'Vegetative', bn: 'বাড়ন্ত' },
  { id: 'flowering', en: 'Flowering', bn: 'ফুল আসা' },
  { id: 'ripening', en: 'Grain filling / ripening', bn: 'দানা পুষ্ট / পাকা' },
  { id: 'harvest', en: 'Ready to harvest', bn: 'কাটার উপযুক্ত' },
];

export type AlertLevel = 'danger' | 'warning' | 'watch' | 'info';

export type FarmAlert = {
  id: string;
  level: AlertLevel;
  emoji: string;
  title: { en: string; bn: string };
  detail: { en: string; bn: string };
  advice: { en: string[]; bn: string[] };
  when?: string;
};

export type FarmerResult = {
  alerts: FarmAlert[];
  forecast: Forecast;
  rain30: number | null;
  region: { haor: boolean; coastal: boolean; north: boolean };
};

const isRice = (c: CropId) => c === 'boro' || c === 'aman' || c === 'aus';

/** Rough regional boxes. */
export function regionOf(p: LatLng) {
  const { latitude: la, longitude: lo } = p;
  return {
    // Sunamganj, Sylhet, Habiganj, Netrokona, Kishoreganj, Moulvibazar haors
    haor: la >= 24.0 && la <= 25.3 && lo >= 90.6 && lo <= 92.0,
    // Coastal belt: Khulna, Barishal, Patuakhali, Bhola, Noakhali, Chattogram, Cox's Bazar
    coastal: la <= 22.95 && lo >= 89.0 && lo <= 92.4,
    // North-west / north: Rangpur, Dinajpur, Rajshahi divisions (cold waves, drought)
    north: la >= 24.3 && lo <= 89.9,
  };
}

const UPSTREAM_CHERRAPUNJI: LatLng = { latitude: 25.27, longitude: 91.73 };

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function fmtDay(date: string) {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export async function runFarmerAlerts(p: LatLng, crop: CropId, stage: StageId): Promise<FarmerResult> {
  const region = regionOf(p);
  const month = new Date().getMonth() + 1; // 1-12
  const [forecast, power, upstream] = await Promise.all([
    fetchForecast(p),
    fetchPowerDaily(p, 30).catch(() => null),
    region.haor ? fetchForecast(UPSTREAM_CHERRAPUNJI).catch(() => null) : Promise.resolve(null),
  ]);
  const d = forecast.daily;
  const alerts: FarmAlert[] = [];

  // 1. Haor flash flood (pre-monsoon, Mar–May, Boro harvest window)
  if (region.haor && month >= 3 && month <= 6) {
    const local3 = Math.max(...[0, 1, 2, 3, 4].map((i) => sum(d.slice(i, i + 3).map((x) => x.rain))));
    const up3 = upstream
      ? Math.max(...[0, 1, 2, 3, 4].map((i) => sum(upstream.daily.slice(i, i + 3).map((x) => x.rain))))
      : 0;
    if (local3 >= 100 || up3 >= 150) {
      const danger = local3 >= 150 || up3 >= 250;
      alerts.push({
        id: 'haor_flood',
        level: danger ? 'danger' : 'warning',
        emoji: '🌊',
        title: { en: 'Haor flash flood risk', bn: 'হাওরে আকস্মিক বন্যার ঝুঁকি' },
        detail: {
          en: `Up to ${Math.round(local3)} mm locally and ${Math.round(up3)} mm upstream in Meghalaya over 3 days. Hill water can enter the haor within 24–48 h.`,
          bn: `৩ দিনে স্থানীয়ভাবে ${Math.round(local3)} মিমি ও উজানে মেঘালয়ে ${Math.round(up3)} মিমি বৃষ্টির সম্ভাবনা। ২৪–৪৮ ঘণ্টার মধ্যে পাহাড়ি ঢল নামতে পারে।`,
        },
        advice: {
          en: [
            'Harvest Boro immediately if 80% of grains are mature.',
            'Move harvested paddy, seed and livestock to high ground.',
            'Check embankments (bãdh) with your neighbours and report breaches to the Upazila office.',
          ],
          bn: [
            'ধানের ৮০% পেকে গেলে দেরি না করে বোরো ধান কেটে ফেলুন।',
            'কাটা ধান, বীজ ও গবাদি পশু উঁচু স্থানে সরিয়ে নিন।',
            'প্রতিবেশীদের সাথে বাঁধ পরীক্ষা করুন, ফাটল দেখলে উপজেলা অফিসে জানান।',
          ],
        },
      });
    }
  }

  // 2. Heat stress at rice flowering (spikelet sterility above ~35 °C)
  const hotDays = d.filter((x) => x.tmax >= 35);
  if (isRice(crop) && (stage === 'flowering' || stage === 'vegetative') && hotDays.length) {
    const peak = Math.max(...hotDays.map((x) => x.tmax));
    alerts.push({
      id: 'rice_heat',
      level: stage === 'flowering' ? (peak >= 38 ? 'danger' : 'warning') : 'watch',
      emoji: '🔥',
      title: { en: 'Heat stress at flowering', bn: 'ফুল আসার সময় তাপ-ঝুঁকি' },
      detail: {
        en: `${hotDays.length} day(s) at or above 35 °C (peak ${peak.toFixed(1)} °C). Pollen dies above 35 °C, causing empty grains (chita).`,
        bn: `${hotDays.length} দিন তাপমাত্রা ৩৫°সে বা তার বেশি (সর্বোচ্চ ${peak.toFixed(1)}°সে)। ৩৫°সে-এর বেশি তাপে পরাগ নষ্ট হয়ে ধান চিটা হতে পারে।`,
      },
      advice: {
        en: [
          'Keep 5–7 cm of standing water in the field during flowering.',
          'Irrigate in the afternoon to cool the canopy.',
          'Avoid spraying pesticides between 10 am and 2 pm.',
        ],
        bn: [
          'ফুল আসার সময় জমিতে ৫–৭ সেমি পানি ধরে রাখুন।',
          'দুপুরের পর সেচ দিয়ে জমি ঠান্ডা রাখুন।',
          'সকাল ১০টা থেকে দুপুর ২টার মধ্যে কীটনাশক স্প্রে করবেন না।',
        ],
      },
      when: fmtDay(hotDays[0].date),
    });
  }

  // 3. Drought / dry spell
  const rain30 = power ? sum(power.rain.filter((x): x is number => x != null)) : null;
  const rain7 = sum(d.map((x) => x.rain));
  const et7 = sum(d.map((x) => x.et0));
  if (rain30 != null && rain30 < 25 && rain7 < 10 && et7 > 20 && crop !== 'potato') {
    alerts.push({
      id: 'drought',
      level: rain30 < 10 ? 'warning' : 'watch',
      emoji: '🏜️',
      title: { en: 'Dry spell / drought risk', bn: 'খরা / অনাবৃষ্টির ঝুঁকি' },
      detail: {
        en: `Only ${Math.round(rain30)} mm of rain in the past 30 days (NASA POWER) and ${Math.round(rain7)} mm forecast this week, while crops lose ~${Math.round(et7)} mm to evaporation.`,
        bn: `গত ৩০ দিনে মাত্র ${Math.round(rain30)} মিমি বৃষ্টি (NASA POWER), এ সপ্তাহে ${Math.round(rain7)} মিমি পূর্বাভাস, অথচ বাষ্পীভবনে ~${Math.round(et7)} মিমি পানি হারাবে।`,
      },
      advice: {
        en: [
          'Use alternate wetting and drying (AWD) to stretch irrigation water.',
          'Mulch vegetable beds with straw to keep moisture.',
          'Plan supplementary irrigation for transplanted Aman if rain stays low.',
        ],
        bn: [
          'সেচের পানি বাঁচাতে পর্যায়ক্রমে ভেজানো ও শুকানো (AWD) পদ্ধতি ব্যবহার করুন।',
          'সবজির বেডে খড় দিয়ে মালচিং করে আর্দ্রতা ধরে রাখুন।',
          'বৃষ্টি কম থাকলে রোপা আমনে সম্পূরক সেচের ব্যবস্থা করুন।',
        ],
      },
    });
  }

  // 4. Cyclone / storm during harvest
  const stormDays = d.filter((x) => x.gust >= 62 || x.wind >= 45);
  if (stormDays.length) {
    const peak = Math.max(...stormDays.map((x) => x.gust));
    const harvestTime = stage === 'ripening' || stage === 'harvest';
    alerts.push({
      id: 'storm',
      level: peak >= 89 || (region.coastal && harvestTime) ? 'danger' : 'warning',
      emoji: '🌀',
      title: {
        en: region.coastal ? 'Cyclone / storm surge risk' : 'Storm / nor’wester risk',
        bn: region.coastal ? 'ঘূর্ণিঝড় / জলোচ্ছ্বাসের ঝুঁকি' : 'ঝড় / কালবৈশাখীর ঝুঁকি',
      },
      detail: {
        en: `Wind gusts up to ${Math.round(peak)} km/h expected from ${fmtDay(stormDays[0].date)}.`,
        bn: `${fmtDay(stormDays[0].date)} থেকে ঘণ্টায় ${Math.round(peak)} কিমি পর্যন্ত দমকা হাওয়ার সম্ভাবনা।`,
      },
      advice: {
        en: [
          harvestTime ? 'Harvest mature crops before the storm arrives.' : 'Stake banana, papaya and tall vegetables.',
          'Store seed and harvested grain in sealed bags on raised platforms.',
          'Follow BMD signals and move to a cyclone shelter if told to evacuate.',
        ],
        bn: [
          harvestTime ? 'ঝড় আসার আগেই পাকা ফসল কেটে ফেলুন।' : 'কলা, পেঁপে ও লম্বা সবজিতে খুঁটি দিন।',
          'বীজ ও কাটা শস্য মুখবন্ধ বস্তায় উঁচু মাচায় রাখুন।',
          'আবহাওয়া অধিদপ্তরের সংকেত মেনে চলুন, প্রয়োজনে আশ্রয়কেন্দ্রে যান।',
        ],
      },
      when: fmtDay(stormDays[0].date),
    });
  }

  // 5. Cold wave (BMD: mild 8–10 °C, moderate 6–8 °C, severe < 6 °C)
  const coldDays = d.filter((x) => x.tmin <= 10);
  if (coldDays.length) {
    const low = Math.min(...coldDays.map((x) => x.tmin));
    const sev = low < 6 ? { en: 'Severe', bn: 'তীব্র' } : low < 8 ? { en: 'Moderate', bn: 'মাঝারি' } : { en: 'Mild', bn: 'মৃদু' };
    alerts.push({
      id: 'cold',
      level: low < 6 ? 'danger' : low < 8 ? 'warning' : 'watch',
      emoji: '🥶',
      title: { en: `${sev.en} cold wave`, bn: `${sev.bn} শৈত্যপ্রবাহ` },
      detail: {
        en: `Night temperature down to ${low.toFixed(1)} °C from ${fmtDay(coldDays[0].date)}.`,
        bn: `${fmtDay(coldDays[0].date)} থেকে রাতের তাপমাত্রা ${low.toFixed(1)}°সে পর্যন্ত নামতে পারে।`,
      },
      advice: {
        en: [
          'Cover Boro seedbeds with clear polythene at night, open during the day.',
          'Keep 2–3 cm water in seedbeds and drain cold water in the morning.',
          'Protect livestock with jute sacks and dry bedding.',
        ],
        bn: [
          'রাতে বোরো বীজতলা স্বচ্ছ পলিথিন দিয়ে ঢেকে দিন, দিনে খুলে দিন।',
          'বীজতলায় ২–৩ সেমি পানি রাখুন, সকালে ঠান্ডা পানি বের করে দিন।',
          'গবাদি পশুকে চট দিয়ে ঢেকে ও শুকনো বিছানা দিয়ে রক্ষা করুন।',
        ],
      },
      when: fmtDay(coldDays[0].date),
    });
  }

  // 6. Potato late blight (cool + humid: RH ≥ 90 %, 10–25 °C for ≥ 10 h/day, 2 days)
  if (crop === 'potato' || crop === 'vegetables') {
    const byDay = new Map<string, number>();
    for (const h of forecast.hourly) {
      if (h.rh >= 90 && h.temp >= 10 && h.temp <= 25) {
        const day = h.time.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
    }
    const days = [...byDay.entries()].filter(([, n]) => n >= 10).map(([k]) => k).sort();
    let consecutive = false;
    for (let i = 1; i < days.length; i++) {
      const gap = (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86400000;
      if (gap === 1) consecutive = true;
    }
    if (consecutive) {
      alerts.push({
        id: 'late_blight',
        level: 'warning',
        emoji: '🍂',
        title: { en: 'Late blight weather', bn: 'নাবি ধসা রোগের আবহাওয়া' },
        detail: {
          en: `Cool, foggy and humid conditions for ${days.length} days: ideal for late blight (Phytophthora) on potato and tomato.`,
          bn: `${days.length} দিন ঠান্ডা, কুয়াশাচ্ছন্ন ও আর্দ্র আবহাওয়া: আলু ও টমেটোতে নাবি ধসা রোগের জন্য অনুকূল।`,
        },
        advice: {
          en: [
            'Spray a preventive fungicide (e.g. mancozeb) as advised by your local agriculture officer.',
            'Stop irrigation while fog persists.',
            'Remove and destroy infected plants immediately.',
          ],
          bn: [
            'উপসহকারী কৃষি কর্মকর্তার পরামর্শে প্রতিরোধমূলক ছত্রাকনাশক (যেমন ম্যানকোজেব) স্প্রে করুন।',
            'কুয়াশা থাকা অবস্থায় সেচ বন্ধ রাখুন।',
            'আক্রান্ত গাছ তুলে নষ্ট করে ফেলুন।',
          ],
        },
        when: fmtDay(days[0]),
      });
    }
  }

  // 7. Monsoon onset (late May – June): three wet days in a row
  if (month >= 5 && month <= 7) {
    let run = 0;
    let onset: string | null = null;
    for (const x of d) {
      run = x.rain >= 10 ? run + 1 : 0;
      if (run >= 3 && !onset) onset = x.date;
    }
    if (onset) {
      alerts.push({
        id: 'monsoon',
        level: 'info',
        emoji: '🌧️',
        title: { en: 'Monsoon onset likely', bn: 'বর্ষা শুরুর সম্ভাবনা' },
        detail: {
          en: `Three or more consecutive rainy days expected around ${fmtDay(onset)}.`,
          bn: `${fmtDay(onset)} নাগাদ টানা তিন বা তার বেশি দিন বৃষ্টির সম্ভাবনা।`,
        },
        advice: {
          en: ['Prepare Aman seedbeds on raised land.', 'Clear field drains and canals.', 'Good time to plant trees: survival is highest now.'],
          bn: ['উঁচু জমিতে আমনের বীজতলা তৈরি করুন।', 'জমির নালা ও খাল পরিষ্কার রাখুন।', 'গাছ লাগানোর উপযুক্ত সময়: এখন চারা বাঁচার হার সবচেয়ে বেশি।'],
        },
        when: fmtDay(onset),
      });
    }
  }

  // 8. Lightning (high CAPE + likely rain), deadly for farmers in open fields
  // Look at the next 72 h only; CAPE is routinely high in Bangladesh, so require likely rain too.
  const stormyHours = forecast.hourly.slice(0, 72).filter((h) => h.cape >= 2000 && h.precipProb >= 50);
  if (stormyHours.length) {
    const first = stormyHours[0].time;
    alerts.push({
      id: 'lightning',
      level: stormyHours.some((h) => h.cape >= 3000 && h.precipProb >= 70) ? 'danger' : 'warning',
      emoji: '⚡',
      title: { en: 'Lightning risk', bn: 'বজ্রপাতের ঝুঁকি' },
      detail: {
        en: `Atmosphere is highly unstable (CAPE up to ${Math.round(Math.max(...stormyHours.map((h) => h.cape)))} J/kg) with thunderstorms likely.`,
        bn: `বায়ুমণ্ডল খুবই অস্থিতিশীল, বজ্রঝড়ের সম্ভাবনা রয়েছে।`,
      },
      advice: {
        en: [
          'Leave open fields when dark clouds gather, usually in the afternoon.',
          'Do not shelter under isolated trees; crouch low with feet together if caught outside.',
          'Avoid ponds, canals and metal tools during storms.',
        ],
        bn: [
          'কালো মেঘ দেখলেই খোলা মাঠ ছেড়ে নিরাপদ স্থানে যান, সাধারণত বিকেলে।',
          'একা দাঁড়ানো গাছের নিচে আশ্রয় নেবেন না; বাইরে থাকলে পা জোড়া করে নিচু হয়ে বসুন।',
          'ঝড়ের সময় পুকুর, খাল ও ধাতব যন্ত্রপাতি থেকে দূরে থাকুন।',
        ],
      },
      when: fmtDay(first.slice(0, 10)) + ' ' + first.slice(11, 16),
    });
  }

  // 9. Extreme heat for field workers
  const hiDays = d
    .map((x) => {
      const noonRh = forecast.hourly.find((h) => h.time.startsWith(x.date) && h.time.endsWith('13:00'))?.rh ?? 60;
      return { ...x, hi: heatIndex(x.tmax, noonRh) };
    })
    .filter((x) => x.hi >= 41);
  if (hiDays.length) {
    const peak = Math.max(...hiDays.map((x) => x.hi));
    alerts.push({
      id: 'worker_heat',
      level: peak >= 54 ? 'danger' : 'warning',
      emoji: '🥵',
      title: { en: 'Dangerous heat for field work', bn: 'মাঠে কাজের জন্য বিপজ্জনক গরম' },
      detail: {
        en: `Feels-like temperature up to ${peak.toFixed(0)} °C.`,
        bn: `অনুভূত তাপমাত্রা ${peak.toFixed(0)}°সে পর্যন্ত।`,
      },
      advice: {
        en: ['Work early morning and late afternoon.', 'Drink water with ORS every 20 minutes.', 'Rest in shade; watch for dizziness and stop work if unwell.'],
        bn: ['ভোরে ও বিকেলে কাজ করুন।', 'প্রতি ২০ মিনিটে খাবার স্যালাইনসহ পানি পান করুন।', 'ছায়ায় বিশ্রাম নিন; মাথা ঘুরালে কাজ বন্ধ করুন।'],
      },
      when: fmtDay(hiDays[0].date),
    });
  }

  const order: Record<AlertLevel, number> = { danger: 0, warning: 1, watch: 2, info: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  return { alerts, forecast, rain30: rain30 != null ? Math.round(rain30) : null, region };
}
