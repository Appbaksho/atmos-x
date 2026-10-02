/**
 * S06 · Zone detail — hero with the Heat Score, observed heat level, 20 years of satellite history
 * (heat / greenness hex map with a year slider) and the drivers that make this block hot.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { Bar, Card, CzButton, CzSlider, GhostButton, I, Icon, IconBtn, Label, LightStatusBar, Note, Photo, PillButton, Screen, Seg, StatTile, Tag, Tap, Txt } from '@/components/cz/ui';
import { B, heatColor, heatFg } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO, zoneById } from '@/lib/cz/demo';
import { hexGrid } from '@/lib/cz/hex';
import { go, goBack } from '@/lib/cz/routes';
import { DRIVERS_T, LST_BASE, lstY, MAP_T, ndY, YEARS_T } from './map-copy';

/** Greenness ramp (dense → sparse). */
const GR = ['#1F5E20', '#3B8A2E', '#6DB33F', '#A8D46F', '#D9E8B0'];
/** Tree dots planted from 2024 on, in the 340×200 history canvas. */
const TP: [number, number][] = [
  [120, 132],
  [138, 148],
  [152, 134],
  [128, 155],
  [146, 124],
  [160, 150],
];
/** Drivers: value %, colour, °C added, city average %, gain from the fix (°C). */
const DRV: { key: 'sealed' | 'green' | 'roofs' | 'density'; v: number; c: string; ad: number; av: number; gn: number }[] = [
  { key: 'sealed', v: 78, c: B.red, ad: 1.6, av: 61, gn: -0.3 },
  { key: 'green', v: 6, c: B.green, ad: 1.2, av: 14, gn: -0.5 },
  { key: 'roofs', v: 64, c: B.orange, ad: 0.9, av: 48, gn: -0.6 },
  { key: 'density', v: 71, c: B.yellow, ad: 0.5, av: 58, gn: -0.15 },
];

