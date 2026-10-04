/** S13 · Budget — mix selector, navy total, itemised costs and the per-member split. */
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Card, CzButton, Icon, I, Label, Screen, ScreenHeader, Seg, Txt } from '@/components/cz/ui';
import { AVATARS, B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';

const T = {
  en: {
    budTitle: 'Budget', mixes: ['Cheapest', 'Balanced', 'Fastest'], total: 'Estimated total', perMember: 'Per member', perDeg: 'Per °C', firstEffect: 'First effect',
    outcome: 'Expected', byGoal: 'by Oct 2027', split: 'Split · 6 members', logAct: 'Log an action',
  },
  bn: { budTitle: 'বাজেট', mixes: ['সবচেয়ে সস্তা', 'ভারসাম্য', 'দ্রুততম'], total: 'আনুমানিক মোট', logAct: 'কাজ লগ করুন' },
  ur: { budTitle: 'بجٹ', mixes: ['سب سے سستا', 'متوازن', 'تیز ترین'], total: 'تخمینی کل', logAct: 'کام لاگ کریں' },
};

type Mix = { items: [string, string, number][]; lo: number; hi: number; first: string };
const MIX: Mix[] = [
  {
    items: [['Roof lime-wash', '1,200 m²', 6000], ['Neem saplings', '24 × ৳ 200', 4800], ['Bamboo tree guards', '24', 3600], ['Wall climbers', '30 plants', 3000], ['Watering', '12 months', 6000], ['Tools', 'shared kit', 2000]],
    lo: 1.0,
    hi: 1.3,
    first: '1 week',
  },
  {
    items: [
      ['Cool-roof coating', '1,200 m²', 14400], ['Neem saplings', '12 × ৳ 200', 2400], ['Krishnachura saplings', '12 × ৳ 250', 3000], ['Tree guards', '24 × ৳ 300', 7200],
      ['Wall climbers', '30 plants', 3000], ['Shade sails', '2 sails', 9000], ['Watering', '12 months', 6000], ['Tools & transport', '', 3000],
    ],
    lo: 1.3,
    hi: 1.7,
    first: '1 week',
  },
  {
    items: [['Cool-roof coating', '2,400 m²', 28800], ['Shade sails', '4 sails', 18000], ['Neem, 2 m saplings', '12 × ৳ 500', 6000], ['Steel tree guards', '12 × ৳ 400', 4800], ['Watering', '12 months', 6000], ['Tools & transport', '', 4000]],
    lo: 1.5,
    hi: 1.9,
    first: '3 days',
  },
];

/** Hall Rooftop Crew members (initials, colour pair). */
const MEMBERS: [string, number][] = [['NR', 0], ['RA', 1], ['TS', 2], ['IH', 3], ['MK', 4], ['SB', 5]];

export default function Budget() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const [mix, setMix] = useState(1);
  const F = f.unit === 'F';
  const M = MIX[mix];
  const total = M.items.reduce((a, i) => a + i[2], 0);
  const mid = (M.lo + M.hi) / 2;
  const perDeg = f.tk(Math.round(total / mid / (F ? 1.8 : 1) / 100) * 100);
  const range = f.dC(-M.lo) + ' to ' + f.loc((F ? M.hi * 1.8 : M.hi).toFixed(1));
  const eachShort = f.loc(Math.round(total / 600) / 10) + 'k';

  return (
    <Screen>
      <ScreenHeader title={t.budTitle} sub={f.dC(-1.5) + ' plan · ' + f.loc(6) + ' members'} />

      <Seg tone="card" height={40} options={t.mixes.map((label, i) => ({ label, value: i }))} value={mix} onChange={setMix} />

      <Card tone="navy" pad={20} gap={16} style={{ borderRadius: R.xxl }}>
        <View style={{ gap: 4 }}>
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {t.total}
          </Txt>
          <Txt size={44} num color={B.white} lines={1} style={{ lineHeight: 48, letterSpacing: -0.9 }} accessibilityRole="header">
            {f.tk(total)}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              [t.perMember, f.tk(total / 6)],
              [t.perDeg, perDeg],
              [t.firstEffect, f.loc(M.first)],
            ] as [string, string][]
          ).map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={11} color="rgba(255,255,255,0.75)" lines={1}>
                {label}
              </Txt>
              <Txt size={15} w={600} num color={B.white} lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.md, backgroundColor: 'rgba(172,236,0,0.14)' }}>
          <Icon d={I.trend} size={18} color={B.lime} sw={2} />
          <Txt size={13} color={B.white} style={{ flex: 1 }}>
            {t.outcome + ' '}
            <Txt size={13} w={600} color={B.lime}>
              {range}
            </Txt>
            {' ' + f.loc(t.byGoal)}
          </Txt>
        </View>
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        {M.items.map(([name, qty, cost], i) => (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: i < M.items.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={500}>
                {name}
              </Txt>
              {qty ? (
                <Txt size={11.5} dim>
                  {f.loc(qty)}
                </Txt>
              ) : null}
            </View>
            <Txt size={13.5} w={600} num lines={1}>
              {f.tk(cost)}
            </Txt>
          </View>
        ))}
      </Card>

      <Card>
        <Label>{f.loc(t.split)}</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {MEMBERS.map(([ini, k]) => (
            <View key={ini} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${ini}: ${eachShort}`}>
              <Avatar ini={ini} bg={AVATARS[k][0]} fg={AVATARS[k][1]} size={40} />
              <Txt size={10.5} dim num lines={1}>
                {eachShort}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      <CzButton label={t.logAct} icon="camera" onPress={() => go('S14')} />
    </Screen>
  );
}
