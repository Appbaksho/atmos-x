'use client';
/** Verification reason text: server codes (`server.verify.*`) first, then client codes (`act.reason.*`). */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

export function useReasonText() {
  const ts = useTranslations('server');
  const ta = useTranslations('act.reason');
  return useCallback(
    (code: string) => (ts.has(`verify.${code}`) ? ts(`verify.${code}`) : ta.has(code) ? ta(code) : ta('unavailable')),
    [ts, ta],
  );
}
