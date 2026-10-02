/**
 * S26 · Air quality — PM2.5 now against the AQI bands and the WHO line, the community sensor map,
 * the 48-hour GEOS-CF forecast and the AI clean-air plan.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { Card, Check, GhostButton, I, Label, Note, Photo, Screen, ScreenHeader, Tap, Txt } from '@/components/cz/ui';
import { AQI_COLORS, AQI_FG, B, pmAqi, pmBand, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { CREDIT, PHOTO, PM_NOW } from '@/lib/cz/demo';
import { go } from '@/lib/cz/routes';
import { AIR_T } from './i18n';

/** Scale maximum for the band bar, μg/m³. */
const MAXP = 150;
const WHO = 15;
const px = (v: number) => Math.min(100, (v / MAXP) * 100);
/** Band widths in μg/m³ up to MAXP (Good … Very unhealthy). */
const BAND_W = [9, 26.4, 20, 70, 24.6];

/** Sensor-map blobs: [x %, y %, diameter, PM]. */
const BLOBS: [number, number, number, number][] = [
  [22, 30, 70, 48],
  [70, 26, 64, 37],
  [40, 70, 80, 66],
  [78, 66, 70, 74],
  [55, 45, 90, 58],
  [15, 80, 60, 51],
];
/** Sensor pins: [x %, y %, PM, kind] — c community, r reference station, u model estimate. */
const PINS: [number, number, number, 'c' | 'r' | 'u'][] = [
  [30, 34, 52, 'c'],
  [64, 58, 60, 'c'],
  [46, 22, 41, 'c'],
  [80, 40, 47, 'r'],
  [24, 70, 58, 'u'],
];
/** 48 h forecast every 6 h. */
const FC_V = [62, 48, 41, 85, 66, 52, 44, 58];
const FC_L = ['14', '20', '02', '08', '14', '20', '02', '08'];

