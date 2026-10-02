/**
 * F01 · Farmer home — the field hero, satellite-detected crop stage, today's alert ending in one
 * action, the 5-day forecast and field-edge trees (which still earn points).
 */
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { Card, CzButton, I, Icon, IconBtn, Label, LightStatusBar, Photo, Screen, Tap, Txt } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO } from '@/lib/cz/demo';
import { go } from '@/lib/cz/routes';
import { farmCopy, farmHeat, FORECAST, fxCopy } from './farm-data';

const EDGE_PHOTO = 'https://images.unsplash.com/photo-1663074898186-21b020623d09?auto=format&fit=crop&w=240&h=240&q=70&crop=focalpoint&fp-x=.7&fp-y=.55&fp-z=2';

export default function FarmerHome() {
  const { c, f, prefs } = useCz();
  const t = farmCopy(prefs.lang);
  const fx = fxCopy(prefs.lang);
  const insets = useSafeAreaInsets();
  const anom = fx.anom.replace('{a}', '+' + f.loc((prefs.unit === 'F' ? 2.4 * 1.8 : 2.4).toFixed(1)) + '°');

  return (
    <Screen tab bleed>
      <LightStatusBar />
      {/* Field hero */}
      <Photo src={PHOTO.field(900, 900)} style={{ height: 400 }} scrim={[[0, 0.55], [0.3, 0.05], [0.58, 0.3], [1, 0.88]]} label="Your rice field">
        <View style={{ position: 'absolute', top: insets.top + 12, start: 20, end: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tap role="link" label={t.place} onPress={() => go('F03')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <Icon d={I.pin} size={18} color={B.white} />
            <Txt size={14} w={500} color={B.white}>
              {t.place}
            </Txt>
          </Tap>
          <IconBtn d={I.bell} label={t.notifications} tone="glass" iconSize={20} badge onPress={() => go('S21')} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', start: 20, end: 20, bottom: 24, gap: 10 }}>
          <Txt size={13} color="rgba(255,255,255,0.88)">
            {t.field}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexShrink: 1, minWidth: 0, gap: 6 }}>
              <Txt display size={28} color={B.white} accessibilityRole="header" style={{ lineHeight: 32 }}>
                {t.crop}
              </Txt>
              <Txt size={14} w={600} color={B.lime}>
                {t.stageLine}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Txt size={48} num color={B.white} style={{ lineHeight: 52, letterSpacing: -1.4 }}>
                {f.deg(33)}
              </Txt>
              <Txt size={11.5} color="rgba(255,255,255,0.85)">
                {t.airNow}
              </Txt>
            </View>
          </View>
        </View>
      </Photo>

      {/* Growth stage (satellite-detected) */}
      <Card style={{ marginHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Label>{t.growth}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: B.navy }}>
            <Icon d={I.sat} size={12} color={B.lime} sw={2.2} />
            <Txt size={11} w={600} color={B.lime} lines={1}>
              {fx.sat}
            </Txt>
          </View>
        </View>
        <NdviChart today={fx.today} fl={fx.fl} label={fx.ndviL} />
        <Txt size={12} dim>
          {fx.cap}
        </Txt>
        <Txt size={11.5} w={600} color={c.leaf}>
          {fx.gt}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {t.stages.map((label, i) => (
            <View key={label} style={{ flex: 1, minWidth: 0, gap: 6, alignItems: 'center' }}>
              <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: i < 3 ? c.leaf : i === 3 ? B.lime : c.soft }} />
              <Txt size={10.5} w={i === 3 ? 700 : 500} color={i === 3 ? c.ink : c.ink2} lines={1}>
                {label}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      {/* Today's alert, ending in one action */}
      <View style={{ marginHorizontal: 16, backgroundColor: c.card, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: B.red }}>
        <View style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: B.red }}>
              <Icon d={I.warn} size={12} color={B.white} sw={2.6} />
              <Txt label color={B.white}>
                {t.alertTag}
              </Txt>
            </View>
            <Txt size={12} dim num>
              {t.alertWhen}
            </Txt>
          </View>
          <Txt size={18} w={600} style={{ lineHeight: 24 }}>
            {`${f.deg(36)} ${t.alertAt}`}
          </Txt>
          <Txt size={13} dim>
            {t.alertWhy}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(229,83,61,0.1)' }}>
            <View style={{ marginTop: 1 }}>
              <Icon d={I.trend} size={16} color={B.red} sw={2.2} />
            </View>
            <Txt size={12.5} style={{ flex: 1 }}>
              {anom}
            </Txt>
          </View>
        </View>
        <View style={{ backgroundColor: c.limeSoft, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          <View style={{ gap: 3 }}>
            <Label>{t.today}</Label>
            <Txt size={15} w={600}>
              {t.oneThing}
            </Txt>
          </View>
          <CzButton label={t.whatToDo} icon="arrow" size="md" onPress={() => go('F02')} />
        </View>
      </View>

      {/* 5-day forecast */}
      <Card style={{ marginHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>{t.forecast}</Label>
          <Txt size={11} dim>
            GEOS-FP · 0.25°
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {FORECAST.map(([mx, mm], i) => (
            <View
              key={i}
              accessible
              accessibilityLabel={`${t.days[i]}: ${f.deg(mx)}, ${mm ? mm + ' ' + t.mm : '0 ' + t.mm}`}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 16, backgroundColor: i === 2 ? 'rgba(229,83,61,0.12)' : 'transparent' }}>
              <Txt size={11.5} w={600} lines={1}>
                {i === 2 ? t.days[i] + ' !' : t.days[i]}
              </Txt>
              <View style={{ height: 64, width: 10, borderRadius: 5, backgroundColor: c.soft, justifyContent: 'flex-end', overflow: 'hidden' }}>
                <View style={{ width: '100%', borderRadius: 5, height: `${Math.round(((mx - 26) / 12) * 100)}%`, backgroundColor: farmHeat(mx) }} />
              </View>
              <Txt size={15} w={600} num>
                {f.deg(mx)}
              </Txt>
              <Txt size={10.5} dim num lines={1}>
                {mm ? `${f.loc(mm)} ${t.mm}` : '—'}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      {/* Field-edge trees */}
      <Card style={{ marginHorizontal: 16, flexDirection: 'row', alignItems: 'center' }} pad={10} gap={12}>
        <Photo src={EDGE_PHOTO} style={{ width: 72, height: 72, borderRadius: 16 }} label="Trees on a field edge" />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt size={14} w={600}>
            {t.edgeTitle}
          </Txt>
          <Txt size={12} dim>
            {t.edgeSub}
          </Txt>
        </View>
        <CzButton label={t.log} icon="camera" size="sm" onPress={() => go('S14')} style={{ paddingEnd: 14 }} />
      </Card>
    </Screen>
  );
}

/** NDVI season curve: observed (solid + dots), expected (dashed), flowering window, today marker. */
function NdviChart({ today, fl, label }: { today: string; fl: string; label: string }) {
  const { c, font } = useCz();
  const nd = (d: number) => 0.22 + 0.6 / (1 + Math.exp(-(d - 38) / 8)) - (d > 82 ? (d - 82) * 0.007 : 0);
  const NX = (d: number) => +(12 + (d / 120) * 322).toFixed(1);
  const NY = (v: number) => +(78 - ((v - 0.15) / 0.85) * 68).toFixed(1);
  const past: string[] = [];
  const fut: string[] = [NX(79) + ',' + NY(nd(79))];
  const obs: { x: number; y: number }[] = [];
  for (let d = 0; d <= 120; d += 2) (d <= 79 ? past : fut).push(NX(d) + ',' + NY(nd(d)));
  for (let d = 5; d <= 75; d += 5) if (![20, 30, 45].includes(d)) obs.push({ x: NX(d), y: NY(nd(d)) });
  const tx = NX(79);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${label}: ${fl}, ${today}`} style={{ width: '100%', aspectRatio: 340 / 92 }}>
      <Svg width="100%" height="100%" viewBox="0 0 340 92">
        <Line x1={12} x2={334} y1={78} y2={78} stroke={c.line} strokeWidth={1} />
        <Rect x={NX(75)} y={4} width={+(NX(90) - NX(75)).toFixed(1)} height={74} rx={4} fill="rgba(172,236,0,0.22)" />
        <Polyline points={past.join(' ')} fill="none" stroke="#3B8A2E" strokeWidth={2.5} strokeLinejoin="round" />
        <Polyline points={fut.join(' ')} fill="none" stroke="#3B8A2E" strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
        {obs.map((o) => (
          <Circle key={o.x} cx={o.x} cy={o.y} r={3} fill={c.card} stroke="#3B8A2E" strokeWidth={2} />
        ))}
        <Line x1={tx} x2={tx} y1={4} y2={78} stroke={c.ink} strokeWidth={1.5} strokeDasharray="3 3" />
        <SvgText x={tx} y={90} fontSize={9.5} fontFamily={font(600)} fill={c.ink} textAnchor="middle">
          {today}
        </SvgText>
        <SvgText x={NX(84)} y={14} fontSize={9.5} fontFamily={font(600)} fill={c.ink} textAnchor="middle">
          {fl}
        </SvgText>
        <SvgText x={14} y={14} fontSize={9.5} fontFamily={font(400)} fill={c.ink2}>
          {label}
        </SvgText>
      </Svg>
    </View>
  );
}
