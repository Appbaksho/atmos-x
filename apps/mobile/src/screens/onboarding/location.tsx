/** S03 · Location & radius — step 2 of 2. Pick the scan radius, then run the simulated first scan. */
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Bar, CzButton, CzSlider, I, Icon, IconBtn, LightStatusBar, Note, Photo, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useLocation } from '@/context/location';
import { useCz } from '@/context/prefs';
import { CREDIT, PHOTO } from '@/lib/cz/demo';
import { goBack } from '@/lib/cz/routes';

const T = {
  en: {
    back: 'Back',
    search: 'Search a place or drop a pin',
    title: 'Scan around this point',
    place: 'Mohammadpur, Dhaka',
    gps: 'GPS accuracy ±24 m — well inside your radius. Drag the map to adjust the pin.',
    radius: 'Scan radius',
    zones: '{n} zones · {r}',
    useLoc: 'Use my location',
    scan: 'Scan {r}',
    privacy: 'Your precise location is used for this scan only and isn’t stored unless you save it.',
    scanning: 'Scanning {n} zones…',
    steps: [
      ['Finding zones', '{n} H3 cells at resolution {res}'],
      ['MODIS + NASA POWER', 'Daily LST and air temperature · seconds'],
      ['Landsat 9 refining', 'Surface temperature at 30 m · last clear pass 27 Sep'],
      ['Scoring drivers', 'Green cover, sealed surface, density, water, wind'],
    ] as [string, string][],
  },
};

const PRESETS = [100, 300, 500, 1000];
/** Prototype canvas: ring centre sits at y=270 of the 470pt visible map, 402pt wide. */
const PROTO_W = 402;
const SHEET_OVERLAP = 30;

