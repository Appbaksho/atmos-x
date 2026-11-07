'use client';
/** One of "my sensors" on S26: name, simulated label, latest PM2.5 and the difference to the area. */
import { useTranslations } from 'next-intl';

import { AQI_COLORS, AQI_FG, I, Icon, pmBand, Txt, useCz, View } from '@/components/cz';
import type { SensorSummary } from '@/lib/data/types';

export function SensorRow({ sensor, areaPm, last }: { sensor: SensorSummary; areaPm: number; last?: boolean }) {
  const { c, f } = useCz();
  const t = useTranslations('air');
  const pm = sensor.pm25;
  const b = pm == null ? null : pmBand(pm);
  const diff = pm == null ? null : Math.round(pm - areaPm);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={I.device} size={20} sw={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14} w={600} lines={1}>
          {sensor.name}
        </Txt>
        <Txt size={11.5} dim lines={1} num>
          {[sensor.last_seen ? f.rel(sensor.last_seen) : t('never')]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <View style={{ minWidth: 40, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: b == null ? c.soft : AQI_COLORS[b], alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={12} w={700} color={b == null ? c.ink2 : AQI_FG[b]} num>
            {pm == null ? '–' : f.loc(Math.round(pm))}
          </Txt>
        </View>
        {diff != null ? (
          <Txt size={10.5} dim num>
            {t('vsArea', { diff: (diff > 0 ? '+' : diff < 0 ? '−' : '±') + f.loc(Math.abs(diff)) })}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}
