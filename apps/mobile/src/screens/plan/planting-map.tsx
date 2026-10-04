/**
 * Satellite planting map (S09 editable, S10 read-only). Trees are placed in % of the map so the
 * layout works at any phone width. Geography never mirrors, so the map is laid out LTR even in Urdu.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { Photo, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { SPECIES_NAMES } from '@/lib/cz/demo';
import { inZone, setPlan, SPOTS, SPS, spotTaken, usePlan, ZONE_POLY } from './plan-store';

const MAP_SRC =
  'https://images.unsplash.com/photo-1592396131156-0d1a9c1f6869?auto=format&fit=crop&w=800&h=700&q=70&crop=focalpoint&fp-x=.35&fp-y=.55&fp-z=1.5';

export function PlantingMap({
  editable,
  height,
  legend,
}: {
  editable?: boolean;
  height: number;
  /** Bottom legend: the zone-edge key (editor) or the species key (read-only) */
  legend: { spot: string; zoneEdge?: string };
}) {
  const { prefs } = useCz();
  const plan = usePlan();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = (text: string, bad: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ text, bad });
    timer.current = setTimeout(() => setMsg(null), 1800);
  };

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const place = (lx: number, ly: number) => {
    if (!size.w) return;
    const k = size.h / size.w;
    let x = (lx / size.w) * 100;
    let y = (ly / size.h) * 100;
    const snap = SPOTS.find(([sx, sy]) => Math.hypot(sx - x, (sy - y) * k) < 6);
    if (snap) [x, y] = snap;
    if (!inZone(x, y)) return flash('Outside the zone', true);
    if (plan.trees.some((p) => Math.hypot(p.x - x, (p.y - y) * k) < 7)) return flash('Too close — leave 8 m between trees', true);
    setPlan((s) => ({ trees: [...s.trees, { x: +x.toFixed(1), y: +y.toFixed(1), sp: s.sp }] }));
    flash(snap ? 'Placed on a suggested spot' : 'Tree placed', false);
  };

  const spotSize = editable ? 26 : 22;
  const dot = editable ? 10 : 9;
  const pts = (P: [number, number][]) => P.map(([x, y]) => `${(x * size.w) / 100},${(y * size.h) / 100}`).join(' ');
  const names = SPECIES_NAMES[prefs.lang];

  return (
    <View onLayout={onLayout} style={{ height, borderRadius: editable ? 18 : R.md, overflow: 'hidden', backgroundColor: B.photoBg, direction: 'ltr' }}>
      <Photo src={MAP_SRC} style={StyleSheet.absoluteFill} label="Satellite view of Asad Gate block" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,16,32,0.22)' }]} />
      {size.w > 0 ? (
        <Svg pointerEvents="none" width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Polygon points={pts(ZONE_POLY)} fill="rgba(1,63,246,0.06)" stroke={B.lime} strokeWidth={2} strokeDasharray="6 5" />
          <Polyline points={pts([[10, 84], [92, 52]])} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
        </Svg>
      ) : null}
      {SPOTS.map(([x, y]) =>
        spotTaken(plan.trees, x, y) ? null : (
          <View
            key={`${x}-${y}`}
            pointerEvents="none"
            style={{ position: 'absolute', start: `${x}%`, top: `${y}%`, marginStart: -spotSize / 2, marginTop: -spotSize / 2, width: spotSize, height: spotSize, borderRadius: spotSize / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.9)' }}
          />
        ),
      )}
      {editable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Planting map. Tap to place a tree"
          style={StyleSheet.absoluteFill}
          onPress={(e) => place(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        />
      ) : null}
      {plan.trees.map((p, i) => {
        const S = SPS[p.sp];
        const style = {
          position: 'absolute' as const,
          start: `${p.x}%` as const,
          top: `${p.y}%` as const,
          marginStart: -S.size / 2,
          marginTop: -S.size / 2,
          width: S.size,
          height: S.size,
          borderRadius: S.size / 2,
          borderWidth: 2,
          borderColor: S.c,
          backgroundColor: S.fill,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        };
        const inner = <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: S.c, borderWidth: 2, borderColor: B.navy }} />;
        return editable ? (
          <Tap
            key={i}
            label={`Remove ${names[S.key]} tree`}
            hitSlop={(44 - S.size) / 2 + 2}
            onPress={() => setPlan((s) => ({ trees: s.trees.filter((_, j) => j !== i) }))}
            style={style}>
            {inner}
          </Tap>
        ) : (
          <View key={i} pointerEvents="none" style={style}>
            {inner}
          </View>
        );
      })}

      <View pointerEvents="none" style={{ position: 'absolute', start: editable ? 10 : 8, end: editable ? undefined : 8, bottom: editable ? 10 : 8, flexDirection: 'row', flexWrap: 'wrap', gap: editable ? 6 : 5 }}>
        {!editable
          ? SPS.map((s) => (
              <MapChip key={s.key} small>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.c }} />
                <Txt size={10.5} color={B.white}>
                  {names[s.key]}
                </Txt>
              </MapChip>
            ))
          : null}
        <MapChip small={!editable}>
          <View style={{ width: editable ? 11 : 9, height: editable ? 11 : 9, borderRadius: 6, borderWidth: editable ? 2 : 1.5, borderStyle: 'dashed', borderColor: B.white }} />
          <Txt size={editable ? 11 : 10.5} color={B.white}>
            {legend.spot}
          </Txt>
        </MapChip>
        {editable && legend.zoneEdge ? (
          <MapChip>
            <View style={{ width: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: B.lime }} />
            <Txt size={11} color={B.white}>
              {legend.zoneEdge}
            </Txt>
          </MapChip>
        ) : null}
      </View>

      {editable && msg ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 10, start: 0, end: 0, alignItems: 'center' }}>
          <View
            accessibilityLiveRegion="polite"
            style={{ height: 32, paddingHorizontal: 14, borderRadius: R.pill, justifyContent: 'center', backgroundColor: msg.bad ? B.deepRed : B.lime, shadowColor: '#001020', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
            <Txt size={12} w={600} color={msg.bad ? B.white : B.limeInk} lines={1}>
              {msg.text}
            </Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MapChip({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <View style={{ height: small ? 24 : 26, paddingHorizontal: small ? 9 : 10, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: small ? 5 : 6, backgroundColor: 'rgba(0,24,46,0.65)' }}>
      {children}
    </View>
  );
}
