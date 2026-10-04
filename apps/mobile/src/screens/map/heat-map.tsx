/**
 * S05 · Heat map — layout variant A: full-bleed satellite basemap with the H3-style heat field,
 * a glass header (layer switch + legend) and a bottom sheet with the three hottest zones.
 * The prototype draws on a 402×874 canvas; we keep that coordinate space as the svg viewBox
 * ("slice" = cover) and map the floating labels through the same transform.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polygon } from 'react-native-svg';

import { GlassPill, HeatBadge, Icon, LightStatusBar, Photo, Seg, Tag, Tap, Txt } from '@/components/cz/ui';
import { B, heatColor, heatFg, R as RADII, SHADOW, TAB_CLEARANCE } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO, ZONES } from '@/lib/cz/demo';
import { hexGrid, type Spot } from '@/lib/cz/hex';
import { goPath } from '@/lib/cz/routes';
import { MAP_T } from './map-copy';

/** Prototype canvas. */
const MAP_W = 402;
const MAP_H = 874;
const CX = 201;
const CY = 420;
const HOT: Spot[] = [
  [150, 340, 50, 44],
  [275, 500, 44, 38],
  [120, 560, 34, 28],
];
const COOL: Spot[] = [
  [300, 280, 44, 34],
  [200, 640, 30, 22],
];
const LEGEND: [string, number][] = [
  ['<40', 30],
  ['40–55', 47],
  ['55–70', 62],
  ['70–85', 77],
  ['85+', 90],
];
const COOL_SCORE = 31;

type Layer = 'lst' | 'air';