export default function AirQuality() {
  const { c, f } = useCz();
  const t = f.pick(AIR_T);
  const [sens, setSens] = useState(false);

  const bi = pmBand(PM_NOW);
  const ratio = (PM_NOW / WHO).toFixed(1);

  return (
    <Screen>
      <ScreenHeader title={t.aqTitle} sub={t.aqSub} />

      {/* PM2.5 now */}
      <Card style={{ borderRadius: R.xxl, padding: 18 }} gap={14}>
        <View style={styles.between}>
          <View style={{ gap: 4 }}>
            <Txt size={12} dim>
              PM2.5
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Txt size={56} num style={{ lineHeight: 60, letterSpacing: -1.7 }}>
                {f.loc(PM_NOW)}
              </Txt>
              <Txt size={14} dim>
                μg/m³
              </Txt>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 1 }}>
            <View style={[styles.cat, { backgroundColor: AQI_COLORS[bi] }]}>
              <Txt size={12} w={700} color={AQI_FG[bi]}>
                {t.cat[bi]}
              </Txt>
            </View>
            <Txt size={12} dim num>
              AQI {f.loc(pmAqi(PM_NOW))}
            </Txt>
          </View>
        </View>

        <View style={{ paddingTop: 16 }} accessible accessibilityLabel={`PM2.5 ${PM_NOW}, ${t.cat[bi]}. ${t.who}`}>
          <View style={styles.bands}>
            {BAND_W.map((w, i) => (
              <View key={i} style={{ flex: w, backgroundColor: AQI_COLORS[i] }} />
            ))}
          </View>
          <View style={[styles.marker, { start: `${px(PM_NOW)}%`, backgroundColor: c.ink }]} />
          <View style={[styles.whoLabel, { start: `${px(WHO)}%` }]}>
            <Txt size={10} w={700} color={c.leaf} lines={1} style={{ lineHeight: 13 }}>
              {t.who}
            </Txt>
          </View>
        </View>

        <Txt size={12.5} style={{ lineHeight: 18 }}>
          {t.vsWho.replace('{x}', f.loc(ratio))}
        </Txt>
        <View style={styles.wrap}>
          <View style={[styles.chip, { backgroundColor: c.limeSoft }]}>
            <View style={[styles.dot8, { backgroundColor: B.blue }]} />
            <Txt size={12} w={600}>
              {t.srcCom}
            </Txt>
          </View>
          <View style={[styles.chip, { backgroundColor: c.soft }]}>
            <Txt size={12}>{t.srcTime}</Txt>
          </View>
        </View>
      </Card>

      {/* Sensor map */}
      <Card pad={12} gap={10}>
        <SensorMap label={t.mapA11y} />
        <View style={[styles.wrap, { gap: 12, paddingHorizontal: 4 }]}>
          <Legend shape={<View style={[styles.lgBox, { borderColor: c.ink2, borderRadius: 3 }]} />} text={t.lgRef} />
          <Legend shape={<View style={[styles.lgBox, { borderColor: c.ink2, borderRadius: 6 }]} />} text={t.lgCom} />
          <Legend shape={<View style={[styles.lgBox, { borderWidth: 0, borderRadius: 6, backgroundColor: c.soft }]} />} text={t.lgModel} />
        </View>
      </Card>

      {/* 48 h forecast */}
      <Card pad={12} gap={10} style={{ paddingTop: 16 }}>
        <View style={[styles.between, { alignItems: 'baseline', paddingHorizontal: 4 }]}>
          <Label>{t.fcTitle}</Label>
          <Txt size={11} dim>
            NASA GEOS-CF
          </Txt>
        </View>
        <View style={{ marginHorizontal: 4 }}>
          <Note tone="warn" icon={I.warn}>
            <Txt size={12.5} w={600} style={{ lineHeight: 18 }}>
              {t.fcAlert}
            </Txt>
          </Note>
        </View>
        <ForecastChart label={t.fcA11y} tomorrow={t.tomorrow} />
      </Card>

      {/* AI clean-air plan */}
      <View style={{ gap: 10 }}>
        <View style={styles.planHead}>
          <View style={styles.ai}>
            <Txt size={9} w={700} color={B.lime} style={{ lineHeight: 11 }}>
              AI
            </Txt>
          </View>
          <Txt display size={14} accessibilityRole="header" style={{ flexShrink: 1 }}>
            {t.planTitle}
          </Txt>
        </View>
        <Tap role="checkbox" selected={sens} label={t.sens} haptic onPress={() => setSens(!sens)} style={[styles.sens, { backgroundColor: c.card }]}>
          <Check on={sens} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={13.5} w={600}>
              {t.sens}
            </Txt>
            <Txt size={11.5} dim>
              {t.sensSub}
            </Txt>
          </View>
        </Tap>
        <View style={styles.inout}>
          <Txt size={12.5} color={B.white} style={{ lineHeight: 18 }}>
            {t.inout}
          </Txt>
        </View>
        {t.plan.map(([title, when, items], ci) => (
          <Card key={title} pad={14} gap={10} style={{ borderRadius: 22 }}>
            <View style={[styles.between, { alignItems: 'baseline' }]}>
              <Txt size={14.5} w={600} style={{ flexShrink: 1 }}>
                {title}
              </Txt>
              <Txt size={11} dim style={{ flexShrink: 1 }}>
                {when}
              </Txt>
            </View>
            {ci === 0 && sens ? (
              <View style={styles.lead}>
                <Txt size={12} w={600}>
                  {t.lead}
                </Txt>
              </View>
            ) : null}
            {items.map(([a, why], k) => (
              <View key={a} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={[styles.num, { backgroundColor: c.limeSoft }]}>
                  <Txt size={11} w={700} style={{ lineHeight: 14 }}>
                    {f.loc(k + 1)}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={13} w={500} style={{ lineHeight: 18 }}>
                    {a}
                  </Txt>
                  <Txt size={11} dim>
                    {why}
                  </Txt>
                </View>
              </View>
            ))}
          </Card>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tap label={t.connect} haptic onPress={() => go('S28')} style={styles.connect}>
          <Txt size={14} w={600} color={B.limeInk} center lines={2}>
            {t.connect}
          </Txt>
        </Tap>
        <GhostButton label={t.myDev} onPress={() => go('S27')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function Legend({ shape, text }: { shape: ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {shape}
      <Txt size={11.5} dim>
        {text}
      </Txt>
    </View>
  );
}

/**
 * Basemap with modelled PM blobs and sensor pins. Positions are geographic, so they use physical
 * `left`/`top` and are not mirrored in RTL.
 */
function SensorMap({ label }: { label: string }) {
  const { f } = useCz();
  return (
    <View style={styles.map} accessible accessibilityLabel={label}>
      <Photo src={PHOTO.basemap(800, 560)} label={CREDIT.basemap} style={StyleSheet.absoluteFill} scrim={[[0, 0.3], [1, 0.3]]} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          {BLOBS.map(([, , , v], i) => (
            <RadialGradient key={i} id={`blob${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={AQI_COLORS[pmBand(v)]} stopOpacity={0.55} />
              <Stop offset="0.8" stopColor={AQI_COLORS[pmBand(v)]} stopOpacity={0.5} />
              <Stop offset="1" stopColor={AQI_COLORS[pmBand(v)]} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {BLOBS.map(([x, y, d], i) => (
          <Circle key={i} cx={`${x}%`} cy={`${y}%`} r={d / 2} fill={`url(#blob${i})`} />
        ))}
      </Svg>
      {PINS.map(([x, y, v, k], i) => {
        const b = pmBand(v);
        return (
          <View key={i} pointerEvents="none" style={[styles.anchor, { left: `${x}%`, top: `${y}%` }]}>
            <View style={[styles.pin, { backgroundColor: AQI_COLORS[b], borderRadius: k === 'r' ? 6 : R.pill }]}>
              <Txt size={11} w={700} color={AQI_FG[b]} num style={{ lineHeight: 14 }}>
                {f.loc(v)}
              </Txt>
            </View>
          </View>
        );
      })}
      <View pointerEvents="none" style={[styles.anchor, { left: '50%', top: '52%' }]}>
        <View style={styles.me} />
      </View>
    </View>
  );
}

/** 8 bars of forecast PM2.5 with the dashed WHO line (viewBox 346×150). */
function ForecastChart({ label, tomorrow }: { label: string; tomorrow: string }) {
  const { c, f, font } = useCz();
  const yS = (v: number) => 128 - (v / 100) * 110;
  const whoY = yS(WHO);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', aspectRatio: 346 / 150 }}>
      <Svg width="100%" height="100%" viewBox="0 0 346 150">
        <Line x1={8} x2={340} y1={whoY} y2={whoY} stroke={B.blue} strokeWidth={1.5} strokeDasharray="4 4" />
        <SvgText x={340} y={whoY - 4} fontSize={9.5} fontFamily={font(600)} fill={B.blue} textAnchor="end">
          WHO {f.loc(WHO)}
        </SvgText>
        {FC_V.map((v, i) => {
          const x = 10 + i * 41.5;
          const y = yS(v);
          return (
            <G key={i}>
              <Rect x={x} y={y} width={30} height={128 - y} rx={6} fill={AQI_COLORS[pmBand(v)]} />
              <SvgText x={x + 15} y={y - 4} fontSize={10} fontFamily={font(600)} fill={c.ink} textAnchor="middle">
                {f.loc(v)}
              </SvgText>
              <SvgText x={x + 15} y={146} fontSize={9} fontFamily={font(400)} fill={c.ink2} textAnchor="middle">
                {f.loc(FC_L[i]) + (i === 3 ? tomorrow : '')}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  cat: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill },
  bands: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  marker: { position: 'absolute', top: 10, width: 4, height: 22, borderRadius: 2, marginStart: -2 },
  whoLabel: { position: 'absolute', top: 0, width: 60, marginStart: -30, alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 12, borderRadius: R.pill },
  dot8: { width: 8, height: 8, borderRadius: 4 },
  lgBox: { width: 12, height: 12, borderWidth: 2 },
  map: { height: 240, borderRadius: 18, overflow: 'hidden', backgroundColor: B.photoBg },
  anchor: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  pin: {
    height: 26,
    minWidth: 26,
    paddingHorizontal: 7,
    borderWidth: 2,
    borderColor: B.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  me: { width: 14, height: 14, borderRadius: 7, backgroundColor: B.blue, borderWidth: 3, borderColor: B.white },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, paddingHorizontal: 4 },
  ai: { width: 22, height: 22, borderRadius: 7, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' },
  sens: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 },
  inout: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: B.navy },
  lead: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,0,0,0.1)' },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  connect: { flex: 1, height: 52, borderRadius: 30, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
