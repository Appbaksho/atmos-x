'use client';
/** S02 · Language & units, step 1 of 2 (port of screens/onboarding/language.tsx). All 10 locales in their native names. */
import { useTranslations } from 'next-intl';

import { B, R } from '@/components/cz/tokens';
import { Card, CzButton, Divider, IconBtn, Screen, Tap, Txt, View } from '@/components/cz/ui';
import { useMounted } from '@/components/cz/hooks';
import { LOCALE_NAMES } from '@/i18n/routing';
import { LOCALES, type Locale } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { goBack, href } from '@/lib/routes';

function MiniSeg<V extends string>({ value, onChange, options, padX, label }: { value: V; onChange: (v: V) => void; options: { label: string; value: V }[]; padX: number; label: string }) {
  const { c } = useCz();
  return (
    <View role="radiogroup" label={label} style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: R.pill, backgroundColor: c.soft }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap key={o.value} role="radio" selected={on} label={o.label} haptic onPress={() => onChange(o.value)} style={{ minHeight: 36, paddingHorizontal: padX, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.lime : 'transparent' }}>
            <Txt size={14} w={600} color={on ? B.limeInk : c.ink2}>
              {o.label}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

export function LanguageScreen() {
  const { c, f, lang, prefs, setPref, setLang } = useCz();
  const t = useTranslations('onboarding.language');
  const mounted = useMounted();
  // Intl data differs between Node and browsers: only localise after hydration.
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = mounted ? new Intl.DisplayNames([lang], { type: 'language' }) : null;
  } catch {
    dn = null;
  }
  const names = (l: string) => (dn ? (dn.of(l) ?? l) : (LOCALE_NAMES[l as Locale] ?? l));
  const detected = mounted && typeof navigator !== 'undefined' ? names(navigator.language) : null;

  return (
    <Screen gap={22} style={{ paddingHorizontal: 20, maxWidth: 560, marginInline: 'auto' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconBtn d={f.backPath} label={t('back')} onPress={goBack} />
        <Txt size={12} dim>
          {t('step')}
        </Txt>
      </View>
      <View style={{ gap: 8 }}>
        <Txt display size={21} as="h1">
          {t('title')}
        </Txt>
        <Txt size={14} dim>
          {detected ? t('detected', { lang: detected }) : t('sub')}
        </Txt>
      </View>

      <View role="radiogroup" label={t('group')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LOCALES.map((k: Locale) => {
          const on = k === lang;
          return (
            <Tap
              key={k}
              role="radio"
              selected={on}
              label={`${LOCALE_NAMES[k]}, ${names(k)}`}
              haptic
              onPress={() => setLang(k)}
              style={{ flexBasis: '40%', flexGrow: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 2, borderWidth: 2, minHeight: 64, backgroundColor: c.card, borderColor: on ? c.accent : 'transparent', textAlign: 'start' }}>
              <span lang={k} dir="auto" style={{ fontSize: 16, fontWeight: 600, color: c.ink }}>
                {LOCALE_NAMES[k]}
              </span>
              <Txt size={12} dim>
                {names(k)}
              </Txt>
            </Tap>
          );
        })}
      </View>

      <Card gap={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Txt size={14} w={600}>
            {t('temp')}
          </Txt>
          <MiniSeg
            label={t('temp')}
            value={prefs.unit}
            onChange={(v) => setPref('unit', v)}
            padX={18}
            options={[
              { label: '°C', value: 'C' },
              { label: '°F', value: 'F' },
            ]}
          />
        </View>
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Txt size={14} w={600}>
            {t('area')}
          </Txt>
          <MiniSeg
            label={t('area')}
            value={prefs.area}
            onChange={(v) => setPref('area', v)}
            padX={14}
            options={[
              { label: 'm²', value: 'metric' },
              { label: 'ft²', value: 'imperial' },
            ]}
          />
        </View>
      </Card>

      <View style={{ flex: 1 }} />
      <CzButton label={t('next')} icon="arrow" href={href('S03')} style={{ marginEnd: 60 }} />
    </Screen>
  );
}
