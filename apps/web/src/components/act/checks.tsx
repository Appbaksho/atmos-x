'use client';
/**
 * The deterministic evidence checks (§7.11) for an action or a tree check-in: one row per check with
 * pass / needs review / not applicable. Replaces V0's "what the AI saw".
 */
import { useTranslations } from 'next-intl';

import { B, I, Icon, Txt, View, useCz } from '@/components/cz';
import type { ActionCheck } from '@/lib/data/types';

import { useReasonText } from './reason';

export function ChecksList({ checks, compact = false }: { checks: readonly ActionCheck[]; compact?: boolean }) {
  const t = useTranslations('act.check');
  const reason = useReasonText();
  const { c, f } = useCz();
  return (
    <View role="list" style={{ gap: 0 }}>
      {checks.map((ch) => {
        const pass = ch.status === 'pass';
        const skip = ch.status === 'skip';
        const title = t.has(`${ch.code}.title`) ? t(`${ch.code}.title`) : ch.code;
        const dist = typeof ch.params?.dist_m === 'number' ? ch.params.dist_m : null;
        const sub = !pass && !skip && ch.reason ? reason(ch.reason, ch.params) : t.has(`${ch.code}.rule`) ? t(`${ch.code}.rule`) : '';
        return (
          <View
            key={ch.code}
            role="listitem"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: compact ? 8 : 11, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                flexShrink: 0,
                backgroundColor: pass ? c.limeSoft : skip ? c.soft : 'rgba(242,154,56,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon d={pass ? I.check : skip ? I.minus : I.warn} size={13} sw={2.6} color={skip ? c.ink2 : undefined} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={500}>
                {title}
              </Txt>
              {sub ? (
                <Txt size={11.5} dim>
                  {sub}
                </Txt>
              ) : null}
            </View>
            <Txt size={12} w={600} num lines={1} color={pass ? c.leaf : skip ? c.ink2 : B.orangeInk}>
              {pass ? (dist != null ? f.dist(dist) : t('pass')) : skip ? t('skip') : t('review')}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}
