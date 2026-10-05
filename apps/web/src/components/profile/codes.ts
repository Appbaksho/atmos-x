'use client';
/**
 * Text for the data layer's I18nText codes that V0-6 screens show (action types, levels, badges,
 * notifications, species). Looks in the `server` namespace first (V0-2), then in `profile.code`
 * (V0-6 copy), then humanises the code. Params are pre-processed so notification titles read well:
 * `action` ids become action titles, `reason` codes become sentences, numbers get native digits.
 */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { useCz } from '@/components/cz';
import type { ActionTypeId, I18nText } from '@/lib/data/types';

export function humanize(code: string): string {
  const last = code.split('.').pop() ?? code;
  const s = last.replace(/[_-]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : code;
}

type Params = Record<string, string | number>;

export function useCodeText() {
  const ts = useTranslations('server');
  const tp = useTranslations('profile.code');
  const tsp = useTranslations('profile.sp');
  const { f } = useCz();

  const raw = useCallback(
    (code: string, params?: Params): string => {
      if (ts.has(code)) return ts(code, params);
      if (tp.has(code)) return tp(code, params);
      return humanize(code);
    },
    [ts, tp],
  );

  const action = useCallback((id: ActionTypeId | string) => raw(`action.${id}`), [raw]);
  const level = useCallback((nameCode: string) => raw(nameCode), [raw]);
  const badge = useCallback((code: string) => raw(code), [raw]);
  const species = useCallback((id: string) => (tsp.has(id) ? tsp(id) : humanize(id)), [tsp]);

  const reason = useCallback(
    (code: string | number | undefined) => {
      if (code == null || code === '') return tp('notif.verification.pending_body_none');
      const c = String(code);
      if (tp.has(`reason.${c}`)) return tp(`reason.${c}`);
      if (ts.has(`verify.${c}`)) return ts(`verify.${c}`);
      return tp('notif.verification.pending_body_none');
    },
    [tp, ts],
  );

  /** Render any I18nText (or plain string) with friendly params. */
  const text = useCallback(
    (x: I18nText | string | null | undefined): string => {
      if (x == null) return '';
      if (typeof x === 'string') return x;
      const p: Params = {};
      for (const [k, v] of Object.entries(x.params ?? {})) p[k] = v;
      if (typeof p.action === 'string') p.action = action(p.action);
      if (x.code === 'notif.verification.pending_body') return reason(p.reason);
      if (typeof p.name === 'string') p.name = tsp.has(p.name) ? tsp(p.name) : p.name;
      if (typeof p.level === 'string' && ts.has(`bmd.${p.level}`)) p.level = ts(`bmd.${p.level}`);
      if (typeof p.feels === 'number') p.feels = f.deg(p.feels);
      // plural selectors keep the raw number; display copies get native digits
      if (typeof p.days === 'number') {
        p.count = p.days;
        p.days = f.loc(p.days);
      }
      for (const k of ['qty', 'points', 'pct', 'every'] as const) if (typeof p[k] === 'number') p[k] = f.loc(p[k] as number);
      return raw(x.code, p);
    },
    [action, reason, raw, tsp, ts, f],
  );

  return { text, action, level, badge, species, reason };
}
