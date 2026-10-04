'use client';
/**
 * S06 Drivers · causes (port of zone.tsx DriversCard): stacked contribution bar from the server's
 * causes (adds_c), then expandable driver rows (sealed, green, dark roofs, density) with a fix and
 * "Add to goal". Values come from ZoneDetail.drivers; assumed values carry an "estimate" tag.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { requireAccount } from '@/components/cz/account';
import { B } from '@/components/cz/tokens';
import { Bar, Card, I, Icon, Label, PillButton, Tag, Tap, Txt, View } from '@/components/cz/ui';
import type { ZoneDetail } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

type Key = 'sealed' | 'green' | 'roofs' | 'density';
const CAUSE_KEY: Record<string, Key> = {
  'cause.sealed_surface': 'sealed',
  'cause.wide_roads': 'sealed',
  'cause.low_green': 'green',
  'cause.dark_roofs': 'roofs',
  'cause.dense_buildings': 'density',
};
const COLOR: Record<Key, string> = { sealed: B.red, green: B.green, roofs: B.orange, density: B.yellow };

export function DriversCard({ zone, guest }: { zone: ZoneDetail; guest?: boolean }) {
  const { c, f } = useCz();
  const t = useTranslations('zone.drivers');
  const tz = useTranslations('zone');
  const [open, setOpen] = useState(0);
  const d = zone.drivers;
  const est = new Set(d.estimated ?? []);

  const adds = new Map<Key, number>();
  for (const cs of zone.causes) {
    const k = CAUSE_KEY[cs.code];
    const a = Number(cs.params?.adds_c ?? 0);
    if (k && a > 0) adds.set(k, (adds.get(k) ?? 0) + a);
  }
  const total = [...adds.values()].reduce((a, b) => a + b, 0);

  const perHa = d.pop_density_km2;
  const rows: { key: Key; pct: number; value: string; estimated: boolean; gain?: number }[] = [
    { key: 'sealed', pct: d.sealed_pct, value: f.pct(d.sealed_pct), estimated: est.has('sealed_pct') },
    { key: 'green', pct: d.green_pct, value: f.pct(d.green_pct), estimated: est.has('green_pct'), gain: -zone.what_if_green.lst_drop_c },
    ...(d.dark_roof_pct != null ? [{ key: 'roofs' as const, pct: d.dark_roof_pct, value: f.pct(d.dark_roof_pct), estimated: est.has('dark_roof_pct') }] : []),
    ...(perHa != null ? [{ key: 'density' as const, pct: Math.min(100, (perHa / 60) * 100), value: t('perHa', { n: f.loc(Math.round(perHa)) }), estimated: est.has('pop_density_km2') }] : []),
  ];

  return (
    <Card style={{ marginHorizontal: 16 }} gap={14}>
      <View style={{ gap: 4 }}>
        <Label>{t('label')}</Label>
        <Txt size={15} w={600} as="h2">
          {t('title')}
        </Txt>
      </View>
      {total > 0 ? (
        <View style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: c.soft }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Txt size={28} w={600} num color={B.red} style={{ letterSpacing: -0.5 }}>
              {f.dC(total)}
            </Txt>
            <Txt size={12} dim style={{ flexShrink: 1 }}>
              {t('adds')}
            </Txt>
          </View>
          <Txt size={11} w={600} dim>
            {t('addsLbl')}
          </Txt>
          <View aria-hidden style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
            {[...adds.entries()].map(([k, a]) => (
              <View key={k} style={{ flex: a, height: '100%', backgroundColor: COLOR[k] }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 }}>
            {[...adds.entries()].map(([k, a]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: COLOR[k] }} />
                <Txt size={11.5}>
                  {t(k)}{' '}
                  <Txt size={11.5} w={600} num>
                    {f.dC(a)}
                  </Txt>
                </Txt>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {rows.map((r, i) => {
        const on = open === i;
        const a = adds.get(r.key);
        return (
          <View key={r.key} style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line }}>
            <Tap label={`${t(r.key)} ${r.value}`} aria-expanded={on} onPress={() => setOpen(on ? -1 : i)} style={{ gap: 7, minHeight: 44, textAlign: 'start' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                  <Txt size={13.5} w={600}>
                    {t(r.key)}
                  </Txt>
                  {r.estimated ? <Tag size="xs" label={t('estimate')} fg={c.ink2} /> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={13.5} w={600} num>
                    {r.value}
                  </Txt>
                  <Icon d={I.chevDown} size={16} sw={2} style={{ transform: on ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s ease' }} />
                </View>
              </View>
              <Bar pct={r.pct} color={COLOR[r.key]} />
              {a ? (
                <Txt size={11.5} w={600} num style={{ alignSelf: 'flex-end' }}>
                  {t('addsShort', { d: f.dC(a) })}
                </Txt>
              ) : null}
            </Tap>
            {on ? (
              <View style={{ gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.bg }}>
                <Txt size={12.5} style={{ lineHeight: 19 }}>
                  {t(`why.${r.key}`)}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon d={I.trend} size={16} sw={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Txt size={11} dim>
                      {t('fixL')}
                      {r.gain ? (
                        <>
                          {' · '}
                          <Txt size={11} w={600} num color={c.leaf}>
                            {f.dC(r.gain, 2)}
                          </Txt>
                        </>
                      ) : null}
                    </Txt>
                    <Txt size={13} w={600}>
                      {t(`fix.${r.key}`)}
                    </Txt>
                  </View>
                  {guest ? (
                    <PillButton label={t('addGoal')} tone="lime" onPress={() => requireAccount(tz('goalFeature'))} />
                  ) : (
                    <PillButton label={t('addGoal')} tone="lime" href={href('S08', undefined, { zone: zone.id, focus: r.key })} />
                  )}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <Txt size={11} dim>
        {t('source')}
      </Txt>
    </Card>
  );
}
