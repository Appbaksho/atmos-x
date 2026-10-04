/**
 * Render server-produced text (I18nText) on the client: t(`server.${code}`, params).
 * Accepts plain strings too (AI text, already in the user's language).
 */
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { I18nText, Locale } from '@/lib/data/types';
import { formatTextParams } from '@/lib/format';

export type ServerText = I18nText | string | null | undefined;

function humanize(code: string): string {
  const last = code.split('.').pop() ?? code;
  return last.replace(/[_-]+/g, ' ');
}

/** `const ts = useTServer(); ts(zone.causes[0])` */
export function useTServer() {
  const t = useTranslations('server');
  const lang = useLocale() as Locale;
  return useCallback(
    (x: ServerText): string => {
      if (x == null) return '';
      if (typeof x === 'string') return x;
      // Numbers are formatted here (grouping + native digits): "2,920 m²", not "2920 m²".
      return t.has(x.code) ? t(x.code, formatTextParams(lang, x.params)) : humanize(x.code);
    },
    [t, lang],
  );
}
