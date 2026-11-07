'use client';
/** Verification reason text: server codes (`server.verify.*`) first, then client codes (`act.reason.*`). */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { useCz } from '@/components/cz';

export function useReasonText() {
  const ts = useTranslations('server');
  const ta = useTranslations('act.reason');
  const { f } = useCz();
  return useCallback(
    (code: string, params?: Record<string, string | number>) => {
      const p: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(params ?? {})) p[k] = typeof v === 'number' ? (k.endsWith('_m') ? f.dist(v) : f.loc(v)) : v;
      if (ts.has(`verify.${code}`)) return ts(`verify.${code}`, p);
      if (ta.has(code)) return ta(code, p);
      return ta('unavailable');
    },
    [ts, ta, f],
  );
}
