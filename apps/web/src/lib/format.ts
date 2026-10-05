/**
 * Locale + unit formatting shared by every screen. Port of apps/mobile/src/lib/cz/format.ts,
 * extended to the 10 v0 locales with Intl. Same helper names as the prototype: `loc` (native
 * digits), `deg`, `dC` (signed delta) and `tk` (taka), plus money/distance/date helpers.
 * Get one from `useCz().f`; `makeFmt` is for non-React code.
 */
import type { AreaUnit, Locale, Money, Unit } from '@/lib/data/types';

export type Lang = Locale;
export type { Unit };

/** Native digit sets. Hindi, Chinese and the Latin locales keep ASCII digits (common usage). */
const DIGITS: Partial<Record<Lang, string>> = {
  bn: '০১২৩৪৫৬৭৮৯',
  ur: '۰۱۲۳۴۵۶۷۸۹',
  ar: '٠١٢٣٤٥٦٧٨٩',
};

const RTL: ReadonlySet<Lang> = new Set<Lang>(['ur', 'ar']);

/** Locale used for grouping (South Asian lakh grouping for en/bn/ur/hi, like the prototype). */
const GROUPING: Record<Lang, string> = {
  en: 'en-IN',
  bn: 'en-IN',
  ur: 'en-IN',
  hi: 'en-IN',
  ar: 'ar-u-nu-latn',
  es: 'es-u-nu-latn',
  fr: 'fr-u-nu-latn',
  pt: 'pt-u-nu-latn',
  id: 'id-u-nu-latn',
  zh: 'zh-u-nu-latn',
};

/** BCP-47 tags for dates (Bangladesh/Pakistan/India regional variants). */
const DATE_LOCALE: Record<Lang, string> = {
  en: 'en-GB',
  bn: 'bn-BD',
  ur: 'ur-PK',
  hi: 'hi-IN',
  ar: 'ar',
  es: 'es',
  fr: 'fr',
  pt: 'pt-BR',
  id: 'id-ID',
  zh: 'zh-CN',
};

/** Short distance units per locale. */
const DIST: Record<Lang, { m: string; km: string; ft: string; mi: string }> = {
  en: { m: 'm', km: 'km', ft: 'ft', mi: 'mi' },
  bn: { m: 'মি', km: 'কিমি', ft: 'ফুট', mi: 'মাইল' },
  ur: { m: 'میٹر', km: 'کلومیٹر', ft: 'فٹ', mi: 'میل' },
  hi: { m: 'मी', km: 'किमी', ft: 'फ़ुट', mi: 'मील' },
  ar: { m: 'م', km: 'كم', ft: 'قدم', mi: 'ميل' },
  es: { m: 'm', km: 'km', ft: 'ft', mi: 'mi' },
  fr: { m: 'm', km: 'km', ft: 'ft', mi: 'mi' },
  pt: { m: 'm', km: 'km', ft: 'ft', mi: 'mi' },
  id: { m: 'm', km: 'km', ft: 'kaki', mi: 'mil' },
  zh: { m: '米', km: '公里', ft: '英尺', mi: '英里' },
};

/**
 * Bidi isolate (FSI … PDI). In RTL locales a value like "−1.5 °C", "৳ 3,25,400" or "34°" is laid
 * out by the surrounding Urdu/Arabic text and comes out reordered ("C° 1.5−"). Wrapping it in a
 * first-strong isolate makes it render as one left-to-right unit. Every unit/sign formatter below
 * applies it in RTL locales, so screens get it for free (no-op in LTR locales).
 */
export const FSI = '\u2068';
export const PDI = '\u2069';
export const bidiIsolate = (s: string) => (s ? FSI + s + PDI : s);
/** Remove the isolate marks again (for code that needs the bare text). */
export const stripBidi = (s: string) => s.replace(/[\u2066-\u2069]/g, '');

/** Swap ASCII digits for the locale's native digits. */
export function locDigits(lang: Lang, s: string | number): string {
  const d = DIGITS[lang];
  const str = String(s);
  return d ? str.replace(/[0-9]/g, (x) => d[Number(x)]) : str;
}