export default function HeatMap() {
  const { c, f, prefs } = useCz();
  const t = f.pick(MAP_T);
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [size, setSize] = useState({ w: win.width, h: win.height });
  const [layer, setLayer] = useState<Layer>('lst');

  const radius = prefs.radius || 500;
  const ring = radius >= 1000 ? 196 : radius >= 500 ? 186 : 150;
  // The air layer damps the surface hot spots (air is far more uniform than roofs & roads).
  const shift = layer === 'air' ? 0.55 : 1;
  const hexes = useMemo(
    () => hexGrid({ cx: CX, cy: CY, R: ring, sz: 22, w: MAP_W, h: MAP_H, hot: HOT.map(([x, y, w, a]) => [x, y, w, a * shift] as Spot), cool: COOL }),
    [ring, shift],
  );

  // viewBox "xMidYMid slice" transform, so overlays land on the same map spot as the svg.
  const k = Math.max(size.w / MAP_W, size.h / MAP_H);
  const ox = (size.w - MAP_W * k) / 2;
  const oy = (size.h - MAP_H * k) / 2;
  const at = (x: number, y: number) => ({ left: ox + x * k, top: oy + y * k });

  const top = ZONES[0];
  const tie = (i: number) =>
    (i > 0 && ZONES[i - 1].score - ZONES[i].score <= 3) || (i < ZONES.length - 1 && ZONES[i].score - ZONES[i + 1].score <= 3);

  return (
    <View style={{ flex: 1, backgroundColor: B.photoBg }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <LightStatusBar />
      <Photo src={PHOTO.basemap()} style={StyleSheet.absoluteFill} label="Satellite basemap of your scan area" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,16,32,0.28)' }]} />
      <Svg
        pointerEvents="none"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}>
        <Circle cx={CX} cy={CY} r={ring} fill="none" stroke={B.lime} strokeWidth={2} strokeDasharray="6 6" />
        {hexes.map((h, i) => (
          <Polygon key={i} points={h.pts} fill={heatColor(h.s)} fillOpacity={0.55} stroke="rgba(255,255,255,0.8)" strokeWidth={h.hottest ? 3 : 1} />
        ))}
        <Circle cx={CX} cy={CY} r={7} fill={B.blue} stroke={B.white} strokeWidth={3} />
      </Svg>

      <LinearGradient pointerEvents="none" colors={['rgba(0,16,32,0.7)', 'rgba(0,16,32,0)']} style={{ position: 'absolute', top: 0, start: 0, end: 0, height: insets.top + 130 }} />

      {/* Header: title, layer switch, legend */}
      <View style={{ position: 'absolute', top: insets.top + 12, start: 16, end: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flexShrink: 1, gap: 4 }}>
            <Txt display size={17} color={B.white} accessibilityRole="header">
              {t.title}
            </Txt>
            <Txt size={12} color={B.white} style={{ opacity: 0.85 }} lines={1}>
              {`${t.within} ${f.loc(radius)} m · Landsat 9 · ${f.loc(27)} Sep`}
            </Txt>
          </View>
          <Seg<Layer>
            tone="glass"
            height={38}
            style={{ width: 200 }}
            value={layer}
            onChange={setLayer}
            options={[
              { label: t.lst, value: 'lst' },
              { label: t.airL, value: 'air' },
            ]}
          />
        </View>
        <View
          accessible
          accessibilityLabel={`Heat Score legend: ${LEGEND.map(([l]) => l).join(', ')}`}
          style={{ flexDirection: 'row', gap: 2, padding: 6, borderRadius: 14, backgroundColor: B.glassDark, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
          {LEGEND.map(([l, s]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: heatColor(s) }} />
              <Txt size={10.5} color={B.white} num lines={1}>
                {f.loc(l)}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      {/* Floating map labels — anchored to map coordinates, so they use absolute left/top (not start). */}
      <Tap
        label={`${top.name}, Heat Score ${top.score}`}
        onPress={() => goPath('/zone/' + top.id)}
        hitSlop={8}
        style={{ position: 'absolute', ...at(96, 300) }}>
        <GlassPill dark style={{ paddingStart: 6, paddingEnd: 12, minHeight: 40, gap: 8 }}>
          <MapScore score={top.score} />
          <Txt size={12.5} w={600} color={B.white}>
            {top.name}
          </Txt>
        </GlassPill>
      </Tap>
      <View pointerEvents="none" style={{ position: 'absolute', ...at(236, 236) }}>
        <GlassPill dark style={{ paddingStart: 6, paddingEnd: 12, minHeight: 40, gap: 8 }}>
          <MapScore score={COOL_SCORE} />
          <Txt size={12.5} w={600} color={B.white}>
            Park edge
          </Txt>
        </GlassPill>
      </View>

      {/* Bottom sheet — sits above the floating tab bar */}
      <View
        style={[
          {
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: 0,
            backgroundColor: c.bg,
            borderTopLeftRadius: RADII.xxl,
            borderTopRightRadius: RADII.xxl,
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: TAB_CLEARANCE - 6 + Math.max(0, insets.bottom - 12),
            gap: 10,
          },
          SHADOW.sheet,
        ]}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, gap: 8 }}>
          <Txt display size={14} style={{ flexShrink: 1 }}>
            {t.ranked}
          </Txt>
          <Txt size={12} dim>
            {t.count}
          </Txt>
        </View>
        <View style={{ backgroundColor: c.card, borderRadius: 22, paddingVertical: 2, paddingHorizontal: 14 }}>
          {ZONES.slice(0, 3).map((z, i) => (
            <Tap
              key={z.id}
              label={`${i + 1}. ${z.name}, Heat Score ${z.score}${tie(i) ? ', ' + t.nearTie : ''}. ${t.openZone}`}
              onPress={() => goPath('/zone/' + z.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: c.line }}>
              <Txt size={12} dim num style={{ width: 16 }}>
                {f.loc(i + 1)}
              </Txt>
              <HeatBadge score={z.score} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={14} w={600} lines={1}>
                  {z.name}
                </Txt>
                <Txt size={12} dim num lines={1}>
                  {`${t.lstShort} ${f.deg(z.lst)} · ${f.loc(z.distM)} m`}
                </Txt>
              </View>
              {tie(i) ? <Tag size="xs" label={t.nearTie} fg={c.ink2} /> : null}
              <View style={[{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }, SHADOW.button]}>
                <Icon d={f.arrowPath} size={16} color={B.limeInk} sw={2} />
              </View>
            </Tap>
          ))}
        </View>
        <Txt size={11} dim style={{ paddingHorizontal: 4 }}>
          {t.tieNote}
        </Txt>
      </View>
    </View>
  );
}

/** Small score disc used on the floating map labels. */
function MapScore({ score }: { score: number }) {
  const { f } = useCz();
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: heatColor(score), alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={11} w={700} num color={heatFg(score)}>
        {f.loc(score)}
      </Txt>
    </View>
  );
}
