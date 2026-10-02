/** S27 · My devices — the user's PM2.5 sensors with status, last reading, quality and the 7-day check. */
import { StyleSheet, View } from 'react-native';

import { Card, I, Icon, IconBtn, Screen, ScreenHeader, Txt } from '@/components/cz/ui';
import { AQI_COLORS, B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';
import { AIR_T } from './i18n';

type Status = 'pub' | 'priv' | 'chk';
type Device = { meta: string; io: 'outd' | 'ind'; status: Status; pm: number; agoMin: number; quality: number; rh: number; day: number };

/** Same order as the `devs` copy (name, note). */
const DEVICES: Device[] = [
  { meta: 'ESP32 + PMS5003 + BME280', io: 'outd', status: 'pub', pm: 58, agoMin: 2, quality: 92, rh: 78, day: 7 },
  { meta: 'Sensor.Community kit · SDS011', io: 'ind', status: 'priv', pm: 38, agoMin: 1, quality: 88, rh: 64, day: 7 },
  { meta: 'ESP32 + PMS5003 + SHT31', io: 'outd', status: 'chk', pm: 66, agoMin: 4, quality: 71, rh: 81, day: 4 },
];

export default function Devices() {
  const { c, f } = useCz();
  const t = f.pick(AIR_T);

  const statusStyle = (s: Status) =>
    s === 'pub' ? { bg: B.lime, fg: B.limeInk } : s === 'priv' ? { bg: c.soft, fg: c.ink } : { bg: 'rgba(255,126,0,0.22)', fg: c.ink };

  return (
    <Screen>
      <ScreenHeader title={t.myDev} sub={t.devSub} right={<IconBtn d={I.plus} label={t.addSensor} tone="lime" iconSize={20} onPress={() => go('S28')} />} />
      {DEVICES.map((d, i) => {
        const [name, note] = t.devs[i];
        const st = statusStyle(d.status);
        const qc = d.quality >= 80 ? B.lime : AQI_COLORS[2];
        return (
          <Card key={name} gap={12}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: c.soft }]}>
                <Icon d={I.device} size={22} sw={1.7} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={14.5} w={600}>
                  {name}
                </Txt>
                <Txt size={11.5} dim>
                  {d.meta} · {t[d.io]}
                </Txt>
              </View>
              <View style={[styles.status, { backgroundColor: st.bg }]}>
                {d.status === 'pub' ? <Icon d={I.checkSm} size={12} color={st.fg} sw={2.6} /> : null}
                <Txt size={11} w={700} color={st.fg} lines={1}>
                  {t.status[d.status]}
                </Txt>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.tile, { backgroundColor: c.soft }]}>
                <Txt size={10.5} dim lines={1}>
                  {t.last}
                </Txt>
                <Txt size={15} w={600} num lines={1}>
                  {f.loc(d.pm)} μg/m³
                </Txt>
                <Txt size={10.5} dim lines={1}>
                  {t.ago.replace('{n}', f.loc(d.agoMin) + ' min')}
                </Txt>
              </View>
              <View style={[styles.tile, { backgroundColor: c.soft, gap: 4 }]}>
                <Txt size={10.5} dim lines={1}>
                  {t.quality}
                </Txt>
                <Txt size={15} w={600} num>
                  {f.loc(d.quality)}
                </Txt>
                <View style={[styles.qTrack, { backgroundColor: c.card }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: d.quality }}>
                  <View style={{ height: '100%', width: `${d.quality}%`, backgroundColor: qc }} />
                </View>
              </View>
              <View style={[styles.tile, { backgroundColor: c.soft }]}>
                <Txt size={10.5} dim lines={1}>
                  {t.rh}
                </Txt>
                <Txt size={15} w={600} num>
                  {f.loc(d.rh)}%
                </Txt>
                <Txt size={10.5} dim lines={1}>
                  {t.corr}
                </Txt>
              </View>
            </View>

            {d.status === 'chk' ? (
              <View style={{ gap: 6 }}>
                <View style={styles.between}>
                  <Txt size={12} w={600}>
                    {t.checkL}
                  </Txt>
                  <Txt size={12} num>
                    {t.day.replace('{d}', f.loc(d.day))}
                  </Txt>
                </View>
                <View style={{ flexDirection: 'row', gap: 3 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 7, now: d.day }}>
                  {Array.from({ length: 7 }, (_, k) => (
                    <View key={k} style={[styles.day, { backgroundColor: k < d.day ? B.lime : c.soft }]} />
                  ))}
                </View>
              </View>
            ) : null}

            <Txt size={11.5} dim>
              {note}
            </Txt>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  tile: { flex: 1, minWidth: 0, borderRadius: 14, padding: 10, gap: 2 },
  qTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  day: { flex: 1, height: 8, borderRadius: 3 },
});