type DictOf<T> = { en: T } & Partial<Record<Lang, Partial<T>>>;

export type Fmt = {
  lang: Lang;
  unit: Unit;
  area: AreaUnit;
  rtl: boolean;
  /** Native digits */
  loc: (s: string | number) => string;
  /** Absolute temperature from °C, e.g. "34°" */
  deg: (c: number, dp?: number) => string;
  /** Absolute temperature with unit, e.g. "34 °C" / "93 °F" */
  temp: (c: number, dp?: number) => string;
  /** Signed temperature delta from °C with unit, e.g. "−1.5 °C" / "+2.7 °F" */
  dC: (c: number, dp?: number) => string;
  /** Unsigned temperature difference from °C with unit, e.g. "1.5 °C" (for "x above normal") */
  dAbs: (c: number, dp?: number) => string;
  /** Wrap any value in a bidi isolate in RTL locales (no-op otherwise) */
  iso: (s: string) => string;
  /** Bangladeshi taka, e.g. "৳ 12,400" */
  tk: (n: number) => string;
  /** Any currency via Intl (BDT keeps the prototype's "৳ 12,400" style) */
  money: (m: Money | null | undefined) => string;
  /** Grouped integer, e.g. "18,420" */
  num: (n: number) => string;
  /** Decimal with fixed places, native digits, e.g. "1.5" */
  dec: (n: number, dp?: number) => string;
  /** Percent, e.g. "38%" */
  pct: (n: number, dp?: number) => string;
  /** Distance from metres in the user's area unit: "350 m", "1.2 km", "800 ft", "0.7 mi" */
  dist: (m: number) => string;
  /** Area from m²: "120 m²" / "1,290 ft²" */
  area2: (m2: number) => string;
  /** Date, e.g. "5 Oct 2026" (opts override) */
  date: (iso: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
  /** Short weekday, e.g. "Sat" */
  weekday: (iso: string | Date) => string;
  /** Time, e.g. "14:00" */
  time: (iso: string | Date) => string;
  /** Relative time, e.g. "3 hours ago", "in 2 days" */
  rel: (iso: string | Date, now?: Date) => string;
  /** Pick the dictionary for the current language, falling back to English per key */
  pick: <T extends object>(dict: DictOf<T>) => T;
  /** Back / forward chevron paths that respect RTL */
  backPath: string;
  fwdPath: string;
  arrowPath: string;
};

const asDate = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d);

