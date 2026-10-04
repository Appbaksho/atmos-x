/** S20T · My tree — photo hero, stats, guided survival photo → AI health check, photo history. */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bar, Card, CzButton, GhostButton, Icon, LightStatusBar, Photo, Screen, ScreenHeader, Tag, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { DEMO_TODAY, PHOTO, type MyTree, type SpeciesKey } from '@/lib/cz/demo';
import { goBack } from '@/lib/cz/routes';

import { addDays, daysBetween, fmtD, mtCopy, TODAY_ISO, treeName, treeStatus } from './trees-common';

const TPX = {
  en: {
    age: 'Age', days: 'days', height: 'Height', photos: 'Photos', next: 'Next check', dayN: 'Day {n}', nextT: 'Photo needed · Day {n} check', what: 'Capture these 3 shots',
    s1: 'Whole tree from 2 steps back', s1s: 'Guard and ground in frame', s2: 'Close-up of the newest leaves', s2s: '20–30 cm away, in daylight', s3: 'Soil at the base', s3s: 'Shows watering and mulch',
    take: 'Take guided photo', busy: 'AI is checking leaves, height and stress…', busySub: 'Comparing with {name}’s last photo', aiT: 'AI health check', healthy: 'Healthy', watch: 'Keep an eye on it',
    conf: '{n}% confident', fLeaf: 'Leaf colour', fLeafV: 'Deep green, no yellowing', fNew: 'New growth', fNewV: '{n} new leaves since last photo', fH: 'Height', fStress: 'Heat stress',
    fStressOk: 'No wilting or scorch', fStressBad: 'Slight curl on the top shoots', fPest: 'Pests', fPestOk: 'None seen', fPestBad: 'Chewed leaf edges — likely caterpillars', forName: 'What {name} needs',
    aWater: 'Sunday hits 36° — give {name} 10 L of water on Saturday evening.', aMulch: 'Add a 30 cm mulch ring to keep the roots cool.', aPest: 'Pick caterpillars off by hand; use neem oil only if it spreads.',
    aNext: 'Next photo on {d} — same spot, same angle.', aLate: 'This photo was late — points were paused and are now back.', pts: '+40 pts · survival check passed', again: 'Retake',
    hist: 'Photo history', hPlant: 'Planted & registered', hDay: 'Day {n} check', back: 'My trees',
  },
  bn: {
    age: 'বয়স', days: 'দিন', height: 'উচ্চতা', photos: 'ছবি', next: 'পরের চেক', dayN: '{n}তম দিন', nextT: 'ছবি দরকার · {n}তম দিনের চেক', what: 'এই ৩টি ছবি তুলুন',
    s1: 'দুই পা পিছিয়ে পুরো গাছ', s1s: 'গার্ড ও মাটি ফ্রেমে রাখুন', s2: 'নতুন পাতার কাছ থেকে ছবি', s2s: '২০–৩০ সেমি দূর থেকে, দিনের আলোয়', s3: 'গোড়ার মাটি', s3s: 'পানি ও মালচ দেখা যাবে',
    take: 'নির্দেশিত ছবি তুলুন', busy: 'AI পাতা, উচ্চতা ও চাপ দেখছে…', busySub: '{name}-এর আগের ছবির সাথে মিলিয়ে দেখছে', aiT: 'AI স্বাস্থ্য পরীক্ষা', healthy: 'সুস্থ', watch: 'নজর রাখুন',
    conf: '{n}% নিশ্চিত', fLeaf: 'পাতার রং', fLeafV: 'গাঢ় সবুজ, হলুদ নেই', fNew: 'নতুন বৃদ্ধি', fNewV: 'আগের ছবির পর {n}টি নতুন পাতা', fH: 'উচ্চতা', fStress: 'তাপের চাপ',
    fStressOk: 'নেতিয়ে পড়া বা পোড়া নেই', fStressBad: 'ওপরের ডগায় সামান্য পাতা কোঁকড়ানো', fPest: 'পোকা', fPestOk: 'দেখা যায়নি', fPestBad: 'পাতার কিনারা খাওয়া — সম্ভবত শুঁয়োপোকা', forName: '{name}-এর যা দরকার',
    aWater: 'রবিবার ৩৬° হবে — শনিবার সন্ধ্যায় {name}-কে ১০ লিটার পানি দিন।', aMulch: 'শিকড় ঠান্ডা রাখতে গোড়ায় ৩০ সেমি মালচ দিন।', aPest: 'শুঁয়োপোকা হাতে তুলে ফেলুন; বাড়লে তবেই নিম তেল দিন।',
    aNext: 'পরের ছবি {d} — একই জায়গা, একই কোণ।', aLate: 'ছবিটা দেরিতে এসেছে — পয়েন্ট বন্ধ ছিল, এখন আবার চালু।', pts: '+৪০ পয়েন্ট · টিকে থাকার চেক পাস', again: 'আবার তুলুন',
    hist: 'ছবির ইতিহাস', hPlant: 'লাগানো ও নিবন্ধিত', hDay: '{n}তম দিনের চেক', back: 'আমার গাছ',
  },
  // Urdu: the prototype has no dictionary here — English fallback (except the back label, which reuses MT.title).
};

