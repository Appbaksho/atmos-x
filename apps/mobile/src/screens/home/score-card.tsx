/**
 * S04 · Heat Score card: 18-segment semicircle gauge, hour switch, cause chips that expand an
 * explanation and the "+ Green" what-if slider that lowers the score.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card, CzSlider, Divider, PillButton, Seg, Tap, Txt } from '@/components/cz/ui';
import { B, heatColor, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';
import { HOME_T, HX_T } from './i18n';

/** Heat Score for Now / 3 pm peak / Tonight / Tomorrow. */
const TIME_SCORES = [78, 84, 61, 81];
const CAUSE_DOT = [B.red, B.green, B.orange];

export function ScoreCard() {
  const { c, f } = useCz();
  const t = f.pick(HOME_T);
  const x = f.pick(HX_T);
  const [ht, setHt] = useState(0);
  const [wi, setWi] = useState(0);
  const [cause, setCause] = useState(-1);

  const score = Math.max(20, Math.round(TIME_SCORES[ht] - wi * 0.9));
  const cool = wi * 0.12;
  const wiTxt = wi ? x.wi.replace('{t}', f.loc(wi * 8)).replace('{s}', f.loc(score)).replace('{d}', f.dC(-cool)) : x.wi0;

  return (
    <Card style={{ marginHorizontal: 16, marginTop: -4, paddingHorizontal: 18 }} gap={14}>
      <View style={styles.top}>
        <Gauge score={score} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={styles.titleRow}>
            <Txt size={13} w={600}>
              {t.zone} · {t.score}
            </Txt>
            <View style={styles.high}>
              <Txt size={11} w={600} color={B.navy}>
                {t.high}
              </Txt>
            </View>
          </View>
          <Tap role="link" label={t.why} onPress={() => go('S06')} hitSlop={10} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <Txt size={13} w={600} color={c.leaf}>
              {t.why} {f.rtl ? '←' : '→'}
            </Txt>
          </Tap>
        </View>
      </View>

      <Divider />

      <View style={{ gap: 10, marginTop: -4 }}>
        <Seg options={x.times.map((label, i) => ({ label, value: i }))} value={ht} onChange={setHt} height={30} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6 }}>
          {x.causes.map(([label], i) => {
            const on = cause === i;
            return (
              <Tap
                key={label}
                role="button"
                selected={on}
                label={label}
                accessibilityState={{ expanded: on, selected: on }}
                haptic
                hitSlop={8}
                onPress={() => setCause(on ? -1 : i)}
                style={[styles.cause, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.soft : 'transparent' }]}>
                <View style={[styles.dot, { backgroundColor: CAUSE_DOT[i] }]} />
                <Txt size={11.5} w={600}>
                  {label}
                </Txt>
              </Tap>
            );
          })}
        </ScrollView>
        {cause >= 0 ? (
          <Txt size={12} dim style={{ lineHeight: 17 }}>
            {x.causes[cause][1]}
          </Txt>
        ) : null}

        <View style={[styles.whatIf, { backgroundColor: c.limeSoft }]}>
          <View style={styles.wiRow}>
            <Txt size={12} w={600}>
              {x.whatIf}
            </Txt>
            <CzSlider value={wi} onChange={setWi} min={0} max={30} step={1} label={x.whatIfA11y} style={{ minWidth: 0 }} />
            <View style={{ minWidth: 36, alignItems: 'flex-end' }}>
              <Txt size={13} w={700} num>
                {'+' + f.loc(wi) + '%'}
              </Txt>
            </View>
          </View>
          <View style={styles.wiRow}>
            <Txt size={11.5} style={{ flex: 1, lineHeight: 16 }} num>
              {wiTxt}
            </Txt>
            {wi > 0 ? <PillButton label={x.goal} onPress={() => go('S08')} /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

/** 18-segment semicircle (132×74), filled up to the score in heat colours. */
function Gauge({ score }: { score: number }) {
  const { c, f } = useCz();
  const segs = useMemo(() => {
    const N = 18;
    const cx = 66;
    const cy = 70;
    const Ro = 62;
    const Ri = 46;
    const gap = 0.03;
    const p = (a: number, rr: number) => (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1);
    return Array.from({ length: N }, (_, i) => {
      const a0 = Math.PI + (i * Math.PI) / N + gap;
      const a1 = Math.PI + ((i + 1) * Math.PI) / N - gap;
      return { d: 'M' + p(a0, Ro) + 'L' + p(a1, Ro) + 'L' + p(a1, Ri) + 'L' + p(a0, Ri) + 'Z', mid: ((i + 0.5) / N) * 100 };
    });
  }, []);
  return (
    <View style={styles.gauge} accessible accessibilityRole="progressbar" accessibilityLabel="Heat Score" accessibilityValue={{ min: 0, max: 100, now: score }}>
      {/* The gauge reads left→right (cool→hot) in every language */}
      <Svg width={132} height={74} viewBox="0 0 132 74">
        {segs.map((s, i) => (
          <Path key={i} d={s.d} fill={s.mid < score ? heatColor(s.mid) : c.soft} />
        ))}
      </Svg>
      <View style={styles.gaugeNum}>
        <Txt size={26} w={600} num style={{ lineHeight: 28 }}>
          {f.loc(score)}
        </Txt>
        <Txt size={10} dim style={{ lineHeight: 13 }}>
          / {f.loc(100)}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  high: { backgroundColor: B.orange, paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill },
  gauge: { width: 132, height: 74 },
  gaugeNum: { position: 'absolute', start: 0, end: 0, bottom: -2, alignItems: 'center' },
  cause: { height: 30, paddingHorizontal: 10, borderRadius: R.pill, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  whatIf: { gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  wiRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
