/** S11 · Species detail — /species/[id]. Hero, facts, cooling share, flowering calendar, care, price. */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polygon } from 'react-native-svg';

import { Bar, Card, CzButton, GhostButton, GlassPill, I, Icon, IconBtn, Label, LightStatusBar, Photo, Screen, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go, goBack } from '@/lib/cz/routes';
import { NURSERIES } from '@/screens/act/nursery-data';
import { FL_T, PLAN_T } from './copy';
import { speciesDetail, treeName, TREES } from './species-data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Current month in the demo story (October). */
const CUR = 9;
/** Comparison rows in the flowering calendar: [catalog id, months, colour]. */
const BLOOM_POOL: [string, number[], string][] = [
  ['krish', [3, 4, 5], B.orange],
  ['jarul', [3, 4, 5, 6], '#7C9CFF'],
  ['sonalu', [3, 4, 5], B.yellow],
  ['neem', [2, 3, 4], B.lime],
];
const BLOOM_ICON = 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 10c-1-3 0-6 0-6s1 3 0 6zM14 12c3-1 6 0 6 0s-3 1-6 0zM12 14c1 3 0 6 0 6s-1-3 0-6zM10 12c-3 1-6 0-6 0s3-1 6 0z';

export default function SpeciesDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sp = speciesDetail(typeof id === 'string' ? id : 'neem');
  const { c, f, prefs } = useCz();
  const t = f.pick(PLAN_T);
  const X = f.pick(FL_T);
  const insets = useSafeAreaInsets();
  const [added, setAdded] = useState(false);
  const [bloom, setBloom] = useState(false);
  const neem = sp.key === 'neem';
  const { loc } = f;
  const name = sp.name[prefs.lang];

  // Cooling share of the −1.5 °C goal
  const q = sp.planQty || 12;
  const inPlan = sp.planQty || (added ? q : 0);
  const share = inPlan * sp.perTree;
  const shareLabel = neem ? t.yourTwelve : inPlan ? `Your ${loc(inPlan)} ${name}, of the whole goal` : 'Not in your plan yet';
  const addLabel = neem ? (added ? t.added : t.add) : added ? `Added · ${loc(q)} ${name}` : `Add ${loc(q)} to plan`;

  // Flowering calendar
  const nextBloom = sp.bloom.length ? sp.bloom.find((m) => m > CUR) ?? sp.bloom[0] : -1;
  const nowLine = neem ? X.now : sp.bloom.includes(CUR) ? 'In flower now' : 'Not in flower now · next in ' + MONTHS[nextBloom];
  const others = BLOOM_POOL.filter(([k]) => k !== sp.key).slice(0, 3);

  const nurseries = NURSERIES.filter((n) => n.stock.includes(sp.stock)).slice(0, 2);

  return (
    <Screen bleed>
      <LightStatusBar />
      <Photo src={sp.img} label={name} scrim={[[0, 0.5], [0.32, 0], [1, 0.88]]} style={{ height: 360 }}>
        <IconBtn d={f.backPath} label="Back" tone="glass" onPress={goBack} style={{ position: 'absolute', top: insets.top + 12, start: 16 }} />
        <View pointerEvents="none" style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 10 }}>
          <View style={{ gap: 4 }}>
            <Txt display size={26} color={B.white} style={{ lineHeight: 30 }} accessibilityRole="header">
              {name}
            </Txt>
            <Txt size={15} color="rgba(255,255,255,0.92)" style={{ fontStyle: 'italic' }}>
              {sp.sci}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {sp.localNames.map(([n, lang]) => (
              <GlassPill key={lang} style={{ minHeight: 30 }}>
                <Txt size={12} w={600} color={B.white}>
                  {n}
                </Txt>
                <Txt size={12} color="rgba(255,255,255,0.8)">
                  {lang}
                </Txt>
              </GlassPill>
            ))}
          </View>
        </View>
      </Photo>

      <View style={{ marginHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {sp.facts.map(([label, val, sub]) => (
          <View key={label} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0, backgroundColor: c.card, borderRadius: R.lg, padding: 14, gap: 2 }}>
            <Txt size={11.5} dim>
              {label}
            </Txt>
            <Txt size={17} w={600} num>
              {loc(val)}
            </Txt>
            {sub ? (
              <Txt size={11.5} dim>
                {loc(sub)}
              </Txt>
            ) : null}
          </View>
        ))}
      </View>

      <Card style={{ marginHorizontal: 16 }}>
        <Label>{t.cooling}</Label>
        <View style={{ gap: 2 }}>
          <Txt size={30} w={700} num color={c.leaf} lines={1} style={{ lineHeight: 34, letterSpacing: -0.6 }}>
            {f.dC(-sp.perTree, 3)}
          </Txt>
          <Txt size={12.5} dim>
            {t.perTree}
          </Txt>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Txt size={12.5} style={{ flexShrink: 1 }}>
              {shareLabel}
            </Txt>
            <Txt size={12.5} w={600} num>
              {share ? f.dC(-share) : '—'}
            </Txt>
          </View>
          <Bar pct={(share / 1.5) * 100} color={B.lime} />
        </View>
        <Txt size={11} dim>
          {t.coolSrc}
        </Txt>
      </Card>

      {sp.bloom.length ? (
        <Card style={{ marginHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Label>{X.title}</Label>
            <Txt size={11.5} dim style={{ flexShrink: 1 }}>
              {nowLine}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {X.mon.map((label, i) => {
              const cur = i === CUR;
              return (
                <View key={i} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${MONTHS[i]}${sp.bloom.includes(i) ? ', flowering' : ''}${cur ? ', now' : ''}`}>
                  <View style={{ width: '100%', height: 28, borderRadius: 7, backgroundColor: sp.bloom.includes(i) ? B.lime : c.soft, borderWidth: cur ? 2 : 0, borderColor: c.ink }} />
                  <Txt size={9.5} w={cur ? 700 : 500} color={cur ? c.ink : c.ink2} lines={1}>
                    {label}
                  </Txt>
                </View>
              );
            })}
          </View>
          <View style={{ gap: 7 }}>
            {others.map(([k, ms, col]) => {
              const row = TREES.find((r) => r[0] === k);
              return (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={12} w={600} lines={1} style={{ width: 92 }}>
                    {row ? treeName(row, prefs.lang) : k}
                  </Txt>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
                    {MONTHS.map((_, i) => (
                      <View key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: ms.includes(i) ? col : c.soft }} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          <Tap
            label={bloom ? X.bDone : X.bTitle}
            onPress={() => {
              if (!bloom) {
                setBloom(true);
                go('S14');
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, backgroundColor: bloom ? c.limeSoft : c.soft }}>
            <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={42} height={42} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
                <Polygon points="50,0 93,25 93,75 50,100 7,75 7,25" fill={B.lime} />
              </Svg>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d={bloom ? I.check : BLOOM_ICON} stroke={B.limeInk} strokeWidth={bloom ? 2.6 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={13.5} w={600}>
                {bloom ? X.bDone : X.bTitle}
              </Txt>
              <Txt size={11.5} dim>
                {bloom ? X.bDoneSub : X.bSub}
              </Txt>
            </View>
          </Tap>
        </Card>
      ) : null}

      <Card style={{ marginHorizontal: 16 }}>
        <Label>{t.care}</Label>
        {sp.care.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Icon d={I.check} size={12} sw={3} />
            </View>
            <Txt size={13.5} style={{ flex: 1 }}>
              {loc(line)}
            </Txt>
          </View>
        ))}
      </Card>

      <Card style={{ marginHorizontal: 16 }} gap={10}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>{t.price}</Label>
          <Txt size={15} w={600} num>
            {f.tk(sp.price[0]) + (sp.price[1] !== sp.price[0] ? '–' + loc(sp.price[1]) : '')}
          </Txt>
        </View>
        {nurseries.map((n) => (
          <Tap key={n.name} role="link" label={n.name} onPress={() => go('S12')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={600}>
                {n.name}
              </Txt>
              <Txt size={12} dim>
                {loc(n.dist + ' km · ' + n.meta)}
              </Txt>
            </View>
            <Icon d={f.fwdPath} size={16} sw={2} />
          </Tap>
        ))}
      </Card>

      <View style={{ marginHorizontal: 16, gap: 10 }}>
        <CzButton label={addLabel} icon={added ? 'check' : 'plus'} onPress={() => setAdded(!added)} />
        <GhostButton label={t.findN} onPress={() => go('S12')} />
      </View>
    </Screen>
  );
}