/** Scientific name + growth (cm per 15 days). */
const SI: Record<SpeciesKey, [string, number]> = {
  neem: ['Azadirachta indica', 6],
  krish: ['Delonix regia', 9],
  jarul: ['Lagerstroemia speciosa', 7],
  arjun: ['Terminalia arjuna', 6],
  bokul: ['Mimusops elengi', 4],
  aam: ['Mangifera indica', 5],
};

/** Guided-shot icons: whole tree, leaf close-up, soil at the base. */
const SH = ['M12 21v-5M12 3l6 9h-3l4 4H5l4-4H6z', 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7', 'M4 20h16M7 20c0-3 2-5 5-5s5 2 5 5M12 15V9'];

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

type Phase = 'idle' | 'busy' | 'done';

export default function TreeDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c, f, prefs, setPref } = useCz();
  const insets = useSafeAreaInsets();
  const loc = f.loc;
  const X = mtCopy(prefs.lang);
  const Y = { ...f.pick(TPX), ...(prefs.lang === 'ur' ? { back: X.title } : {}) };

  const TR = prefs.trees ?? [];
  const r: MyTree | undefined = TR.find((t) => t.id === id) ?? TR[0];

  const [phase, setPhase] = useState<Phase>('idle');
  const [late, setLate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treesRef = useRef(TR);
  useEffect(() => {
    treesRef.current = prefs.trees ?? [];
  }, [prefs.trees]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!r) {
    return (
      <Screen>
        <ScreenHeader title={X.title} />
      </Screen>
    );
  }

  const si = SI[r.sp] ?? ['', 5];
  const nm = treeName(r, X);
  const s = treeStatus(r, X, loc, c);
  const age = Math.max(0, Math.round((DEMO_TODAY.getTime() - new Date(r.d + 'T00:00:00').getTime()) / 864e5));
  const nPh = Math.max(1, Math.floor(daysBetween(r.d, r.ph) / 15) + 1);
  const nextDay = nPh * 15;
  const h = (1 + (si[1] * age) / 15 / 100).toFixed(2);
  const overdue = s.overdue || late;
  const score = 88 - (overdue ? 6 : 0) - (r.sp === 'krish' ? 5 : 0) - (r.sp === 'jarul' ? 3 : 0);

  const stats = [
    [Y.age, loc(age) + ' ' + Y.days],
    [Y.height, '≈ ' + loc(h) + ' m'],
    [Y.photos, loc(nPh)],
    [Y.next, Y.dayN.replace('{n}', loc(nextDay))],
  ];
  const shots = [
    [Y.s1, Y.s1s],
    [Y.s2, Y.s2s],
    [Y.s3, Y.s3s],
  ];
  const finds: [string, string, boolean][] = [
    [Y.fLeaf, Y.fLeafV, true],
    [Y.fNew, Y.fNewV.replace('{n}', loc(r.sp === 'bokul' ? 2 : 4)), true],
    [Y.fH, '≈ ' + loc(h) + ' m · +' + loc(si[1]) + ' cm', true],
    [Y.fStress, r.sp === 'krish' ? Y.fStressBad : Y.fStressOk, r.sp !== 'krish'],
    [Y.fPest, r.sp === 'jarul' ? Y.fPestBad : Y.fPestOk, r.sp !== 'jarul'],
  ];
  const adv = [Y.aWater.replace('{name}', nm)];
  if (r.sp === 'krish') adv.push(Y.aMulch);
  if (r.sp === 'jarul') adv.push(Y.aPest);
  if (late) adv.push(Y.aLate);
  adv.push(Y.aNext.replace('{d}', fmtD(addDays(r.ph, 15), loc)));

  const hist: { label: string; date: string }[] = [];
  for (let k = 0; k < nPh; k++) {
    hist.push({ label: k === 0 ? Y.hPlant : Y.hDay.replace('{n}', loc(k * 15)), date: fmtD(k === nPh - 1 && nPh > 1 ? r.ph : addDays(r.d, k * 15), loc) });
  }

  const shoot = () => {
    setLate(s.overdue);
    setPhase('busy');
    if (timer.current) clearTimeout(timer.current);
    const treeId = r.id;
    timer.current = setTimeout(() => {
      setPhase('done');
      setPref(
        'trees',
        treesRef.current.map((x) => (x.id === treeId ? { ...x, ph: TODAY_ISO } : x)),
      );
    }, 1800);
  };
  const again = () => {
    setPhase('idle');
    setLate(false);
  };

  return (
    <Screen bleed>
      <LightStatusBar />
      {/* Hero */}
      <Photo src={PHOTO.sapling(900, 760)} label={'Photo of ' + nm} scrim={[[0, 0.5], [0.32, 0], [1, 0.88]]} style={{ height: 284 + insets.top }}>
        <Tap
          label={Y.back}
          haptic
          onPress={goBack}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            start: 16,
            height: 44,
            paddingStart: 12,
            paddingEnd: 16,
            borderRadius: R.pill,
            borderWidth: 1,
            borderColor: B.glassLine,
            backgroundColor: B.glass,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
          <Icon d={f.backPath} size={18} sw={2} color={B.white} />
          <Txt size={13} w={600} color={B.white}>
            {Y.back}
          </Txt>
        </Tap>
        <View pointerEvents="none" style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 8 }}>
          <Tag label={s.label} bg={s.bg} fg={s.fg} />
          <Txt display size={28} color={B.white} accessibilityRole="header" style={{ lineHeight: 32 }}>
            {nm}
          </Txt>
          <Txt size={13} color="rgba(255,255,255,0.92)">
            {(X.sp[r.sp] || r.sp) + ' · ' + si[0]}
          </Txt>
          <Txt size={11.5} w={600} color="rgba(255,255,255,0.85)" style={{ fontFamily: MONO }}>
            {r.id}
          </Txt>
        </View>
      </Photo>

      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {stats.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 8, gap: 2 }}>
              <Txt size={10.5} dim lines={1}>
                {label}
              </Txt>
              <Txt size={14} w={600} num lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>

        {phase === 'idle' ? (
          <Card style={s.urgent ? { borderWidth: 2, borderColor: s.bg } : undefined}>
            <View style={{ gap: 3 }}>
              <Txt label>{Y.nextT.replace('{n}', loc(nextDay)) + ' · ' + s.label}</Txt>
              <Txt size={15} w={600}>
                {Y.what}
              </Txt>
            </View>
            {shots.map(([title, sub], k) => (
              <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={SH[k]} size={20} sw={1.7} />
                  <View style={{ position: 'absolute', top: -4, end: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={10} w={700} color={B.lime} style={{ lineHeight: 13 }}>
                      {loc(k + 1)}
                    </Txt>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Txt size={13.5} w={600}>
                    {title}
                  </Txt>
                  <Txt size={11.5} dim>
                    {sub}
                  </Txt>
                </View>
              </View>
            ))}
            <CzButton label={Y.take} icon="camera" onPress={shoot} />
          </Card>
        ) : null}

        {phase === 'busy' ? (
          <View accessibilityLiveRegion="polite" style={{ backgroundColor: B.navy, borderRadius: R.xl, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <ActivityIndicator size="large" color={B.lime} style={{ width: 44, height: 44 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt size={14} w={600} color={B.white}>
                {Y.busy}
              </Txt>
              <Txt size={12} color="rgba(255,255,255,0.75)">
                {Y.busySub.replace('{name}', nm)}
              </Txt>
            </View>
          </View>
        ) : null}

        {phase === 'done' ? (
          <Card gap={14}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={9} w={700} color={B.lime} style={{ lineHeight: 12 }}>
                    AI
                  </Txt>
                </View>
                <Txt label>{Y.aiT}</Txt>
              </View>
              <Txt size={11.5} dim>
                {Y.conf.replace('{n}', loc(92))}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Txt size={44} w={600} num style={{ lineHeight: 48, letterSpacing: -0.9 }}>
                {loc(score)}
              </Txt>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Txt size={15} w={600}>
                  {score >= 80 ? Y.healthy : Y.watch}
                </Txt>
                <Bar pct={score} color={B.lime} />
              </View>
            </View>
            <View>
              {finds.map(([label, val, ok]) => (
                <View
                  key={label}
                  accessible
                  accessibilityLabel={label + ': ' + val + (ok ? '' : ' (needs attention)')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.line }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: ok ? c.limeSoft : 'rgba(242,154,56,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={12} w={700} style={{ lineHeight: 15 }}>
                      {ok ? '✓' : '!'}
                    </Txt>
                  </View>
                  <Txt size={12.5} dim style={{ width: 92 }}>
                    {label}
                  </Txt>
                  <Txt size={13} w={500} style={{ flex: 1, minWidth: 0 }}>
                    {val}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: c.limeSoft }}>
              <Txt size={13.5} w={700}>
                {Y.forName.replace('{name}', nm)}
              </Txt>
              {adv.map((a) => (
                <View key={a} style={{ flexDirection: 'row', gap: 8 }}>
                  <Txt size={13} w={700} color={c.leaf}>
                    {f.rtl ? '←' : '→'}
                  </Txt>
                  <Txt size={13} style={{ flex: 1, minWidth: 0 }}>
                    {a}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Txt size={12.5} w={600} color={c.leaf} style={{ flexShrink: 1 }}>
                {Y.pts}
              </Txt>
              <GhostButton label={Y.again} onPress={again} height={38} style={{ paddingHorizontal: 14 }} />
            </View>
          </Card>
        ) : null}

        {/* Photo history */}
        <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          <Txt label style={{ paddingTop: 10, paddingBottom: 4 }}>
            {Y.hist}
          </Txt>
          {hist.map((x) => (
            <View key={x.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={12} w={700} style={{ lineHeight: 15 }}>
                  ✓
                </Txt>
              </View>
              <Txt size={13} w={500} style={{ flex: 1, minWidth: 0 }}>
                {x.label}
              </Txt>
              <Txt size={12} dim num>
                {x.date}
              </Txt>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