export default function ZoneDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const zone = zoneById(id);
  const { f } = useCz();
  const t = f.pick(MAP_T);
  const insets = useSafeAreaInsets();
  const dC2 = (v: number) => f.dC(v, 1);
  const anom = `${dC2(lstY(2026) - LST_BASE)} ${f.pick(YEARS_T).anom}`;

  return (
    <Screen bleed>
      <LightStatusBar />
      {/* Hero */}
      <Photo src={PHOTO.neighborhood(900, 760)} style={{ height: 340 }} scrim={[[0, 0.55], [0.35, 0], [1, 0.85]]} label={`Aerial photo of ${zone.name}`}>
        <IconBtn d={f.backPath} label={t.back} tone="glass" onPress={goBack} style={{ position: 'absolute', top: insets.top + 12, start: 16 }} />
        <View pointerEvents="none" style={{ position: 'absolute', start: 20, end: 20, bottom: 22, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1, minWidth: 0, gap: 6 }}>
            <Txt display size={20} color={B.white} accessibilityRole="header">
              {zone.name}
            </Txt>
            <Txt size={13} color={B.white} style={{ opacity: 0.9 }}>
              {t.zoneSub.replace('{d}', f.loc(zone.distM))}
            </Txt>
            <Tag label={anom} bg={B.red} fg={B.white} size="md" style={{ height: 26 }} />
          </View>
          <View style={{ alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`Heat Score ${zone.score}, ${zone.score >= 85 ? t.vhigh : t.high}`}>
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: heatColor(zone.score), alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={22} w={600} num color={heatFg(zone.score)}>
                {f.loc(zone.score)}
              </Txt>
            </View>
            <Txt label color={B.white} style={{ fontSize: 10.5 }}>
              {zone.score >= 85 ? t.vhigh : t.high}
            </Txt>
          </View>
        </View>
      </Photo>

      {/* Heat level · observed */}
      <Card style={{ marginHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>{t.observed}</Label>
          <Txt size={11} dim num>
            {`${f.loc(27)} Sep · ${f.loc('10:30')}`}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile big label={t.air} value={f.deg(34)} style={{ borderRadius: 16 }} />
          <StatTile big label={t.feels} value={f.deg(41)} style={{ borderRadius: 16 }} />
          <StatTile big label={t.roof} value={f.deg(zone.lst)} style={{ borderRadius: 16 }} />
        </View>
        <Txt size={11.5} dim>
          {t.lstNote}
        </Txt>
      </Card>

      <YearsCard />
      <DriversCard />

      <View style={{ marginHorizontal: 16, gap: 10 }}>
        <CzButton label={t.setGoal} icon="plus" onPress={() => go('S08')} />
        <GhostButton label={t.seeProj} onPress={() => go('S07')} />
      </View>
    </Screen>
  );
}

/** "Over the years": heat / greenness hex field over the basemap for the chosen year. */
function YearsCard() {
  const { f } = useCz();
  const zt = f.pick(YEARS_T);
  const [year, setYear] = useState(2026);
  const [layer, setLayer] = useState(0);
  const dC2 = (v: number) => f.dC(v, 1);

  const hex = useMemo(() => {
    const k = 0.75 + 0.025 * (year - 2006);
    const tc = year >= 2024 ? 9 * (year - 2023) : 0;
    return hexGrid({
      cx: 170,
      cy: 100,
      R: 98,
      sz: 14,
      w: 340,
      h: 200,
      hot: [
        [110, 70, 30, 34 * k],
        [235, 128, 26, 30 * k],
        [150, 150, 20, 18 * k],
      ],
      cool: [
        [265, 55, 24, 22],
        [135, 140, 22, tc],
      ],
    });
  }, [year]);
  const trees = TP.slice(0, year >= 2024 ? Math.min(6, (year - 2023) * 2) : 0);
  const stats: [string, string][] = [
    [zt.lst, f.deg(lstY(year), 1)],
    [zt.ndvi, f.loc(ndY(year).toFixed(2))],
    [zt.vsAvg, dC2(lstY(year) - LST_BASE)],
  ];
  const cmp = `${zt.before}: ${zt.lst} ${dC2(lstY(2026) - lstY(2023))} · ${zt.ndvi} +${f.loc((ndY(2026) - ndY(2023)).toFixed(2))}`;

  return (
    <Card style={{ marginHorizontal: 16 }} pad={14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 2, paddingTop: 2 }}>
        <Txt display size={14} style={{ flexShrink: 1 }}>
          {zt.yearsTitle}
        </Txt>
        <Txt size={24} w={600} num style={{ letterSpacing: -0.2 }}>
          {f.loc(year)}
        </Txt>
      </View>
      <Seg height={36} value={layer} onChange={setLayer} options={zt.layers.map((label, i) => ({ label, value: i }))} />
      <Photo
        src={PHOTO.basemap(800, 470, '&crop=focalpoint&fp-x=.3&fp-y=.55&fp-z=1.6')}
        style={{ height: 200, borderRadius: 16 }}
        label={`${layer ? zt.ndvi : zt.lst} map, ${year}`}>
        <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 340 200" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          {hex.map((h, i) => (
            <Polygon
              key={i}
              points={h.pts}
              fill={layer ? GR[Math.min(4, Math.floor(h.s / 20))] : heatColor(h.s)}
              fillOpacity={0.62}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth={1}
            />
          ))}
        </Svg>
        {/* Tree dots are geographic, so they keep absolute left/top. */}
        {trees.map(([x, y], i) => (
          <View key={i} pointerEvents="none" style={{ position: 'absolute', left: `${x / 3.4}%`, top: `${y / 2}%`, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: B.lime, borderWidth: 2, borderColor: B.navy }} />
          </View>
        ))}
        {year >= 2024 ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 10, start: 10, height: 28, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,24,46,0.65)' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.lime }} />
            <Txt size={11.5} w={600} color={B.white}>
              {zt.ev}
            </Txt>
          </View>
        ) : null}
      </Photo>
      <CzSlider label={zt.year} min={2006} max={2026} step={1} value={year} onChange={(v) => setYear(Math.round(v))} style={{ flex: 0, alignSelf: 'stretch', marginVertical: -6 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Txt size={11} dim num>
          {f.loc(2006)}
        </Txt>
        <Txt size={11} w={600} lines={1} style={{ flexShrink: 1 }}>
          {zt.planted}
        </Txt>
        <Txt size={11} dim num>
          {f.loc(2026)}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map(([label, val]) => (
          <StatTile key={label} label={label} value={val} />
        ))}
      </View>
      <Note>{cmp}</Note>
      <Txt size={11.5} dim>
        {zt.gt}
      </Txt>
    </Card>
  );
}

