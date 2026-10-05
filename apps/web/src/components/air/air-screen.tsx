'use client';
/**
 * S26 · Air quality (V0-7): PM2.5 now against the EPA 2024 bands and the WHO line, the AQI ring,
 * my sensors (simulated in v0), the daily PM2.5 forecast and the clean-air plan (advice codes from
 * the server, by AQI band). Data: useAir(focus).
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  AQI_CATEGORIES,
  aqiColors,
  B,
  Card,
  Check,
  ErrorState,
  GhostButton,
  href,
  I,
  Label,
  Note,
  pmBand,
  R,
  Ring,
  Screen,
  ScreenHeader,
  SkeletonCard,
  SourceChips,
  Tap,
  Txt,
  useCz,
  useLocation,
  View,
} from '@/components/cz';
import { useAskContext } from '@/components/ask/ask-context';
import { useTServer } from '@/i18n/server-text';
import { useAir } from '@/lib/data/hooks';
import type { Air } from '@/lib/data/types';

import { BandBar, ForecastChart, WHO } from './air-parts';
import { SensorRow } from './sensor-row';

export function AirScreen() {
  const { f } = useCz();
  const t = useTranslations('air');
  const { focus, placeName } = useLocation();
  const q = useAir(focus ?? null);
  const asOf = q.data?.meta.sources[0]?.as_of ?? q.data?.meta.generated_at;
  useAskContext(
    q.data
      ? { visible: { pm25: q.data.pm25, aqi: q.data.aqi, category: q.data.category, forecast: q.data.forecast.map((d) => [d.date, d.pm25]), sensors: q.data.my_sensors.map((s) => [s.name, s.pm25]) } }
      : null,
  );
  const sub = placeName ? (asOf ? t('sub', { place: placeName, time: f.time(asOf) }) : placeName) : undefined;

  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={sub} />
      {q.isPending ? (
        <>
          <SkeletonCard lines={4} height={240} />
          <SkeletonCard lines={3} height={200} />
          <SkeletonCard lines={4} />
        </>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <AirBody air={q.data} />
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tap label={t('connect')} haptic href={href('S28')} style={{ flex: 1, height: 52, borderRadius: 30, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
          <Txt size={14} w={600} color={B.limeInk} center lines={2}>
            {t('connect')}
          </Txt>
        </Tap>
        <GhostButton label={t('myDev')} href={href('S27')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function AirBody({ air }: { air: Air }) {
  const { c, f } = useCz();
  const t = useTranslations('air');
  const tc = useTranslations('common');
  const ts = useTServer();
  const [sens, setSens] = useState(false);
  const col = aqiColors(air.category);
  const cat = tc(`aqi.${air.category}`);
  const ratio = air.pm25 / WHO;
  const peak = air.forecast.reduce<Air['forecast'][number] | null>((m, d) => (!m || d.pm25 > m.pm25 ? d : m), null);
  const peakDay = peak ? (peak === air.forecast[0] ? t('today') : f.weekday(peak.date)) : '';

  return (
    <>
      {/* PM2.5 now */}
      <Card style={{ borderRadius: R.xxl, padding: 18 }} gap={14}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ gap: 4, flexShrink: 1, minWidth: 0 }}>
            <Txt size={12} dim>
              {t('pm25')}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Txt size={56} num style={{ lineHeight: 60, letterSpacing: -1.7 }}>
                {f.loc(Math.round(air.pm25))}
              </Txt>
              <Txt size={14} dim>
                {t('unit')}
              </Txt>
            </View>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill, backgroundColor: col.bg, marginTop: 4 }}>
              <Txt size={12} w={700} color={col.fg}>
                {cat}
              </Txt>
            </View>
          </View>
          <Ring pct={Math.min(100, (air.aqi / 300) * 100)} size={92} stroke={10} color={col.bg} label={t('ringA11y', { n: air.aqi, cat })}>
            <View style={{ alignItems: 'center' }}>
              <Txt size={24} w={600} num style={{ lineHeight: 26 }}>
                {f.loc(air.aqi)}
              </Txt>
              <Txt size={10} w={600} dim>
                {t('aqiShort')}
              </Txt>
            </View>
          </Ring>
        </View>

        <BandBar pm={air.pm25} label={t('bandA11y', { pm: f.loc(Math.round(air.pm25)), cat })} />

        <Txt size={12.5} style={{ lineHeight: 18 }}>
          {ratio > 1 ? t('vsWho', { x: f.dec(ratio, 1) }) : t('underWho')}
        </Txt>
        <SourceChips meta={air.meta} />
      </Card>

      {/* My sensors (+ nearby stations when the server has any) */}
      {air.my_sensors.length || air.stations.length ? (
        <Card gap={4}>
          {air.my_sensors.length ? (
            <>
              <Label>{t('sensors')}</Label>
              {air.my_sensors.map((s, i) => (
                <SensorRow key={s.id} sensor={s} areaPm={air.pm25} last={i === air.my_sensors.length - 1 && !air.stations.length} />
              ))}
            </>
          ) : null}
          {air.stations.length ? (
            <>
              <Label style={{ marginTop: air.my_sensors.length ? 10 : 0 }}>{t('stations')}</Label>
              {air.stations.map((s, i) => {
                const sc = aqiColors(AQI_CATEGORIES[pmBand(s.pm25)]);
                return (
                  <View key={s.name + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt size={13.5} w={600} lines={1}>
                        {s.name}
                      </Txt>
                      <Txt size={11.5} dim num>
                        {`${f.dist(s.dist_m)} · ${f.time(s.as_of)}`}
                      </Txt>
                    </View>
                    <View style={{ minWidth: 40, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: sc.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Txt size={12} w={700} color={sc.fg} num>
                        {f.loc(Math.round(s.pm25))}
                      </Txt>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}
        </Card>
      ) : (
        <Card gap={8} tone="soft">
          <Txt size={14} w={600}>
            {t('noSensors')}
          </Txt>
          <Txt size={12.5} dim>
            {t('noSensorsSub')}
          </Txt>
        </Card>
      )}

      {/* Forecast */}
      {air.forecast.length ? (
        <Card pad={12} gap={10} style={{ paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, gap: 8 }}>
            <Label>{t('fcTitle')}</Label>
          </View>
          {peak && peak.pm25 > 35.4 ? (
            <View style={{ marginHorizontal: 4 }}>
              <Note tone="warn" icon={I.warn}>
                <Txt size={12.5} w={600} style={{ lineHeight: 18 }}>
                  {t('fcAlert', { day: peakDay, pm: f.loc(Math.round(peak.pm25)) })}
                </Txt>
              </Note>
            </View>
          ) : null}
          <ForecastChart days={air.forecast} label={t('fcA11y', { n: air.forecast.length, pm: peak ? Math.round(peak.pm25) : 0, day: peakDay })} />
        </Card>
      ) : null}

      {/* Clean-air plan */}
      {air.advice.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingTop: 4, paddingHorizontal: 4 }}>
            <Txt display size={14} as="h2" style={{ flexShrink: 1 }}>
              {t('planTitle')}
            </Txt>
            <Txt size={11} dim style={{ flexShrink: 1 }}>
              {t('planSub')}
            </Txt>
          </View>
          <Tap role="checkbox" selected={sens} label={t('sens')} haptic onPress={() => setSens(!sens)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.card }}>
            <Check on={sens} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={13.5} w={600}>
                {t('sens')}
              </Txt>
              <Txt size={11.5} dim>
                {t('sensSub')}
              </Txt>
            </View>
          </Tap>
          <Card pad={14} gap={10} style={{ borderRadius: 22 }}>
            {sens ? (
              <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,0,0,0.1)' }}>
                <Txt size={12} w={600}>
                  {t('lead')}
                </Txt>
              </View>
            ) : null}
            {air.advice.map((a, k) => (
              <View key={a.code} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.limeSoft }}>
                  <Txt size={11} w={700} style={{ lineHeight: 14 }}>
                    {f.loc(k + 1)}
                  </Txt>
                </View>
                <Txt size={13} w={500} style={{ lineHeight: 18, flex: 1, minWidth: 0 }}>
                  {ts(a)}
                </Txt>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}
