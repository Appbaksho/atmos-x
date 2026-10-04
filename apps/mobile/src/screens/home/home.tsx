/**
 * S04 · Home — layout variant A ("Photo hero"): live conditions over a neighbourhood aerial, the
 * Heat Score explorer, air-quality teaser, trees due a photo, hottest-zones carousel and the goal card.
 */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPill, I, Icon, IconBtn, LightStatusBar, Photo, Screen, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { CREDIT, PHOTO } from '@/lib/cz/demo';
import { heatRisk, useConditions } from '@/lib/cz/live';
import { go } from '@/lib/cz/routes';
import { HOME_T } from './i18n';
import { ScoreCard } from './score-card';
import { AirCard, DueTreesCard, GoalCard, HottestZones } from './sections';

/** Roof & road surface temperature for the user's block (Landsat 9). */
const LST_NOW = 49;

export default function Home() {
  return (
    <Screen tab bleed gap={18}>
      <LightStatusBar />
      <Hero />
      <ScoreCard />
      <AirCard />
      <DueTreesCard />
      <HottestZones />
      <GoalCard />
    </Screen>
  );
}

function Hero() {
  const { f } = useCz();
  const t = f.pick(HOME_T);
  const insets = useSafeAreaInsets();
  const w = useConditions();
  const risk = heatRisk(w.feels);
  const hour = new Date().getHours();
  const greet = hour < 12 ? t.greetAm : hour < 17 ? t.greet : t.greetPm;
  const place = w.live ? w.place : t.loc;

  const chips = [
    { label: t.lst, val: f.deg(LST_NOW), icon: I.lst },
    { label: t.hum, val: f.loc(w.humidity) + '%', icon: I.drop },
    { label: t.wind, val: f.loc(w.wind) + ' km/h', icon: I.wind },
    { label: t.upd, val: f.loc(w.time), icon: I.clock },
  ];

  return (
    <Photo
      src={PHOTO.neighborhood()}
      label={CREDIT.neighborhood}
      style={{ height: 500 }}
      scrim={[
        [0, 0.55],
        [0.32, 0.1],
        [0.58, 0.35],
        [1, 0.86],
      ]}>
      <View style={[styles.topRow, { top: insets.top + 12 }]}>
        <Tap label={`${t.changeLoc}: ${place}`} onPress={() => go('S03')} style={styles.locBtn}>
          <Icon d={I.pin} size={18} color={B.white} />
          <Txt size={14} w={500} color={B.white} lines={1} style={{ flexShrink: 1 }}>
            {place}
          </Txt>
        </Tap>
        <IconBtn d={I.bell} label={t.alerts} tone="glass" iconSize={20} badge onPress={() => go('S21')} />
      </View>

      <View style={styles.bottom}>
        <Txt size={15} color="rgba(255,255,255,0.9)">
          {greet}
        </Txt>
        <View style={styles.tempRow}>
          <Txt size={92} num color={B.white} style={styles.bigTemp} accessibilityRole="header">
            {f.deg(w.air)}
          </Txt>
          <View style={styles.tempSide}>
            <Txt size={12.5} color="rgba(255,255,255,0.85)">
              {t.air}
            </Txt>
            <Txt size={15} w={600} color={B.white} num lines={1}>
              {t.feels} {f.deg(w.feels)}
            </Txt>
            <View style={[styles.risk, { backgroundColor: risk.color }]}>
              <Txt size={10.5} w={700} color={risk.fg} style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {t.risk[risk.key]}
              </Txt>
            </View>
          </View>
        </View>
        <View style={styles.chips}>
          {chips.map((ch) => (
            <GlassPill key={ch.label} style={{ height: 32, gap: 6 }}>
              <Icon d={ch.icon} size={14} color={B.white} />
              <Txt size={12} color={B.white} num>
                {ch.label}{' '}
                <Txt size={12} w={600} color={B.white} num>
                  {ch.val}
                </Txt>
              </Txt>
            </GlassPill>
          ))}
        </View>
      </View>
    </Photo>
  );
}

const styles = StyleSheet.create({
  topRow: { position: 'absolute', start: 20, end: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexShrink: 1 },
  bottom: { position: 'absolute', start: 20, end: 20, bottom: 52, gap: 10 },
  tempRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  bigTemp: { lineHeight: 96, letterSpacing: -2.8 },
  tempSide: { alignItems: 'flex-end', gap: 4, paddingBottom: 8, flexShrink: 1 },
  risk: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});
