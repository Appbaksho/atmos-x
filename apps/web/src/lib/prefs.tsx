'use client';
/**
 * Prefs context: port of apps/mobile/src/context/prefs.tsx on top of the shared IndexedDB store
 * (src/lib/prefs-store.ts, also used by V0-3's data hooks, so both stay in sync).
 *
 *   const { c, f, font, fw, display, prefs, setPref, setPrefs, ready, dark, raw } = useCz();
 *
 * Mobile → web prefs keys: prefs.farmer → prefs.farmer_mode, prefs.askOn → prefs.ask_on,
 * prefs.radius → prefs.radius_m, prefs.dark → `dark` (resolved theme; prefs.theme is
 * 'light' | 'dark' | 'system'). prefs.trees moved to the data hooks (useTrees).
 *
 * - The rendered locale comes from the URL (`useLocale()`); `setPref('lang', x)` stores it and
 *   switches the locale route. On first load an unprefixed URL follows the stored language, and an
 *   explicitly prefixed URL (e.g. /ur/app) updates the stored language.
 * - `setPref('theme', x)` drives next-themes (persisted, no flash).
 */
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { usePathname as useRawPathname } from 'next/navigation';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useMounted } from '@/components/cz/hooks';
import { DARK, LIGHT, VARS, type Palette, type RawPalette, type Weight } from '@/components/cz/tokens';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type Locale } from '@/lib/data/types';
import { makeFmt, type Fmt } from '@/lib/format';
import { DEFAULT_PREFS, getPrefs, setPrefs as storeSetPrefs, subscribePrefs, type Prefs } from '@/lib/prefs-store';

export type { Prefs };

const LATIN_DISPLAY: ReadonlySet<Locale> = new Set<Locale>(['en', 'es', 'fr', 'pt', 'id']);

/** Per-script weight mapping (Noto Bengali has no 700, Nastaliq only 400/600), as on mobile. */
function mapWeight(lang: Locale, w: Weight): number {
  if (lang === 'bn') return w === 700 ? 600 : w;
  if (lang === 'ur') return w >= 600 ? 600 : 400;
  return w;
}

export type CzState = {
  prefs: Prefs;
  /** True once prefs were read from IndexedDB (before that, DEFAULT_PREFS are shown) */
  ready: boolean;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  /** Theme palette as CSS variables (+ resolved `dark`) */
  c: Palette;
  /** Raw hex palette for the resolved theme (MapLibre, canvas) */
  raw: RawPalette;
  /** Resolved dark mode (false on the server and before hydration) */
  dark: boolean;
  /** Locale/unit formatter */
  f: Fmt;
  /** Rendered locale (from the URL) */
  lang: Locale;
  /** Font family for the current language (weight is separate on the web: use `fw`) */
  font: (w?: Weight) => string;
  /** `{ fontFamily, fontWeight }` for the current language, e.g. style={{ ...fw(600) }} */
  fw: (w?: Weight) => { fontFamily: string; fontWeight: number };
  /** Display face: Lemon/Milk for Latin locales, the body face at 600 otherwise */
  display: string;
  /** Whether the display face is Lemon/Milk (Latin locales) */
  latinDisplay: boolean;
  /** Switch language (stores the pref and navigates to the locale route) */
  setLang: (l: Locale) => void;
};

const Ctx = createContext<CzState | null>(null);

/** Forces dark/rtl for a subtree (used by /dev/kit to show 4 modes side by side). */
type Scope = { dark?: boolean; rtl?: boolean };
const ScopeCtx = createContext<Scope>({});

export function CzScope({ dark, rtl, children }: Scope & { children: React.ReactNode }) {
  const parent = useContext(ScopeCtx);
  const value = useMemo(() => ({ dark: dark ?? parent.dark, rtl: rtl ?? parent.rtl }), [dark, rtl, parent.dark, parent.rtl]);
  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const locale = useLocale() as Locale;
  const { resolvedTheme, setTheme, theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const rawPathname = useRawPathname();
  const synced = useRef(false);

  useEffect(() => {
    let alive = true;
    getPrefs().then((p) => {
      if (!alive) return;
      setState(p);
      setReady(true);
    });
    const unsub = subscribePrefs((p) => alive && setState(p));
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const switchLocale = useCallback(
    (l: Locale) => {
      if (l === locale) return;
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(pathname + search, { locale: l });
    },
    [locale, pathname, router],
  );

  // One-time sync between the stored language and the URL locale.
  useEffect(() => {
    if (!ready || synced.current) return;
    synced.current = true;
    if (prefs.lang === locale) return;
    const first = rawPathname.split('/')[1] ?? '';
    const explicit = (LOCALES as readonly string[]).includes(first);
    if (explicit) storeSetPrefs({ lang: locale });
    else switchLocale(prefs.lang);
  }, [ready, prefs.lang, locale, rawPathname, switchLocale]);

  // Stored theme → next-themes.
  useEffect(() => {
    if (ready && theme !== prefs.theme) setTheme(prefs.theme);
  }, [ready, prefs.theme, theme, setTheme]);

  const setPrefs = useCallback(
    (patch: Partial<Prefs>) => {
      if (patch.theme) setTheme(patch.theme);
      storeSetPrefs(patch);
      if (patch.lang) switchLocale(patch.lang);
    },
    [setTheme, switchLocale],
  );

  const setPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>), [setPrefs]);
  const setLang = useCallback((l: Locale) => setPrefs({ lang: l }), [setPrefs]);

  // resolvedTheme is undefined on the server; it is only trusted after mount to avoid mismatches.
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === 'dark';

  const value = useMemo<CzState>(() => {
    const latinDisplay = LATIN_DISPLAY.has(locale);
    return {
      prefs,
      ready,
      setPref,
      setPrefs,
      c: { ...VARS, dark },
      raw: dark ? DARK : LIGHT,
      dark,
      f: makeFmt(locale, prefs.unit, prefs.area),
      lang: locale,
      font: () => 'var(--cz-font-body)',
      fw: (w = 400) => ({ fontFamily: 'var(--cz-font-body)', fontWeight: mapWeight(locale, w) }),
      display: 'var(--cz-font-display)',
      latinDisplay,
      setLang,
    };
  }, [prefs, ready, setPref, setPrefs, dark, locale, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The CoolZone context: palette, formatter, fonts and prefs. */
export function useCz(): CzState {
  const v = useContext(Ctx);
  const scope = useContext(ScopeCtx);
  if (!v) throw new Error('useCz must be used inside PrefsProvider');
  if (scope.dark === undefined && scope.rtl === undefined) return v;
  const dark = scope.dark ?? v.dark;
  return {
    ...v,
    dark,
    c: { ...v.c, dark },
    raw: dark ? DARK : LIGHT,
    f: scope.rtl === undefined ? v.f : makeFmt(v.f.lang, v.f.unit, v.f.area, scope.rtl),
  };
}

/** Just the prefs + setters. */
export function usePrefsContext() {
  const { prefs, ready, setPref, setPrefs, setLang } = useCz();
  return { prefs, ready, setPref, setPrefs, setLang };
}
