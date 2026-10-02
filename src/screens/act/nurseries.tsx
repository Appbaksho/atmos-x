/** S12 · Nurseries — map with numbered pins, filters, nursery cards with directions. */
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { FilterChip, I, IconBtn, Photo, Screen, ScreenHeader, Tag, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO, SPECIES_NAMES, type SpeciesKey } from '@/lib/cz/demo';
import { mapsUrl, NURSERIES } from './nursery-data';

const T = {
  en: {
    nurTitle: 'Nurseries', nurSub: 'Stocking your plan’s species · within 3 km', filters: ['Stocks Neem', 'Open now', 'Under 2 km'],
    nurNote: 'Location only — Atmos X doesn’t sell plants. Nurseries and stock are curated by admins, last checked 28 Sep. Directions open your maps app.',
    directions: 'Directions to',
  },
  bn: { nurTitle: 'নার্সারি' },
  ur: { nurTitle: 'نرسریاں' },
};

/** Stock names → species keys for localised tags. */
const STOCK_KEY: Record<string, SpeciesKey> = { Neem: 'neem', Krishnachura: 'krish', Arjun: 'arjun' };
const STOCK_EXTRA: Record<string, Record<'en' | 'bn' | 'ur', string>> = { Madhabilata: { en: 'Madhabilata', bn: 'মাধবীলতা', ur: 'مادھوی لتا' } };

/** Map card proportions from the prototype (370 × 290). */
const MAP_W = 370;
const MAP_H = 290;

export default function Nurseries() {
  const { c, f, prefs } = useCz();
  const t = f.pick(T);
  const [pick, setPick] = useState(0);
  const [filt, setFilt] = useState([true, false, false]);

  const list = NURSERIES.filter((n) => !(filt[0] && !n.stock.includes('Neem')) && !(filt[1] && n.closing) && !(filt[2] && n.dist > 2));
  const stockName = (s: string) => (STOCK_KEY[s] ? SPECIES_NAMES[prefs.lang][STOCK_KEY[s]] : STOCK_EXTRA[s]?.[prefs.lang] ?? s);
  const toggle = (i: number) => {
    const a = filt.slice();
    a[i] = !a[i];
    setFilt(a);
    setPick(0);
  };

  return (
    <Screen>
      <ScreenHeader title={t.nurTitle} sub={f.loc(t.nurSub)} />

      <View style={{ aspectRatio: MAP_W / MAP_H, borderRadius: R.xl, overflow: 'hidden', backgroundColor: B.photoBg, direction: 'ltr' }}>
        <Photo src={PHOTO.basemap(800, 640)} style={StyleSheet.absoluteFill} label="Street map around Asad Gate block" />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,16,32,0.25)' }]} />
        <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={StyleSheet.absoluteFill}>
          <Circle cx={185} cy={150} r={120} fill="rgba(1,63,246,0.08)" stroke={B.lime} strokeWidth={2} strokeDasharray="6 6" />
          <Circle cx={185} cy={150} r={7} fill={B.blue} stroke={B.white} strokeWidth={3} />
        </Svg>
        {list.map((n, i) => {
          const sel = pick === i;
          return (
            // 160pt-wide anchor centred on the pin point; the pin's stem tip sits exactly on (x, y).
            <View
              key={n.name}
              pointerEvents="box-none"
              style={{ position: 'absolute', start: `${n.x}%`, top: `${n.y}%`, width: 160, height: 44, marginStart: -80, marginTop: -44, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Tap label={`${f.loc(i + 1)}. ${n.name}, ${f.loc(n.dist)} km`} selected={sel} haptic onPress={() => setPick(i)} hitSlop={8} style={{ alignItems: 'center' }}>
                <View
                  style={{ height: 32, minWidth: 32, paddingHorizontal: 10, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: sel ? B.lime : B.navy, shadowColor: '#001020', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
                  <Txt size={12} w={700} num color={sel ? B.limeInk : B.white}>
                    {f.loc(i + 1)}
                  </Txt>
                  {sel ? (
                    <Txt size={12} w={600} num color={B.limeInk} lines={1}>
                      {f.loc(n.dist) + ' km'}
                    </Txt>
                  ) : null}
                </View>
                <View style={{ width: 2, height: 8, backgroundColor: sel ? B.lime : B.navy }} />
              </Tap>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {t.filters.map((label, i) => (
          <FilterChip key={label} label={label} active={filt[i]} onPress={() => toggle(i)} />
        ))}
      </View>

      {list.map((n, i) => {
        const sel = pick === i;
        return (
          <Tap
            key={n.name}
            label={n.name}
            selected={sel}
            onPress={() => setPick(i)}
            style={{ backgroundColor: c.card, borderRadius: 22, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: sel ? B.lime : 'transparent' }}>
            <Photo src={n.img} label={n.name} style={{ width: 72, height: 72, borderRadius: R.md, backgroundColor: B.photoBg2 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt size={14} w={600}>
                {f.loc(i + 1) + '. ' + n.name}
              </Txt>
              <Txt size={12} dim>
                {f.loc(n.dist) + ' km · ' + f.loc(n.hours)}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {n.stock.map((k) => (
                  <Tag key={k} label={stockName(k)} bg={c.limeSoft} size="xs" />
                ))}
              </View>
            </View>
            <IconBtn d={I.directions} tone="navy" label={`${t.directions} ${n.name}`} onPress={() => Linking.openURL(mapsUrl(n.name)).catch(() => {})} />
          </Tap>
        );
      })}

      <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
        {f.loc(t.nurNote)}
      </Txt>
    </Screen>
  );
}
