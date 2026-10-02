/** S09 · Feasibility — verdict, planting map, solo/team/org verdicts and milestones. */
import { Platform, View } from 'react-native';

import { Bar, Card, CzButton, GhostButton, Label, Screen, ScreenHeader, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { SPECIES_NAMES } from '@/lib/cz/demo';
import { go } from '@/lib/cz/routes';
import { PLAN_T } from './copy';
import { autofill, GD, goalLine, setPlan, SPS, T4, TL, usePlan } from './plan-store';
import { PlantingMap } from './planting-map';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function Feasibility() {
  const { c, f, prefs } = useCz();
  const t = f.pick(PLAN_T);
  const plan = usePlan();
  const names = SPECIES_NAMES[prefs.lang];
  const { loc } = f;

  const tgt = T4[plan.tgt];
  const yrs = TL[plan.tl];
  const goalDate = loc(GD[plan.tl]);
  const actionGoal = yrs < 0.5;

  // Work rate (°C per year) drives every verdict.
  const k = Math.abs(tgt) / yrs;
  const n = Math.max(3, Math.round(k * 4));
  const vd = (th: number): [string, string] =>
    k <= th * 0.5 ? [t.vC, B.green] : k <= th ? [t.vD, B.lime] : k <= th * 1.5 ? [t.vS, B.orange] : [t.vN, B.red];
  const soloH = Math.max(1, Math.round(k * 9));
  const each = Math.max(1, Math.round(soloH / n));
  const rows: [string, [string, string], string][] = [
    [t.solo, vd(0.3), '≈ ' + loc(soloH) + ' h a week, every week'],
    [t.team + ' · ' + loc(n) + '–' + loc(n + 2), vd(1.6), '≈ ' + loc(each) + ' h a week each'],
    [t.org, vd(4), loc('1 workday a month per team')],
  ];
  const okSolo = k <= 0.3;
  const okTeam = k <= 1.6;
  const okOrg = k <= 4;
  const head = actionGoal
    ? 'This becomes an action goal.'
    : okSolo
      ? 'Doable on your own.'
      : okTeam
        ? 'Doable with a team of ' + loc(n) + '–' + loc(n + 2) + '.'
        : okOrg
          ? 'Needs an organization behind it.'
          : 'Too much for this timeline.';
  const sub = actionGoal
    ? 'Coat 2 hostel roofs (' + loc('1,200') + ' m²) by ' + goalDate + '. We verify the work by photo, then measure cooling next summer.'
    : okSolo
      ? 'A few hours a week covers it. A team makes it faster.'
      : okTeam
        ? 'Not realistic solo. Comfortable for an organization like DU Green Society.'
        : okOrg
          ? 'Too heavy for one team — split it across teams in an organization.'
          : 'Try a smaller target or a longer timeline.';
  const pct = actionGoal ? 90 : Math.max(30, Math.min(88, Math.round(80 - k * 8)));
  const conf = (pct >= 75 ? 'High' : pct >= 55 ? 'Medium' : 'Low') + ' · ' + loc(pct) + '%';
  const MS: [string, string][] = actionGoal
    ? [
        ['5 Oct 2026', 'Coat roof 1 · 600 m²'],
        ['19 Oct 2026', 'Coat roof 2 · 600 m²'],
        [GD[plan.tl], 'Goal date · work verified by photo'],
      ]
    : [
        ['5 Oct 2026', 'Coat 2 hostel roofs · 1,200 m²'],
        ['Nov 2026', 'Plant 24 street trees'],
        ['Apr 2027', 'First satellite check · Landsat LST'],
        ['Jun 2027', 'Climbers on 3 sunny walls'],
        [GD[plan.tl], 'Goal date · confirmed with summer LST'],
      ];

  // Planting map stats
  const cool = plan.trees.reduce((a, p) => a + SPS[p.sp].cool, 0);
  const shade = plan.trees.reduce((a, p) => a + SPS[p.sp].shade, 0);
  const stats: [string, string][] = [
    [t.placed, loc(plan.trees.length)],
    [t.coolL, cool ? f.dC(-cool, 2) : '—'],
    [t.shadeL, loc(shade) + ' m²'],
  ];

  return (
    <Screen>
      <ScreenHeader title={t.feasTitle} sub={goalLine(f, plan)} />

      <Card tone="navy" pad={20} gap={14} style={{ borderRadius: R.xxl }}>
        <Label color={B.lime}>{t.verdict}</Label>
        <Txt display size={21} color={B.white} style={{ lineHeight: 27 }}>
          {head}
        </Txt>
        <Txt size={13} color="rgba(255,255,255,0.85)">
          {sub}
        </Txt>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={12} color="rgba(255,255,255,0.85)">
              {t.confidence}
            </Txt>
            <Txt size={12} w={600} num color={B.white}>
              {conf}
            </Txt>
          </View>
          <Bar pct={pct} color={B.lime} track="rgba(255,255,255,0.14)" />
        </View>
      </Card>

      <Card pad={12}>
        <View style={{ gap: 3, paddingHorizontal: 4, paddingTop: 4 }}>
          <Txt display size={14}>
            {t.plantMap}
          </Txt>
          <Txt size={12} dim>
            {t.plantHint}
          </Txt>
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}>
          {SPS.map((s, i) => {
            const on = plan.sp === i;
            return (
              <Tap
                key={s.key}
                role="radio"
                selected={on}
                haptic
                label={names[s.key]}
                onPress={() => setPlan({ sp: i })}
                style={{ height: 36, paddingStart: 10, paddingEnd: 12, borderRadius: R.pill, backgroundColor: on ? B.navy : c.soft, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.c, borderWidth: 2, borderColor: 'rgba(0,24,46,0.35)' }} />
                <Txt size={12.5} w={600} color={on ? B.white : c.ink}>
                  {names[s.key]}
                </Txt>
              </Tap>
            );
          })}
        </View>
        <PlantingMap editable height={300} legend={{ spot: t.spot, zoneEdge: t.zoneEdge }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {stats.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: c.soft, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
              <Txt size={11} dim lines={1}>
                {label}
              </Txt>
              <Txt size={16} w={600} num lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Tap label={t.autofill} haptic onPress={autofill} style={{ flex: 1, height: 44, borderRadius: R.pill, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={13} w={600} color={B.white} lines={1}>
              {t.autofill}
            </Txt>
          </Tap>
          <GhostButton label={t.clear} height={44} onPress={() => setPlan({ trees: [] })} style={{ paddingHorizontal: 18 }} />
        </View>
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        {rows.map(([who, [v, col], note], i) => (
          <View key={who} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: c.line }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: col }} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={14} w={600}>
                {who}
              </Txt>
              <Txt size={12} dim>
                {note}
              </Txt>
            </View>
            <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: c.soft }}>
              <Txt size={12} w={600} lines={1}>
                {v}
              </Txt>
            </View>
          </View>
        ))}
      </Card>

      <Card gap={4}>
        <Label style={{ paddingBottom: 8 }}>{t.milestones}</Label>
        {MS.map(([when, what], i) => (
          <View key={when + what} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 3, backgroundColor: i === 0 ? B.lime : c.card, borderWidth: 2, borderColor: i === 0 ? B.lime : c.ink2 }} />
              <View style={{ flex: 1, width: 2, backgroundColor: c.line, opacity: i < MS.length - 1 ? 1 : 0 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingBottom: 14 }}>
              <Txt size={11} w={600} dim style={prefs.lang === 'en' ? { fontFamily: MONO } : undefined}>
                {loc(when)}
              </Txt>
              <Txt size={13.5} w={i === 0 ? 600 : 400}>
                {what}
              </Txt>
            </View>
          </View>
        ))}
      </Card>

      <View style={{ gap: 10 }}>
        <CzButton label={t.seePlan} icon="arrow" onPress={() => go('S10')} />
        <GhostButton label={t.startTeam} onPress={() => go('S19')} />
      </View>
    </Screen>
  );
}
