/** S01 · Welcome — full-bleed aerial photo, floating score pills, headline and the first CTA. */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CzButton, GlassPill, LightStatusBar, Photo, Tap, Txt } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { CREDIT, PHOTO } from '@/lib/cz/demo';
import { go } from '@/lib/cz/routes';

/** The prototype ships English copy only for onboarding; other languages fall back per key. */
const T = {
  en: {
    head: 'Find the hottest block. Then cool it.',
    body: 'See the heat around you from NASA satellites, learn why it’s hot, and turn it into a plan you can act on — alone or with your clan.',
    start: 'Get started',
    have: 'I already have an account',
    roof: 'Roof & road',
    park: 'Park edge',
  },
};

const LANG_NAME = { en: 'English', bn: 'বাংলা', ur: 'اردو' } as const;

export default function Welcome() {
  const { f, prefs } = useCz();
  const t = f.pick(T);
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: B.photoBg }}>
      <LightStatusBar />
      <Photo
        src={PHOTO.welcome}
        label={CREDIT.welcome}
        style={StyleSheet.absoluteFill}
        scrim={[
          [0, 0.45],
          [0.22, 0],
          [0.42, 0],
          [0.7, 0.78],
          [1, 0.92],
        ]}
      />

      {/* Wordmark + current language/unit */}
      <View style={[styles.top, { top: insets.top + 12 }]} pointerEvents="none">
        <Txt display size={26} color={B.white} style={styles.wordmark} accessibilityRole="header">
          ATMOS X
        </Txt>
        <GlassPill>
          <Txt size={12} w={500} color={B.white}>
            {LANG_NAME[prefs.lang]} · {prefs.unit === 'F' ? '°F' : '°C'}
          </Txt>
        </GlassPill>
      </View>

      {/* Floating heat readings over the photo */}
      <ScorePill style={{ top: '34%', start: '9%' }} score={86} color={B.red} text={t.roof} value={f.deg(49)} />
      <ScorePill style={{ top: '44%', end: '7.5%' }} score={31} color={B.green} text={t.park} value={f.deg(36)} />

      <View style={[styles.bottom, { bottom: 52 + insets.bottom }]}>
        <Txt display size={30} color={B.white} style={{ lineHeight: 35 }} accessibilityRole="header">
          {t.head}
        </Txt>
        <Txt size={15.5} color="rgba(255,255,255,0.88)" style={{ lineHeight: 23 }}>
          {t.body}
        </Txt>
        <CzButton label={t.start} icon="compass" onPress={() => go('S02')} style={{ marginTop: 6, marginEnd: 60 }} />
        <Tap role="link" label={t.have} onPress={() => go('S02')} style={styles.link}>
          <Txt size={14} w={500} color={B.white} style={{ textDecorationLine: 'underline' }}>
            {t.have}
          </Txt>
        </Tap>
      </View>
    </View>
  );
}

function ScorePill({ style, score, color, text, value }: { style: object; score: number; color: string; text: string; value: string }) {
  const { f } = useCz();
  return (
    <View style={[styles.pillWrap, style]} pointerEvents="none" accessible accessibilityLabel={`${text} ${value}, Heat Score ${score}`}>
      <GlassPill style={styles.pill}>
        <View style={[styles.disc, { backgroundColor: color }]}>
          <Txt size={11} w={700} color={B.white} num>
            {f.loc(score)}
          </Txt>
        </View>
        <Txt size={12.5} color={B.white}>
          {text}{' '}
          <Txt size={12.5} w={700} color={B.white}>
            {value}
          </Txt>
        </Txt>
      </GlassPill>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', start: 24, end: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { letterSpacing: 1.5, textShadowColor: 'rgba(0,16,32,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  pillWrap: { position: 'absolute', shadowColor: '#001020', shadowOpacity: 0.18, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } },
  pill: { paddingStart: 5, paddingEnd: 14, paddingVertical: 5, gap: 8 },
  disc: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', start: 24, end: 24, gap: 18 },
  link: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