export default function LocationStep() {
  const { c, f, prefs, setPref } = useCz();
  const t = f.pick(T);
  const insets = useSafeAreaInsets();
  const { focus, placeName, refresh, loading } = useLocation();
  const [map, setMap] = useState({ w: 0, h: 0 });
  const [scan, setScan] = useState(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const radius = prefs.radius;
  const res = radius <= 300 ? 10 : 9;
  const zoneCount = Math.max(3, Math.round((Math.PI * radius * radius) / (res === 10 ? 15047 : 105333)));
  const rLabel = (v: number) => (v >= 1000 ? f.loc(1) + ' km' : f.loc(v) + ' m');
  const radiusLabel = rLabel(radius);

  // Ring geometry, scaled from the prototype's 402pt canvas.
  const s = map.w ? map.w / PROTO_W : 1;
  const visible = Math.max(0, map.h - SHEET_OVERLAP);
  const cx = map.w / 2;
  const cy = visible * (270 / 470);
  const rpx = (30 + (radius / 1000) * 170) * s;
  const controlsBottom = insets.top + 12 + 48 + 8;
  const labelTop = Math.max(controlsBottom, cy - rpx - 14);

  const startScan = () => {
    setScan(0);
    [700, 1400, 2100].forEach((ms, i) => timers.current.push(setTimeout(() => setScan(i + 1), ms)));
    timers.current.push(
      setTimeout(() => {
        setPref('onboarded', true);
        router.replace('/(tabs)' as Href);
      }, 2800),
    );
  };

  const onMap = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMap({ w: width, h: height });
  };

  const place = `${placeName ?? t.place} · ${f.loc(Math.abs(focus.latitude).toFixed(4))}° ${focus.latitude >= 0 ? 'N' : 'S'}, ${f.loc(Math.abs(focus.longitude).toFixed(4))}° ${focus.longitude >= 0 ? 'E' : 'W'}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LightStatusBar />
      {/* Basemap with the radius ring */}
      <View style={{ flex: 1, minHeight: 240, marginBottom: -SHEET_OVERLAP }} onLayout={onMap}>
        <Photo src={PHOTO.basemap(1000, 1000)} label={CREDIT.basemap} style={[StyleSheet.absoluteFill, { backgroundColor: B.photoBg2 }]} scrim={[[0, 0.55], [0.26, 0], [1, 0]]} />
        {map.w > 0 ? (
          <>
            <Svg width={map.w} height={map.h} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Circle cx={cx} cy={cy} r={rpx} fill="rgba(172,236,0,0.14)" stroke={B.lime} strokeWidth={2} strokeDasharray="6 6" />
              <Circle cx={cx} cy={cy} r={14} fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.9)" strokeWidth={1.2} />
              <Circle cx={cx} cy={cy} r={7} fill={B.navy} stroke={B.white} strokeWidth={3} />
            </Svg>
            <View pointerEvents="none" style={[styles.labelRow, { top: labelTop }]}>
              <View style={styles.radiusLabel}>
                <Txt size={12} w={600} color={B.navy} num>
                  {radiusLabel}
                </Txt>
              </View>
            </View>
          </>
        ) : null}

        <View style={[styles.controls, { top: insets.top + 12 }]}>
          <IconBtn d={f.backPath} label={t.back} onPress={goBack} tone="glassDark" size={48} />
          <View style={styles.search} accessible accessibilityLabel={t.search}>
            <Icon d={I.search} size={18} color={B.white} />
            <Txt size={14} color="rgba(255,255,255,0.85)" lines={1} style={{ flexShrink: 1 }}>
              {t.search}
            </Txt>
          </View>
        </View>
      </View>

      {/* Bottom sheet */}
      <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: 34 + insets.bottom }]}>
        {scan < 0 ? (
          <>
            <View style={{ gap: 4 }}>
              <Txt display size={18} accessibilityRole="header">
                {t.title}
              </Txt>
              <Txt size={13.5} dim>
                {place}
              </Txt>
            </View>
            <Note icon={I.checkSm}>
              <Txt size={13} style={{ lineHeight: 18 }}>
                {t.gps}
              </Txt>
            </Note>
            <View style={{ gap: 10 }}>
              <View style={styles.between}>
                <Txt size={14} w={600}>
                  {t.radius}
                </Txt>
                <Txt size={14} dim num>
                  {t.zones.replace('{n}', f.loc(zoneCount)).replace('{r}', radiusLabel)}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <CzSlider value={radius} onChange={(v) => setPref('radius', v)} min={100} max={1000} step={50} label={t.radius} />
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {PRESETS.map((v) => {
                  const on = radius === v;
                  return (
                    <Tap
                      key={v}
                      role="radio"
                      selected={on}
                      label={rLabel(v)}
                      haptic
                      onPress={() => setPref('radius', v)}
                      style={[styles.preset, { backgroundColor: on ? B.lime : c.soft }]}>
                      <Txt size={13} w={600} color={on ? B.navy : c.ink2} num>
                        {rLabel(v)}
                      </Txt>
                    </Tap>
                  );
                })}
              </View>
            </View>
            <View style={styles.actions}>
              <Tap label={t.useLoc} onPress={() => refresh()} disabled={loading} style={[styles.outline, { borderColor: c.line, backgroundColor: c.card }]}>
                {loading ? <ActivityIndicator size="small" color={c.ink} /> : <Icon d={I.target} size={18} />}
                <Txt size={14} w={600}>
                  {t.useLoc}
                </Txt>
              </Tap>
              <CzButton label={t.scan.replace('{r}', radiusLabel)} icon="compass" onPress={startScan} style={{ flexGrow: 1, minWidth: 150, height: 54 }} />
            </View>
            <Txt size={11.5} dim center style={{ lineHeight: 17 }}>
              {t.privacy}
            </Txt>
          </>
        ) : (
          <View style={{ gap: 16 }} accessibilityLiveRegion="polite">
            <Txt display size={18} accessibilityRole="header">
              {t.scanning.replace('{n}', f.loc(zoneCount))}
            </Txt>
            <Bar pct={Math.min(100, (scan + 1) * 25)} />
            {t.steps.map(([title, d], i) => {
              const done = i < scan;
              const cur = i === scan;
              return (
                <View key={title} style={styles.step}>
                  <View style={[styles.mark, { backgroundColor: done ? B.lime : c.soft }]}>
                    {done ? <Icon d={I.check} size={14} color={B.navy} sw={3} /> : cur ? <View style={[styles.dot, { backgroundColor: c.ink }]} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Txt size={14} w={600} style={{ opacity: i <= scan ? 1 : 0.5 }}>
                      {title}
                    </Txt>
                    <Txt size={12} dim>
                      {d.replace('{n}', f.loc(zoneCount)).replace('{res}', f.loc(res))}
                    </Txt>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { position: 'absolute', start: 0, end: 0, alignItems: 'center' },
  radiusLabel: { backgroundColor: B.lime, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  controls: { position: 'absolute', start: 16, end: 16, flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    height: 48,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: B.glassLine,
    backgroundColor: 'rgba(0,24,46,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  sheet: { borderTopStartRadius: 30, borderTopEndRadius: 30, paddingTop: 22, paddingHorizontal: 20, gap: 16 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  preset: { flex: 1, height: 38, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2, marginEnd: 60 },
  outline: { height: 54, paddingHorizontal: 18, borderRadius: R.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
