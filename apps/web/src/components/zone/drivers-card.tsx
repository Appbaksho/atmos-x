'use client';
/**
 * S06 Drivers (prompt-v1 §6.5 Z4, §7.4): each driver's measured value and the °C it adds compared
 * with the area average, from a fit of Landsat surface temperature on land cover across the area.
 * "Other factors" is what land cover does not explain. Expandable rows carry a fix and "Add to goal".
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { requireAccount } from '@/components/cz/account';
import { B } from '@/components/cz/tokens';
import { Bar, Card, I, Icon, Label, PillButton, Tag, Tap, Txt, View } from '@/components/cz/ui';
import type { DriverContribution, ZoneDetail } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

type Key = DriverContribution['driver'];
const COLOR: Record<Key, string> = { sealed: B.red, green: B.green, water: B.blue, dark_surface: B.orange };
/** Goal wizard focus for each driver. */
const FOCUS: Record<Key, string> = { sealed: 'sealed', green: 'green', water: 'green', dark_surface: 'roofs' };

export function DriversCard({ zone, guest }: { zone: ZoneDetail; guest?: boolean }) {
  const { c, f } = useCz();
  const t = useTranslations('zone.drivers');
  const tz = useTranslations('zone');
  const [open, setOpen] = useState(0);
  const d = zone.drivers;
  if (!d) return null;
  const contribs = d.contributions ?? [];
  const byKey = new Map(contribs.map((x) => [x.driver, x]));
  const warming = contribs.filter((x) => x.adds_c > 0.05);
  const total = warming.reduce((a, b) => a + b.adds_c, 0);
  const estimated = (d.estimated ?? []).includes('contributions') || d.fit?.label === 'estimate';

  const rows: { key: Key; pct: number; value: string }[] = [];
  if (d.sealed_pct != null) rows.push({ key: 'sealed', pct: d.sealed_pct, value: f.pct(d.sealed_pct) });
  if (d.green_pct != null) rows.push({ key: 'green', pct: d.green_pct, value: f.pct(d.green_pct) });
  if (d.dark_roof_pct != null) rows.push({ key: 'dark_surface', pct: d.dark_roof_pct, value: f.pct(d.dark_roof_pct) });
  if (d.water_pct != null && d.water_pct > 0) rows.push({ key: 'water', pct: d.water_pct, value: f.pct(d.water_pct) });

  return (
    <Card style={{ marginHorizontal: 16 }} gap={14}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label>{t('label')}</Label>
          {estimated ? <Tag size="xs" label={t('estimate')} fg={c.ink2} /> : null}
        </View>
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
          <View aria-hidden style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
            {warming.map((x) => (
              <View key={x.driver} style={{ flex: x.adds_c, height: '100%', backgroundColor: COLOR[x.driver] }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 }}>
            {warming.map((x) => (
              <View key={x.driver} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: COLOR[x.driver] }} />
                <Txt size={11.5}>
                  {t(x.driver)}{' '}
                  <Txt size={11.5} w={600} num>
                    {f.dC(x.adds_c)}
                  </Txt>
                </Txt>
              </View>
            ))}
          </View>
          {d.other_c != null ? (
            <Txt size={11.5} dim num>
              {t('other', { d: f.dC(d.other_c) })}
            </Txt>
          ) : null}
        </View>
      ) : null}

      {rows.map((r, i) => {
        const on = open === i;
        const a = byKey.get(r.key)?.adds_c;
        return (
          <View key={r.key} style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line }}>
            <Tap label={`${t(r.key)} ${r.value}`} aria-expanded={on} onPress={() => setOpen(on ? -1 : i)} style={{ gap: 7, minHeight: 44, textAlign: 'start' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Txt size={13.5} w={600}>
                  {t(r.key)}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={13.5} w={600} num>
                    {r.value}
                  </Txt>
                  <Icon d={I.chevDown} size={16} sw={2} style={{ transform: on ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s ease' }} />
                </View>
              </View>
              <Bar pct={r.pct} color={COLOR[r.key]} />
              {a != null && Math.abs(a) >= 0.05 ? (
                <Txt size={11.5} w={600} num color={a < 0 ? c.leaf : undefined} style={{ alignSelf: 'flex-end' }}>
                  {a > 0 ? t('addsShort', { d: f.dC(a) }) : t('coolsShort', { d: f.dAbs(-a) })}
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
                      {r.key === 'green' && zone.what_if_green.lst_drop_c > 0 ? (
                        <>
                          {' · '}
                          <Txt size={11} w={600} num color={c.leaf}>
                            {f.dC(-zone.what_if_green.lst_drop_c, 2)}
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
                    <PillButton label={t('addGoal')} tone="lime" href={href('S08', undefined, { zone: zone.id, focus: FOCUS[r.key] })} />
                  )}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <Txt size={11} dim>
        {d.fit && d.fit.label === 'derived'
          ? t('sourceFit', { n: f.num(d.fit.n), r2: f.dec(d.fit.r2 ?? 0, 2), date: d.as_of ? f.date(d.as_of) : '' })
          : t('sourceEstimate')}
      </Txt>
    </Card>
  );
}
