'use client';
/** Scan radius slider + presets (S03 onboarding, S05 map). Guests are capped at 500 m (§4.5). */
import { useTranslations } from 'next-intl';

import { requireAccount } from '@/components/cz/account';
import { R } from '@/components/cz/tokens';
import { CzSlider, Icon, I, Tap, Txt, View } from '@/components/cz/ui';
import { B } from '@/components/cz/tokens';
import { useCz } from '@/lib/prefs';

/** prompt-v1 §6.4 H3: 200 m · 500 m · 1 km (19, 61 and 217 hexes). */
export const RADIUS_PRESETS = [200, 500, 1000];
export const GUEST_RADIUS = 500;

export function useRadiusLabel() {
  const { f } = useCz();
  // "1 km", not "1.0 km"
  return (v: number) => f.dist(v).replace(/[.٫][0০۰٠](?=\s)/, '');
}

export function RadiusControl({
  value,
  onChange,
  guest,
  sub,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Guests can't go above 500 m: opens the account sheet instead */
  guest?: boolean;
  /** Trailing text on the label row (e.g. "24 zones · 500 m") */
  sub?: string;
  compact?: boolean;
}) {
  const { c } = useCz();
  const t = useTranslations('map');
  const label = useRadiusLabel();
  const set = (v: number) => {
    if (guest && v > GUEST_RADIUS) {
      onChange(GUEST_RADIUS);
      requireAccount(t('guestRadius'));
      return;
    }
    onChange(v);
  };
  return (
    <View style={{ gap: compact ? 6 : 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Txt size={14} w={600}>
          {t('radius')}
        </Txt>
        <Txt size={compact ? 13 : 14} dim num>
          {sub ?? label(value)}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <CzSlider value={value} onChange={set} min={100} max={1000} step={50} label={t('radius')} valueText={label(value)} />
      </View>
      <View role="radiogroup" label={t('radius')} style={{ flexDirection: 'row', gap: 6 }}>
        {RADIUS_PRESETS.map((v) => {
          const on = value === v;
          const locked = guest && v > GUEST_RADIUS;
          return (
            <Tap
              key={v}
              role="radio"
              selected={on}
              label={label(v)}
              haptic
              onPress={() => set(v)}
              style={{ flex: 1, height: compact ? 34 : 38, borderRadius: R.pill, backgroundColor: on ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
              {locked ? <Icon d={I.lock} size={12} color={c.ink2} sw={2} /> : null}
              <Txt size={13} w={600} color={on ? B.limeInk : c.ink2} num>
                {label(v)}
              </Txt>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
