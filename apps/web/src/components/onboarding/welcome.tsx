'use client';
/** S01 · Welcome (port of screens/onboarding/welcome.tsx): full-bleed aerial, example score pills, headline, CTAs. */
import { useTranslations } from 'next-intl';

import { B } from '@/components/cz/tokens';
import { CzButton, GlassPill, LightStatusBar, Photo, Tap, Txt, View } from '@/components/cz/ui';
import { CREDIT, PHOTO } from '@/components/home/photos';
import { LOCALE_NAMES } from '@/i18n/routing';
import { useCz } from '@/lib/prefs';
import { goReplace, href } from '@/lib/routes';

/** Illustrative example readings on the marketing photo (not data). */
function ScorePill({ style, score, color, text, value }: { style: React.CSSProperties; score: number; color: string; text: string; value: string }) {
  const { f } = useCz();
  const t = useTranslations('onboarding.welcome');
  return (
    <div role="img" aria-label={t('pillA11y', { text, value, score: f.loc(score) })} style={{ position: 'absolute', filter: 'drop-shadow(0 4px 7px rgba(0,16,32,0.18))', ...style }}>
      <GlassPill style={{ paddingStart: 5, paddingEnd: 14, paddingVertical: 5, gap: 8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
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
    </div>
  );
}

export function WelcomeScreen() {
  const { f, prefs, lang, setPrefs } = useCz();
  const t = useTranslations('onboarding.welcome');
  const demo = () => {
    setPrefs({ presentation: true, onboarded: true });
    goReplace('S04');
  };
  return (
    <main id="main" className="cz-view" style={{ minHeight: '100dvh', backgroundColor: B.photoBg }}>
      <LightStatusBar />
      <Photo
        src={PHOTO.welcome}
        label={CREDIT.welcome}
        priority
        style={{ position: 'absolute', inset: 0 }}
        scrim={[
          [0, 0.45],
          [0.22, 0],
          [0.42, 0],
          [0.7, 0.78],
          [1, 0.92],
        ]}
      />
      <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 24, end: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt display size={26} color={B.white} as="h1" style={{ letterSpacing: 1.5, textShadow: '0 2px 6px rgba(0,16,32,0.35)' }}>
          ATMOS X
        </Txt>
        <GlassPill>
          <Txt size={12} w={500} color={B.white}>
            {LOCALE_NAMES[lang]} · {prefs.unit === 'F' ? '°F' : '°C'}
          </Txt>
        </GlassPill>
      </View>

      <ScorePill style={{ top: '34%', insetInlineStart: '9%' }} score={86} color={B.red} text={t('roof')} value={f.deg(49)} />
      <ScorePill style={{ top: '44%', insetInlineEnd: '7.5%' }} score={31} color={B.green} text={t('park')} value={f.deg(36)} />

      <View style={{ position: 'absolute', start: 24, end: 24, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 36px)', gap: 18, maxWidth: 520, marginInline: 'auto' }}>
        <Txt display size={30} color={B.white} as="h2" style={{ lineHeight: 35 }}>
          {t('head')}
        </Txt>
        <Txt size={15.5} color="rgba(255,255,255,0.88)" style={{ lineHeight: 23 }}>
          {t('body')}
        </Txt>
        <CzButton label={t('start')} icon="compass" href={href('S02')} style={{ marginTop: 6, marginEnd: 60 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18 }}>
          <Tap role="link" label={t('have')} href={href('login', undefined, { next: '/app/onboarding/language' })} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={14} w={500} color={B.white} style={{ textDecoration: 'underline' }}>
              {t('have')}
            </Txt>
          </Tap>
          <Tap role="link" label={t('demo')} onPress={demo} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={14} w={600} color={B.lime} style={{ textDecoration: 'underline' }}>
              {t('demo')}
            </Txt>
          </Tap>
        </View>
      </View>
    </main>
  );
}
