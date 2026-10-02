/** S15 · Contribution — verified hero, checks, leaderboard move, ground truth, survival schedule. */
import { View } from 'react-native';

import { Card, CzButton, GhostButton, Icon, I, Label, Photo, Screen, ScreenHeader, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO } from '@/lib/cz/demo';
import { go } from '@/lib/cz/routes';

const T = {
  en: {
    conTitle: 'Contribution', verified: 'Verified', creditedTo: 'Credited to', lbMove: 'Up 5 places this week', lbScope: 'Teams · Mohammadpur',
    survival: 'Survival photos', survNote: 'Each check unlocks more points. Miss one and points pause — they don’t vanish.', backPlan: 'Back to plan', seeTeam: 'See team',
  },
  bn: { conTitle: 'অবদান', verified: 'যাচাইকৃত', survival: 'টিকে থাকার ছবি', backPlan: 'পরিকল্পনায় ফিরুন', seeTeam: 'দল দেখুন' },
  ur: { conTitle: 'حصہ', verified: 'تصدیق شدہ', survival: 'بقا کی تصاویر', backPlan: 'منصوبے پر واپس', seeTeam: 'ٹیم دیکھیں' },
};

/** Ground-truth card (prototype ships English + Bangla). */
const GX = {
  en: {
    title: 'Ground truth', tag: 'Used by scientists',
    body: 'Your photo is now a ground-truth point. It checks what the satellite sees here — new canopy, greenness and surface heat — the way NASA scientists use GLOBE citizen photos.',
    stats: [['Satellite NDVI', '0.31'], ['Your photo', 'Sapling ✓'], ['Zone photos', '37']] as [string, string][],
    src: 'Shared anonymously, snapped to the zone center · GLOBE-style protocol',
  },
  bn: {
    title: 'মাঠের প্রমাণ', tag: 'বিজ্ঞানীরা ব্যবহার করেন',
    body: 'আপনার ছবি এখন একটি মাঠ-প্রমাণ বিন্দু। স্যাটেলাইট এখানে যা দেখে — নতুন ছাউনি, সবুজতা আর পৃষ্ঠের তাপ — তা মিলিয়ে দেখা হয়, যেমন NASA-র বিজ্ঞানীরা GLOBE নাগরিকদের ছবি ব্যবহার করেন।',
    stats: [['স্যাটেলাইট NDVI', '০.৩১'], ['আপনার ছবি', 'চারা ✓'], ['জোনের ছবি', '৩৭']] as [string, string][],
    src: 'বেনামে, জোনের কেন্দ্রে বসিয়ে শেয়ার হয় · GLOBE-ধাঁচের পদ্ধতি',
  },
};

const CHECKS: [string, string, string][] = [
  ['Sapling detected', 'AI image check', '94%'],
  ['Species looks like Neem', 'AI image check', '81%'],
  ['Inside Asad Gate block', 'Rule · GPS ± 4 m', 'Pass'],
  ['Time sealed, not edited', 'Rule · EXIF + device', 'Pass'],
  ['Not a duplicate', 'Rule · photo fingerprint', 'Pass'],
];
/** [label, date, next due] */
const SURV: [string, string, boolean][] = [
  ['Day 30', '1 Nov', true],
  ['Day 90', '31 Dec', false],
  ['Day 180', '31 Mar', false],
  ['1 year', '2 Oct ’27', false],
];

export default function Contribution() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const gx = f.lang === 'bn' ? GX.bn : GX.en;
  const { loc } = f;

  return (
    <Screen>
      <ScreenHeader title={t.conTitle} sub={loc('3 Neem · Asad Gate block · 2 Oct')} />

      <Card tone="navy" pad={12} gap={14} style={{ borderRadius: R.xxl, flexDirection: 'row', alignItems: 'center' }}>
        <Photo src={PHOTO.sapling(300, 300)} label="Your verified photo" style={{ width: 96, height: 96, borderRadius: R.lg, backgroundColor: B.photoBg2 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: B.lime }}>
            <Icon d={I.check} size={12} color={B.limeInk} sw={3} />
            <Txt size={11.5} w={700} color={B.limeInk}>
              {t.verified}
            </Txt>
          </View>
          <Txt size={30} num color={B.white} lines={1} style={{ lineHeight: 32, letterSpacing: -0.6 }}>
            {'+' + loc(120) + ' pts'}
          </Txt>
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {t.creditedTo + ' Hall Rooftop Crew'}
          </Txt>
        </View>
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        {CHECKS.map(([label, kind, val], i) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: i < CHECKS.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={I.check} size={13} sw={3} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={500}>
                {label}
              </Txt>
              <Txt size={11} dim>
                {loc(kind)}
              </Txt>
            </View>
            <Txt size={12.5} w={600} num lines={1}>
              {loc(val)}
            </Txt>
          </View>
        ))}
      </Card>

      <Tap label={`${t.lbMove}, #14 → #9. ${t.lbScope}`} onPress={() => go('S16')} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt size={22} dim num>
            {'#' + loc(14)}
          </Txt>
          <Icon d={I.up} size={18} color={B.green} sw={2.4} />
          <Txt size={30} w={600} num style={{ lineHeight: 34 }}>
            {'#' + loc(9)}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={13.5} w={600}>
            {loc(t.lbMove)}
          </Txt>
          <Txt size={12} dim>
            {t.lbScope}
          </Txt>
        </View>
        <Icon d={f.fwdPath} size={16} sw={2} />
      </Tap>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Label>{gx.title}</Label>
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: c.limeSoft }}>
            <Txt size={11} w={600}>
              {gx.tag}
            </Txt>
          </View>
        </View>
        <Txt size={13}>{gx.body}</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {gx.stats.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: c.soft, borderRadius: 14, padding: 10, gap: 2 }}>
              <Txt size={10.5} dim lines={1}>
                {label}
              </Txt>
              <Txt size={15} w={600} num lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        <Txt size={11} dim>
          {gx.src}
        </Txt>
      </Card>

      <Card gap={14}>
        <Label>{t.survival}</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ position: 'absolute', start: '12.5%', end: '12.5%', top: 15, height: 2, backgroundColor: c.line }} />
          {SURV.map(([label, date, next]) => (
            <View
              key={label}
              accessible
              accessibilityLabel={`${label}, ${date}, +40 points${next ? ', next' : ''}`}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.card, borderWidth: 2, borderColor: next ? B.lime : c.line, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={I.camera} size={15} sw={1.8} />
              </View>
              <Txt size={12.5} w={600} center lines={1}>
                {loc(label)}
              </Txt>
              <Txt size={11} dim center lines={1}>
                {loc(date)}
              </Txt>
              <Txt size={11} w={600} num center color={c.leaf}>
                {'+' + loc(40)}
              </Txt>
            </View>
          ))}
        </View>
        <Txt size={12} dim>
          {t.survNote}
        </Txt>
      </Card>

      <View style={{ gap: 10 }}>
        <CzButton label={t.backPlan} icon="arrow" onPress={() => go('S10')} />
        <GhostButton label={t.seeTeam} onPress={() => go('S17')} />
      </View>
    </Screen>
  );
}
