/**
 * Shared "My trees" copy + maths (S20 list, S20T detail). Ported from the prototype's `MT` block.
 * Dates are handled as ISO `YYYY-MM-DD` strings and shifted in UTC so they never drift a day
 * across time zones.
 */
import { B, type Palette } from '@/constants/cz';
import { DEMO_TODAY, photoDueIn, type MyTree, type SpeciesKey } from '@/lib/cz/demo';
import type { Lang } from '@/lib/cz/format';

export const MT = {
  en: {
    title: 'My trees', add: 'Add tree', cancel: 'Cancel', hint: 'Tap the map where you planted it', date: 'Planting date', save: 'Save tree',
    pinFirst: 'Pin it on the map first', planted: 'Planted', od: 'Photo overdue {n} days', today: 'Photo due today', soon: 'Photo due in {n} days',
    ok: 'Next photo in {n} days', pinned: 'Pinned on map', rule: 'Each tree needs a photo every 15 days. Due and overdue trees also show on Home.',
    sp: { neem: 'Neem', krish: 'Krishnachura', jarul: 'Jarul', arjun: 'Arjun', bokul: 'Bokul', aam: 'Mango' } as Record<SpeciesKey, string>,
  },
  bn: {
    title: 'আমার গাছ', add: 'গাছ যোগ', cancel: 'বাতিল', hint: 'যেখানে লাগিয়েছেন মানচিত্রে সেখানে ট্যাপ করুন', date: 'লাগানোর তারিখ', save: 'গাছ সংরক্ষণ',
    pinFirst: 'আগে মানচিত্রে জায়গা দিন', planted: 'লাগানো', od: 'ছবি {n} দিন দেরি', today: 'আজ ছবি দিতে হবে', soon: '{n} দিনের মধ্যে ছবি',
    ok: 'পরের ছবি {n} দিন পর', pinned: 'মানচিত্রে চিহ্নিত', rule: 'প্রতি ১৫ দিনে প্রতিটি গাছের ছবি দিতে হবে। বাকি থাকলে হোম পেজেও দেখাবে।',
    sp: { neem: 'নিম', krish: 'কৃষ্ণচূড়া', jarul: 'জারুল', arjun: 'অর্জুন', bokul: 'বকুল', aam: 'আম' } as Record<SpeciesKey, string>,
  },
  ur: {
    title: 'میرے درخت', add: 'درخت شامل', cancel: 'منسوخ', hint: 'نقشے پر وہاں ٹیپ کریں جہاں لگایا', date: 'لگانے کی تاریخ', save: 'محفوظ کریں',
    pinFirst: 'پہلے نقشے پر جگہ لگائیں', planted: 'لگایا', od: 'تصویر {n} دن تاخیر', today: 'آج تصویر دینی ہے', soon: '{n} دن میں تصویر',
    ok: 'اگلی تصویر {n} دن بعد', pinned: 'نقشے پر نشان', rule: 'ہر ۱۵ دن بعد ہر درخت کی تصویر دیں۔ باقی ہوں تو ہوم پر بھی دکھیں گی۔',
    sp: { neem: 'نیم', krish: 'گل مہر', jarul: 'جارول', arjun: 'ارجن', bokul: 'مولسری', aam: 'آم' } as Record<SpeciesKey, string>,
  },
};
export type MtCopy = (typeof MT)['en'];

export const SPECIES_KEYS: SpeciesKey[] = ['neem', 'krish', 'jarul', 'arjun', 'bokul', 'aam'];

/** "Today" for the demo story as ISO. */
export const TODAY_ISO = '2026-10-02';
export const DAY = 864e5;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (iso: string) => new Date(iso + 'T00:00:00Z');

/** "14 Sep" (prototype `fmtD`), optionally with the year. */
export function fmtD(iso: string, loc: (s: string | number) => string, year = false): string {
  const d = utc(iso);
  if (isNaN(d.getTime())) return iso;
  return loc(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + (year ? ' ' + loc(d.getUTCFullYear()) : '');
}

/** Shift an ISO date by whole days. */
export function addDays(iso: string, n: number): string {
  return new Date(utc(iso).getTime() + n * DAY).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / DAY);
}

export type TreeStatus = { label: string; bg: string; fg: string; urgent: boolean; overdue: boolean };

/** Photo-due status chip for a tree (prototype `stat`). */
export function treeStatus(t: MyTree, X: MtCopy, loc: (s: string | number) => string, c: Palette): TreeStatus {
  const n = photoDueIn(t, DEMO_TODAY);
  if (n < 0) return { label: X.od.replace('{n}', loc(-n)), bg: B.deepRed, fg: B.white, urgent: true, overdue: true };
  if (n === 0) return { label: X.today, bg: B.orange, fg: B.navy, urgent: true, overdue: false };
  if (n <= 3) return { label: X.soon.replace('{n}', loc(n)), bg: 'rgba(242,154,56,0.22)', fg: c.ink, urgent: false, overdue: false };
  return { label: X.ok.replace('{n}', loc(n)), bg: c.limeSoft, fg: c.ink, urgent: false, overdue: false };
}

export const mtCopy = (lang: Lang): MtCopy => MT[lang] ?? MT.en;

/** Tree display name (falls back to the species name). */
export const treeName = (t: MyTree, X: MtCopy) => t.name || X.sp[t.sp] || t.sp;
