/**
 * Render server-produced text (I18nText) on the client: t(`server.${code}`, params).
 * Accepts plain strings too (AI text, already in the user's language).
 */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { I18nText } from '@/lib/data/types';

export type ServerText = I18nText | string | null | undefined;

function humanize(code: string): string {
  const last = code.split('.').pop() ?? code;
  return last.replace(/[_-]+/g, ' ');
}

/** `const ts = useTServer(); ts(zone.causes[0])` */
export function useTServer() {
  const t = useTranslations('server');
  return useCallback(
    (x: ServerText): string => {
      if (x == null) return '';
      if (typeof x === 'string') return x;
      return t.has(x.code) ? t(x.code, x.params) : humanize(x.code);
    },
    [t],
  );
}