/** Drivers · causes: stacked contribution bar + expandable driver rows with a fix. */
function DriversCard() {
  const { c, f } = useCz();
  const t = f.pick(MAP_T);
  const dx = f.pick(DRIVERS_T);
  const [open, setOpen] = useState(0);
  const total = DRV.reduce((a, d) => a + d.ad, 0);

  return (
    <Card style={{ marginHorizontal: 16 }} gap={14}>
      <View style={{ gap: 4 }}>
        <Label>{t.drivers}</Label>
        <Txt size={15} w={600}>
          {t.why}
        </Txt>
      </View>
      <View style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: c.soft }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Txt size={28} w={600} num color={B.red} style={{ letterSpacing: -0.5 }}>
            {f.dC(total)}
          </Txt>
          <Txt size={12} dim style={{ flexShrink: 1 }}>
            {dx.hotterThan}
          </Txt>
        </View>
        <Txt size={11} w={600} dim>
          {dx.addsLbl}
        </Txt>
        <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
          {DRV.map((d) => (
            <View key={d.key} style={{ flex: d.ad, height: '100%', backgroundColor: d.c }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 }}>
          {DRV.map((d) => (
            <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: d.c }} />
              <Txt size={11.5}>
                {t[d.key]}{' '}
                <Txt size={11.5} w={600} num>
                  {f.dC(d.ad)}
                </Txt>
              </Txt>
            </View>
          ))}
        </View>
      </View>

      {DRV.map((d, i) => {
        const on = open === i;
        return (
          <View key={d.key} style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line }}>
            <Tap label={`${t[d.key]} ${d.v}%`} onPress={() => setOpen(on ? -1 : i)} selected={on} style={{ gap: 7, minHeight: 44 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Txt size={13.5} w={600} style={{ flexShrink: 1 }}>
                  {t[d.key]}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={13.5} w={600} num>
                    {f.loc(d.v) + '%'}
                  </Txt>
                  <View style={{ transform: [{ rotate: on ? '180deg' : '0deg' }] }}>
                    <Icon d={I.chevDown} size={16} sw={2} />
                  </View>
                </View>
              </View>
              <Bar pct={d.v} color={d.c} marker={d.av} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={11.5} dim num>
                  {`${dx.cityAvg} ${f.loc(d.av)}%`}
                </Txt>
                <Txt size={11.5} w={600} num>
                  {`${dx.adds} ${f.dC(d.ad)}`}
                </Txt>
              </View>
            </Tap>
            {on ? (
              <View style={{ gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.bg }}>
                <Txt size={12.5} style={{ lineHeight: 19 }}>
                  {dx.why[i]}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon d={I.trend} size={16} sw={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Txt size={11} dim>
                      {dx.fixL} ·{' '}
                      <Txt size={11} w={600} num color={c.leaf}>
                        {f.dC(d.gn, d.gn > -0.2 ? 2 : 1)}
                      </Txt>
                    </Txt>
                    <Txt size={13} w={600}>
                      {dx.fix[i]}
                    </Txt>
                  </View>
                  <PillButton label={dx.addGoal} tone="lime" onPress={() => go('S08')} style={{ minHeight: 36 }} />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <Txt size={11} dim>
        {t.source}
      </Txt>
    </Card>
  );
}
