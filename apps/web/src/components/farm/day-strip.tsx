'use client';
/**
 * 5-day forecast strip (F01 card and the navy F03 "Field weather" card): weekday, a heat-coloured
 * bar (or dot on navy), max temperature and rain. Data: Conditions.forecast.
 */
import { useTranslations } from 'next-intl';

import { Txt, useCz, View } from '@/components/cz';
import type { ForecastDay } from '@/lib/data/types';

import { farmHeat } from './farm-data';

export function DayStrip({ days, navy }: { days: ForecastDay[]; navy?: boolean }) {
  const { c, f } = useCz();
  const t = useTranslations('farm');
  return (
    <View style={{ flexDirection: 'row', gap: navy ? 4 : 6 }} role="list">
      {days.map((d, i) => {
        const hot = d.tmax_c >= 35;
        const day = i === 0 ? t('fields.today') : f.weekday(d.date);
        const rain = d.rain_mm >= 0.5 ? `${f.dec(d.rain_mm, d.rain_mm < 10 ? 1 : 0)} ${t('fields.mm')}` : '—';
        const pct = Math.max(8, Math.min(100, Math.round(((d.tmax_c - 26) / 12) * 100)));
        return (
          <View
            key={d.date}
            role="listitem"
            label={`${day}: ${f.deg(d.tmax_c)}, ${rain === '—' ? `0 ${t('fields.mm')}` : rain}`}
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: 'center',
              gap: navy ? 5 : 6,
              paddingVertical: navy ? 8 : 10,
              paddingHorizontal: navy ? 2 : 4,
              borderRadius: navy ? 14 : 16,
              backgroundColor: hot ? (navy ? 'rgba(229,83,61,0.22)' : 'rgba(229,83,61,0.12)') : navy ? 'rgba(255,255,255,0.06)' : 'transparent',
            }}>
            <Txt size={navy ? 11 : 11.5} w={navy ? 400 : 600} color={navy ? 'rgba(255,255,255,0.85)' : undefined} lines={1}>
              {hot && !navy ? `${day} !` : day}
            </Txt>
            {navy ? (
              <View aria-hidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: farmHeat(d.tmax_c) }} />
            ) : (
              <View aria-hidden style={{ height: 64, width: 10, borderRadius: 5, backgroundColor: c.soft, justifyContent: 'flex-end', overflow: 'hidden' }}>
                <View style={{ width: '100%', borderRadius: 5, height: `${pct}%`, backgroundColor: farmHeat(d.tmax_c) }} />
              </View>
            )}
            <Txt size={15} w={600} num color={navy ? '#FFFFFF' : undefined}>
              {f.deg(d.tmax_c)}
            </Txt>
            <Txt size={navy ? 10 : 10.5} dim={!navy} num lines={1} color={navy ? 'rgba(255,255,255,0.7)' : undefined}>
              {rain}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}
