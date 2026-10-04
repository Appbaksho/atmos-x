/** S02 · Language & units — step 1 of 2. */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, CzButton, Divider, IconBtn, Screen, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go, goBack } from '@/lib/cz/routes';

const T = {
  en: {
    step: 'Step 1 of 2',
    title: 'Choose your language',
    sub: 'Detected from your device: English (Bangladesh). Change it anytime in Settings.',
    temp: 'Temperature',
    area: 'Area',
    next: 'Continue',
    back: 'Back',
  },
};

/** [native name, English name, code]. Only en / bn / ur have app translations today. */
const LANGS: [string, string, string][] = [
  ['English', 'English', 'en'],
  ['বাংলা', 'Bengali', 'bn'],
  ['中文', 'Mandarin Chinese', 'zh'],
  ['हिन्दी', 'Hindi', 'hi'],
  ['Español', 'Spanish', 'es'],
  ['Français', 'French', 'fr'],
  ['العربية', 'Arabic', 'ar'],
  ['Português', 'Portuguese', 'pt'],
  ['Русский', 'Russian', 'ru'],
  ['اردو', 'Urdu', 'ur'],
];

export default function Language() {
  const { c, f, prefs, setPref } = useCz();
  const t = f.pick(T);
  const [pick, setPick] = useState<string>(prefs.lang);

  const choose = (k: string) => {
    setPick(k);
    if (k === 'en' || k === 'bn' || k === 'ur') setPref('lang', k);
  };

  return (
    <Screen gap={22} style={{ paddingHorizontal: 20, flexGrow: 1 }}>
      <View style={styles.row}>
        <IconBtn d={f.backPath} label={t.back} onPress={goBack} />
        <Txt size={12} dim>
          {t.step}
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <Txt display size={21} accessibilityRole="header">
          {t.title}
        </Txt>
        <Txt size={14} dim>
          {t.sub}
        </Txt>
      </View>

      <View style={styles.grid} accessibilityRole="radiogroup">
        {LANGS.map(([native, en, k]) => {
          const on = k === pick;
          return (
            <Tap
              key={k}
              role="radio"
              selected={on}
              label={`${native}, ${en}`}
              haptic
              onPress={() => choose(k)}
              style={[styles.lang, { backgroundColor: c.card, borderColor: on ? c.leaf : 'transparent' }]}>
              <Txt size={16} w={600}>
                {native}
              </Txt>
              <Txt size={12} dim>
                {en}
              </Txt>
            </Tap>
          );
        })}
      </View>

      <Card gap={14}>
        <View style={styles.optRow}>
          <Txt size={14} w={600}>
            {t.temp}
          </Txt>
          <MiniSeg
            value={prefs.unit}
            onChange={(v) => setPref('unit', v)}
            options={[
              { label: '°C', value: 'C' as const },
              { label: '°F', value: 'F' as const },
            ]}
            padX={18}
          />
        </View>
        <Divider />
        <View style={styles.optRow}>
          <Txt size={14} w={600}>
            {t.area}
          </Txt>
          <MiniSeg
            value={prefs.area}
            onChange={(v) => setPref('area', v)}
            options={[
              { label: 'm²', value: 'metric' as const },
              { label: 'ft²', value: 'imperial' as const },
            ]}
            padX={14}
          />
        </View>
      </Card>

      <View style={{ flex: 1 }} />
      <CzButton label={t.next} icon="arrow" onPress={() => go('S03')} style={{ marginEnd: 60 }} />
    </Screen>
  );
}

/** Compact segmented control sized to its labels (the kit Seg stretches to fill). */
function MiniSeg<V extends string>({ value, onChange, options, padX }: { value: V; onChange: (v: V) => void; options: { label: string; value: V }[]; padX: number }) {
  const { c } = useCz();
  return (
    <View accessibilityRole="tablist" style={[styles.seg, { backgroundColor: c.soft }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            role="tab"
            selected={on}
            label={o.label}
            haptic
            onPress={() => onChange(o.value)}
            style={[styles.segBtn, { paddingHorizontal: padX, backgroundColor: on ? B.lime : 'transparent' }]}>
            <Txt size={14} w={600} color={on ? B.navy : c.ink2}>
              {o.label}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lang: { flexBasis: '40%', flexGrow: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 2, borderWidth: 2, minHeight: 64 },
  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: R.pill },
  segBtn: { minHeight: 36, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
});
