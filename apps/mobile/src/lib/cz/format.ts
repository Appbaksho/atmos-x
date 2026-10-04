/**
 * Locale + unit formatting shared by every CoolZone screen.
 * Mirrors the prototype helpers: `loc` (native digits), `deg`, `dC` (signed delta) and `tk` (taka).
 */
export type Lang = 'en' | 'bn' | 'ur';
export type Unit = 'C' | 'F';

const DIGITS: Partial<Record<Lang, string>> = { bn: '০১২৩৪৫৬৭৮৯', ur: '۰۱۲۳۴۵۶۷۸۹' };

/** Swap ASCII digits for Bangla / Urdu digits. */
export function locDigits(lang: Lang, s: string | number): string {
  const d = DIGITS[lang];
  const str = String(s);
  return d ? str.replace(/[0-9]/g, (x) => d[Number(x)]) : str;
}

export type Fmt = {
  lang: Lang;
  unit: Unit;
  rtl: boolean;
  /** Native digits */
  loc: (s: string | number) => string;
  /** Absolute temperature from °C, e.g. "34°" */
  deg: (c: number, dp?: number) => string;
  /** Signed temperature delta from °C with unit, e.g. "−1.5 °C" / "+2.7 °F" */
  dC: (c: number, dp?: number) => string;
  /** Bangladeshi taka, e.g. "৳ 12,400" */
  tk: (n: number) => string;
  /** Grouped integer, e.g. "18,420" */
  num: (n: number) => string;
  /** Pick the dictionary for the current language, falling back to English per key */
  pick: <T extends object>(dict: { en: T } & Partial<Record<Lang, Partial<T>>>) => T;
  /** Back / forward chevron paths that respect RTL */
  backPath: string;
  fwdPath: string;
  arrowPath: string;
};

export function makeFmt(lang: Lang, unit: Unit): Fmt {
  const F = unit === 'F';
  const loc = (s: string | number) => locDigits(lang, s);
  const rtl = lang === 'ur';
  return {
    lang,
    unit,
    rtl,
    loc,
    deg: (c, dp = 0) => loc((F ? (c * 9) / 5 + 32 : c).toFixed(dp)) + '°',
    dC: (c, dp = 1) => (c < 0 ? '−' : '+') + loc(Math.abs(F ? (c * 9) / 5 : c).toFixed(dp)) + (F ? ' °F' : ' °C'),
    tk: (n) => '৳ ' + loc(Math.round(n).toLocaleString('en-IN')),
    num: (n) => loc(Math.round(n).toLocaleString('en-IN')),
    pick: (dict) => ({ ...dict.en, ...(dict[lang] ?? {}) }) as any,
    backPath: rtl ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7',
    fwdPath: rtl ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7',
    arrowPath: rtl ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6',
  };
}

/** Initials from a display name ("Hall Rooftop Crew" → "HR"). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}
