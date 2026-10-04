'use client';
/**
 * S27 · My devices (V0-7): the user's PM2.5 sensors (simulated in v0, clearly labelled) with the
 * latest reading against the area, status and remove. Data: useAir (area PM2.5) + useSensors.
 */
import { useTranslations } from 'next-intl';

import {
  AQI_COLORS,
  AQI_FG,
  B,
  Card,
  EmptyState,
  ErrorState,
  href,
  I,
  Icon,
  IconBtn,
  Note,
  pmAqi,
  pmBand,
  R,
  requireAccount,
  Screen,
  ScreenHeader,
  SkeletonCard,
  toast,
  Txt,
  useCz,
  useLocation,
  View,
} from '@/components/cz';
import { useAir, useRemoveSensor, useSensors, useSession } from '@/lib/data/hooks';
import type { Sensor } from '@/lib/data/types';

import { TI } from '../farm/farm-data';

export function DevicesScreen() {
  const t = useTranslations('air');
  const { focus } = useLocation();
  const session = useSession();
  const air = useAir(focus ?? null);
  const q = useSensors(air.data?.pm25 ?? null);
  const list = q.data ?? [];

  const add = session.isGuest ? undefined : href('S28');
  return (
    <Screen>
      <ScreenHeader
        title={t('myDev')}
        sub={q.data ? t('devSub', { n: list.length }) : undefined}
        right={<IconBtn d={I.plus} label={t('addSensor')} tone="lime" iconSize={20} href={add} onPress={session.isGuest ? () => requireAccount(t('addSensorFeature')) : undefined} />}
      />
      {q.isPending ? (
        <>
          <SkeletonCard lines={3} height={170} />
          <SkeletonCard lines={3} height={170} />
        </>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        session.isGuest ? (
          <EmptyState icon={I.device} title={t('noSensors')} sub={t('guestDevices')} action={t('addSensor')} onAction={() => requireAccount(t('addSensorFeature'))} />
        ) : (
          <EmptyState icon={I.device} title={t('noSensors')} sub={t('noSensorsSub')} action={t('addSensor')} actionHref={href('S28')} />
        )
      ) : (
        list.map((s) => <DeviceCard key={s.id} sensor={s} areaPm={air.data?.pm25 ?? null} />)
      )}
      <Note icon={I.info}>{t('simNote')}</Note>
    </Screen>
  );
}

function DeviceCard({ sensor, areaPm }: { sensor: Sensor; areaPm: number | null }) {
  const { c, f } = useCz();
  const t = useTranslations('air');
  const remove = useRemoveSensor();
  const pm = sensor.pm25;
  const b = pm == null ? null : pmBand(pm);
  const diff = pm == null || areaPm == null ? null : Math.round(pm - areaPm);
  const st = sensor.online ? { bg: B.lime, fg: B.limeInk } : { bg: 'rgba(255,126,0,0.22)', fg: c.ink };

  return (
    <Card gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}>
          <Icon d={I.device} size={22} sw={1.7} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={14.5} w={600} lines={1}>
            {sensor.name}
          </Txt>
          <Txt size={11.5} dim lines={2}>
            {[sensor.model, sensor.simulated ? t('simulated') : null].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, backgroundColor: st.bg }}>
          {sensor.online ? <Icon d={I.checkSm} size={12} color={st.fg} sw={2.6} /> : null}
          <Txt size={11} w={700} color={st.fg} lines={1}>
            {sensor.online ? t('status.online') : t('status.offline')}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, borderRadius: 14, padding: 10, gap: 2, backgroundColor: c.soft }}>
          <Txt size={10.5} dim lines={1}>
            {t('last')}
          </Txt>
          <Txt size={15} w={600} num lines={1}>
            {pm == null ? '–' : `${f.loc(Math.round(pm))} ${t('unit')}`}
          </Txt>
          <Txt size={10.5} dim lines={1}>
            {sensor.last_seen ? f.rel(sensor.last_seen) : t('never')}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, borderRadius: 14, padding: 10, gap: 4, backgroundColor: c.soft }}>
          <Txt size={10.5} dim lines={1}>
            {t('aqiShort')}
          </Txt>
          {b == null ? (
            <Txt size={15} w={600}>
              –
            </Txt>
          ) : (
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: AQI_COLORS[b], justifyContent: 'center' }}>
              <Txt size={12} w={700} color={AQI_FG[b]} num>
                {f.loc(pmAqi(pm ?? 0))}
              </Txt>
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, borderRadius: 14, padding: 10, gap: 2, backgroundColor: c.soft }}>
          <Txt size={10.5} dim lines={1}>
            {t('sensorsSub')}
          </Txt>
          <Txt size={15} w={600} num lines={1}>
            {diff == null ? '–' : (diff > 0 ? '+' : diff < 0 ? '−' : '±') + f.loc(Math.abs(diff))}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <IconBtn
          d={TI.trash}
          label={t('remove', { name: sensor.name })}
          size={40}
          iconSize={16}
          disabled={remove.isPending}
          onPress={() =>
            remove.mutate(sensor.id, {
              onSuccess: () => toast(t('removed')),
            })
          }
        />
      </View>
    </Card>
  );
}

