'use client';
/**
 * Render the API's structured text (I18nText, prompt-v1 §9) from the `server` message namespace.
 * Params are made readable: ISO dates become short localized days ("Sat 8 Nov"), numbers get native
 * digits. Unknown codes are humanized rather than shown raw.
 */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { I18nText, ZoneSummary } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function humanize(code: string): string {
  const last = code.split('.').pop() ?? code;
  const s = last.replace(/[_-]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : code;
}

export function useServerText() {
  const ts = useTranslations('server');
  const { f } = useCz();
  return useCallback(
    (x: I18nText | string | null | undefined): string => {
      if (!x) return '';
      if (typeof x === 'string') return x;
      const params: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(x.params ?? {})) {
        if (typeof v === 'string' && ISO_DAY.test(v)) params[k] = f.date(v, { weekday: 'short', day: 'numeric', month: 'short' });
        else if (typeof v === 'number') params[k] = Number.isInteger(v) ? f.loc(v) : f.dec(v, 1);
        else params[k] = v;
      }
      return ts.has(x.code) ? ts(x.code, params) : humanize(x.code);
    },
    [ts, f],
  );
}

/** A zone's stored name, or "Zone N" while the naming job has not run yet. */
export function useZoneName() {
  const tx = useServerText();
  return useCallback(
    (z: Pick<ZoneSummary, 'name' | 'name_text' | 'rank'> | null | undefined): string => {
      if (!z) return '';
      return z.name || tx(z.name_text ?? { code: 'zone.unnamed', params: { n: z.rank } });
    },
    [tx],
  );
}
