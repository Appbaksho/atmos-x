/**
 * S07 · Projection — mean air temperature for the goal zone, "do nothing" vs "with plan",
 * as uncertainty bands to the goal date, +1 year or +5 years. Maths ported 1:1 from the prototype.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { Card, CzButton, Screen, ScreenHeader, Seg, Txt } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { GOAL, zoneById } from '@/lib/cz/demo';
import { go } from '@/lib/cz/routes';
import { MAP_T } from './map-copy';

/** Horizon in years from Oct 2026 for each segment (goal date is Oct 2027). */
const HZ = [1, 2, 6];
const CW = 346;
const CH = 220;

export default function Projection() {
  const { c, f, font } = useCz();
  const t = f.pick(MAP_T);
  const [hz, setHz] = useState(0);
  const H = HZ[hz];
  const zone = zoneById(GOAL.zoneId);

  const chart = useMemo(() => {
    const N = 24;
    const base = 34.0;
    const cA = (y: number) => base + 0.12 * y;
    const sA = (y: number) => 0.15 + 0.09 * y;
    const cB = (y: number) => base + 0.12 * y - 1.5 * Math.min(1, y);
    const sB = (y: number) => 0.2 + 0.12 * y;
    const pts: number[] = [];
    for (let i = 0; i <= N; i++) pts.push((H * i) / N);
    let lo = Infinity;
    let hi = -Infinity;
    pts.forEach((y) => {
      lo = Math.min(lo, cB(y) - sB(y), cA(y) - sA(y));
      hi = Math.max(hi, cA(y) + sA(y), cB(y) + sB(y));
    });
    lo = Math.floor(lo * 2) / 2 - 0.5;
    hi = Math.ceil(hi * 2) / 2 + 0.5;
    const X = (y: number) => 34 + (y / H) * 300;
    const Y = (v: number) => 6 + ((hi - v) / (hi - lo)) * 190;
    const n1 = (n: number) => n.toFixed(1);
    const band = (cf: (y: number) => number, sf: (y: number) => number) =>
      pts
        .map((y) => n1(X(y)) + ',' + n1(Y(cf(y) + sf(y))))
        .concat(
          pts
            .slice()
            .reverse()
            .map((y) => n1(X(y)) + ',' + n1(Y(cf(y) - sf(y)))),
        )
        .join(' ');
    const line = (cf: (y: number) => number) => pts.map((y) => n1(X(y)) + ',' + n1(Y(cf(y)))).join(' ');
    const step = hi - lo > 4 ? 1 : 0.5;
    const yt: { y: number; label: string }[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) yt.push({ y: Y(v), label: f.deg(v, step < 1 ? 1 : 0) });
    const xt: { x: number; label: string }[] = [];
    const st = H > 2 ? 1 : 0.5;
    for (let y = 0; y <= H + 1e-6; y += st) {
      const half = Math.round(y * 2) % 2 === 1;
      xt.push({ x: X(y), label: (half ? 'Apr ’' : 'Oct ’') + f.loc(26 + Math.floor(y + 0.5)) });
    }
    return {
      yt,
      xt,
      gx: X(1),
      bandA: band(cA, sA),
      bandB: band(cB, sB),
      lineA: line(cA),
      lineB: line(cB),
      when: 'Oct ' + f.loc(2026 + H),
      rangeA: f.deg(cA(H) - sA(H), 1) + '–' + f.deg(cA(H) + sA(H), 1),
      rangeB: f.deg(cB(H) - sB(H), 1) + '–' + f.deg(cB(H) + sB(H), 1),
    };
  }, [H, f]);

  const label = `${t.doNothing} ${chart.when}: ${chart.rangeA}. ${t.withPlan} ${chart.when}: ${chart.rangeB}.`;

  return (
    <Screen>
      <ScreenHeader title={t.proj} sub={`${zone.name} · ${t.projSub}`} />
      <Seg tone="card" height={40} value={hz} onChange={setHz} options={t.h.map((l, i) => ({ label: l, value: i }))} style={{ padding: 4 }} />

      <Card pad={12} gap={10} style={{ paddingTop: 16 }}>
        <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', aspectRatio: CW / CH }}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${CW} ${CH}`}>
            {chart.yt.map((y) => (
              <Line key={'g' + y.label} x1={34} x2={340} y1={y.y} y2={y.y} stroke={c.line} strokeWidth={1} />
            ))}
            {chart.yt.map((y) => (
              <SvgText key={'y' + y.label} x={0} y={y.y + 3.5} fontSize={10} fill={c.ink2} fontFamily={font(400)}>
                {y.label}
              </SvgText>
            ))}
            {chart.xt.map((x) => (
              <SvgText key={'x' + x.x} x={x.x} y={214} fontSize={10} fill={c.ink2} fontFamily={font(400)} textAnchor="middle">
                {x.label}
              </SvgText>
            ))}
            <Line x1={chart.gx} x2={chart.gx} y1={6} y2={196} stroke={c.ink2} strokeWidth={1} strokeDasharray="3 4" />
            <Polygon points={chart.bandA} fill={B.red} fillOpacity={0.18} />
            <Polygon points={chart.bandB} fill={B.blue} fillOpacity={0.18} />
            <Polyline points={chart.lineA} fill="none" stroke={B.red} strokeWidth={2.5} strokeLinecap="round" />
            <Polyline points={chart.lineB} fill="none" stroke={B.blue} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, paddingHorizontal: 4 }}>
          <LegendItem color={B.red} label={t.doNothing} />
          <LegendItem color={B.blue} label={t.withPlan} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: c.ink2 }} />
            <Txt size={12} dim>
              {t.goalMark}
            </Txt>
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <RangeTile label={`${t.doNothing} · ${chart.when}`} value={chart.rangeA} color={B.red} />
        <RangeTile label={`${t.withPlan} · ${chart.when}`} value={chart.rangeB} color={c.leaf} />
      </View>
      <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
        {t.rangesNote}
      </Txt>
      <CzButton label={t.start} icon="arrow" onPress={() => go('S08')} />
    </Screen>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: color }} />
      <Txt size={12} dim>
        {label}
      </Txt>
    </View>
  );
}

function RangeTile({ label, value, color }: { label: string; value: string; color: string }) {
  const { c } = useCz();
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: 20, padding: 14, gap: 4 }}>
      <Txt size={11.5} dim>
        {label}
      </Txt>
      <Txt size={22} num color={color} style={{ letterSpacing: -0.4 }} lines={1}>
        {value}
      </Txt>
    </View>
  );
}
