import Storage from 'expo-sqlite/kv-store';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { DARK, FONT, LIGHT, Palette, Weight } from '@/constants/cz';
import { DEMO_TREES, MyTree } from '@/lib/cz/demo';
import { Fmt, Lang, makeFmt, Unit } from '@/lib/cz/format';

export type Prefs = {
  lang: Lang;
  unit: Unit;
  dark: boolean;
  farmer: boolean;
  /** Show the floating Ask Atmos button */
  askOn: boolean;
  /** Scan radius in metres (100–1000) */
  radius: number;
  area: 'metric' | 'imperial';
  onboarded: boolean;
  trees: MyTree[];
};

const DEFAULTS: Prefs = {
  lang: 'en',
  unit: 'C',
  dark: false,
  farmer: false,
  askOn: true,
  radius: 500,
  area: 'metric',
  onboarded: false,
  trees: DEMO_TREES,
};

const KEY = 'cz-prefs-v1';

function load(): Prefs {
  try {
    const raw = Storage.getItemSync(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // storage unavailable (e.g. first run on web) — use defaults
  }
  return DEFAULTS;
}

type PrefsState = {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  /** Theme palette for the current light/dark preference */
  c: Palette;
  /** Locale/unit formatter */
  f: Fmt;
  /** Font family for the current language at a weight */
  font: (w?: Weight) => string;
  /** Display face (Lemon/Milk) — falls back to the body face for Bangla/Urdu, which it can't render */
  display: string;
};

const Ctx = createContext<PrefsState | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);

  const setPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      Storage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<PrefsState>(() => {
    const fam = prefs.lang === 'bn' ? FONT.bn : prefs.lang === 'ur' ? FONT.ur : FONT.latin;
    return {
      prefs,
      setPref,
      c: prefs.dark ? DARK : LIGHT,
      f: makeFmt(prefs.lang, prefs.unit),
      font: (w = 400) => fam[w],
      display: prefs.lang === 'en' ? FONT.display : fam[600],
    };
  }, [prefs, setPref]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCz() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCz must be used inside PrefsProvider');
  return v;
}
