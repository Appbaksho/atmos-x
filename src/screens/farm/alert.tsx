/**
 * F02 · Alert detail — why the heat alert fired (trigger rule, lead time, confidence), Sunday's
 * hourly forecast against the 35° flowering threshold, and the one thing to do today.
 */
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Card, CzButton, Label, Screen, ScreenHeader, Txt } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { farmCopy } from './farm-data';

/** Hourly chart geometry (prototype 346×190 canvas). */
const W = 312;
const X0 = 32;
const LO = 24;
const HI = 40;
const yS = (v: number) => 8 + ((HI - v) / (HI - LO)) * 160;
const HOURS = Array.from({ length: 13 }, (_, i) => {
  const h = 6 + i;
  return { h, c: 27 + 9.4 * Math.max(0, Math.sin((Math.PI * (h - 5.5)) / 15)) };
});
const PEAK = Math.max(...HOURS.map((o) => o.c));

export default function AlertDetail() {
  const { c, f, prefs, font } = useCz();
  const t = farmCopy(prefs.lang);
  const [done, setDone] = useState(false);

  const bars = HOURS.map((o, i) => {
    const x = X0 + i * (W / HOURS.length) + 3;
    const y = yS(o.c);
    return { x, y, h: 168 - y, c: o.c >= 35 ? B.red : o.c >= 33 ? B.orange : c.soft, tx: x + 8, label: o.h % 3 === 0 ? f.loc(String(o.h).padStart(2, '0')) : '' };
  });
  const thY = yS(35);

  return (
    <Screen>
      <ScreenHeader title={t.alertTitle} sub={t.alertSub} />

      {/* Peak + risk */}
      <View style={{ backgroundColor: B.navy, borderRadius: 28, padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Txt size={12} color="rgba(255,255,255,0.8)" num>
              {t.alertWhen}
            </Txt>
            <Txt size={52} num color={B.white} style={{ lineHeight: 56, letterSpacing: -1.5 }}>
              {f.deg(PEAK)}
            </Txt>
          </View>
          <View style={{ backgroundColor: B.red, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, marginBottom: 6 }}>
            <Txt label color={B.white}>
              {t.risk}
            </Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <NavyTile label={t.lead} value={`${f.loc(2)} ${t.daysW}`} />
          <NavyTile label={t.confidence} value={`${t.hi} · ${f.loc(80)}%`} />
        </View>
      </View>

      {/* Trigger rule */}
      <Card gap={8}>
        <Label>{t.trigger}</Label>
        <Txt size={14}>{t.rule.replace('{t}', f.deg(35))}</Txt>
        <Txt size={11.5} dim>
          {t.issued}
        </Txt>
      </Card>

      {/* Sunday, hour by hour */}
      <Card pad={12} gap={10} style={{ paddingTop: 16 }}>
        <Label style={{ paddingHorizontal: 4 }}>{t.hourly}</Label>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${t.hourly}: peak ${f.deg(PEAK)}, ${f.deg(35)} ${t.threshold}`}
          style={{ width: '100%', aspectRatio: 346 / 190 }}>
          <Svg width="100%" height="100%" viewBox="0 0 346 190">
            {[25, 30, 35, 40].map((v) => (
              <Line key={'l' + v} x1={30} x2={342} y1={yS(v)} y2={yS(v)} stroke={c.line} strokeWidth={1} />
            ))}
            {[25, 30, 35, 40].map((v) => (
              <SvgText key={'t' + v} x={0} y={yS(v) + 3.5} fontSize={10} fill={c.ink2} fontFamily={font(400)}>
                {f.deg(v)}
              </SvgText>
            ))}
            {bars.map((b) => (
              <Rect key={'b' + b.x} x={b.x} y={b.y} width={16} height={b.h} rx={4} fill={b.c} />
            ))}
            {bars.map((b) =>
              b.label ? (
                <SvgText key={'x' + b.x} x={b.tx} y={184} fontSize={9.5} fill={c.ink2} fontFamily={font(400)} textAnchor="middle">
                  {b.label}
                </SvgText>
              ) : null,
            )}
            <Line x1={30} x2={342} y1={thY} y2={thY} stroke={B.red} strokeWidth={1.5} strokeDasharray="4 4" />
            <SvgText x={342} y={thY - 5} fontSize={10} fill={B.red} fontFamily={font(600)} textAnchor="end">
              {`${f.deg(35)} ${t.threshold}`}
            </SvgText>
          </Svg>
        </View>
        <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
          {t.anthesis}
        </Txt>
      </Card>

      {/* The one thing to do today */}
      <Card tone="limeSoft" pad={18}>
        <Label>{t.oneToday}</Label>
        <Txt display size={18} style={{ lineHeight: 24 }}>
          {t.oneThing}
        </Txt>
        <Txt size={12.5} dim>
          {t.oneWhy}
        </Txt>
        <CzButton label={done ? t.doneOk : t.done} icon="check" onPress={() => setDone(!done)} />
      </Card>
    </Screen>
  );
}

function NavyTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 2 }}>
      <Txt size={11} color="rgba(255,255,255,0.75)">
        {label}
      </Txt>
      <Txt size={15} w={600} num color={B.white} lines={1}>
        {value}
      </Txt>
    </View>
  );
}