export function makeFmt(lang: Lang, unit: Unit = 'C', area: AreaUnit = 'metric', rtlOverride?: boolean): Fmt {
  const F = unit === 'F';
  const imperial = area === 'imperial';
  const loc = (s: string | number) => locDigits(lang, s);
  const rtl = rtlOverride ?? RTL.has(lang);
  const group = new Intl.NumberFormat(GROUPING[lang], { maximumFractionDigits: 0 });
  const dl = DATE_LOCALE[lang];
  const u = DIST[lang];
  const dec = (n: number, dp = 1) => loc(n.toFixed(dp));
  const num = (n: number) => loc(group.format(Math.round(n)));
  const relFmt = new Intl.RelativeTimeFormat(dl, { numeric: 'auto' });

  // Values with signs/units are isolated in RTL so Urdu/Arabic text can't reorder them.
  const iso = (s: string) => (rtl ? bidiIsolate(s) : s);
  const absDelta = (c: number, dp: number) => loc(Math.abs(F ? (c * 9) / 5 : c).toFixed(dp)) + (F ? ' °F' : ' °C');

  return {
    lang,
    unit,
    area,
    rtl,
    loc,
    iso,
    deg: (c, dp = 0) => iso(loc((F ? (c * 9) / 5 + 32 : c).toFixed(dp)) + '°'),
    temp: (c, dp = 0) => iso(loc((F ? (c * 9) / 5 + 32 : c).toFixed(dp)) + (F ? ' °F' : ' °C')),
    dC: (c, dp = 1) => iso((c < 0 ? '−' : '+') + absDelta(c, dp)),
    dAbs: (c, dp = 1) => iso(absDelta(c, dp)),
    tk: (n) => iso('৳ ' + num(n)),
    money: (m) => {
      if (!m) return '';
      if (m.currency === 'BDT') return iso('৳ ' + num(m.amount));
      try {
        const s = new Intl.NumberFormat(GROUPING[lang], { style: 'currency', currency: m.currency, maximumFractionDigits: m.amount >= 100 ? 0 : 2 }).format(m.amount);
        return iso(loc(s));
      } catch {
        return iso(`${m.currency} ${num(m.amount)}`);
      }
    },
    num,
    dec,
    pct: (n, dp = 0) => loc(n.toFixed(dp)) + '%',
    dist: (m) => {
      if (imperial) {
        const ft = m * 3.28084;
        return ft < 1000 ? `${num(ft)} ${u.ft}` : `${dec(m / 1609.344, 1)} ${u.mi}`;
      }
      return m < 1000 ? `${num(m)} ${u.m}` : `${dec(m / 1000, m < 10000 ? 1 : 0)} ${u.km}`;
    },
    area2: (m2) => iso(imperial ? `${num(m2 * 10.7639)} ft²` : `${num(m2)} m²`),
    date: (iso, opts) => loc(new Intl.DateTimeFormat(dl, opts ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(asDate(iso))),
    weekday: (iso) => new Intl.DateTimeFormat(dl, { weekday: 'short' }).format(asDate(iso)),
    time: (iso) => loc(new Intl.DateTimeFormat(dl, { hour: '2-digit', minute: '2-digit', hour12: false }).format(asDate(iso))),
    rel: (iso, now = new Date()) => {
      const s = (asDate(iso).getTime() - now.getTime()) / 1000;
      const a = Math.abs(s);
      const [v, unitName]: [number, Intl.RelativeTimeFormatUnit] =
        a < 60 ? [s, 'second'] : a < 3600 ? [s / 60, 'minute'] : a < 86400 ? [s / 3600, 'hour'] : a < 86400 * 30 ? [s / 86400, 'day'] : a < 86400 * 365 ? [s / (86400 * 30), 'month'] : [s / (86400 * 365), 'year'];
      return loc(relFmt.format(Math.round(v), unitName));
    },
    pick: <T extends object>(dict: DictOf<T>) => ({ ...dict.en, ...(dict[lang] ?? {}) }) as T,
    backPath: rtl ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7',
    fwdPath: rtl ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7',
    arrowPath: rtl ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6',
  };
}

/** Initials from a display name ("Hall Rooftop Crew" → "HR"). */
export function initials(name: string): string {
  const caps = name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  if (caps) return caps;
  // Non-Latin names: first letters of the first two words.
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('');
}

/** Param names that hold years ("2005"), which must not get thousands separators. */
const YEAR_PARAM = /^(from|to|year|years|since|until_year)$/;

/**
 * Format the numeric params of a server I18nText (`{roof_m2: 2920}`) for display: grouping, at
 * most 2 decimals and native digits ("2,920 m²", "২,৯২০ মি²"). ICU simple arguments are otherwise
 * printed with String(n). Number-like strings ("14:00", "4, 5, 6") get native digits too.
 */
export function formatTextParams(lang: Lang, params: Record<string, string | number> | undefined): Record<string, string> | undefined {
  if (!params) return params;
  const grouped = new Intl.NumberFormat(GROUPING[lang], { maximumFractionDigits: 2 });
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = locDigits(lang, YEAR_PARAM.test(k) && Number.isInteger(v) ? String(v) : grouped.format(v));
    } else if (typeof v === 'string' && /^[\d\s.,:;–\-/]+$/.test(v)) {
      out[k] = locDigits(lang, v);
    } else {
      out[k] = String(v);
    }
  }
  return out;
}
