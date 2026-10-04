'use client';
/** Five-step crop stage bar (done = leaf, now = lime, ahead = soft), as on F01 "Growth stage". */
import { useTranslations } from 'next-intl';

import { B, Txt, useCz, View } from '@/components/cz';
import type { StageId } from '@/lib/data/types';

import { STAGE_IDS } from './farm-data';

export function StageBar({ stage }: { stage: StageId }) {
  const { c, f } = useCz();
  const t = useTranslations('farm');
  const cur = STAGE_IDS.indexOf(stage);
  return (
    <View
      role="img"
      label={t('fields.stageA11y', { n: f.loc(cur + 1), total: f.loc(STAGE_IDS.length), stage: t(`stage.${stage}`) })}
      style={{ flexDirection: 'row', gap: 4 }}>
      {STAGE_IDS.map((s, i) => (
        <View key={s} aria-hidden style={{ flex: 1, minWidth: 0, gap: 6, alignItems: 'center' }}>
          <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: i < cur ? c.leaf : i === cur ? B.lime : c.soft }} />
          <Txt size={10.5} w={i === cur ? 700 : 500} color={i === cur ? c.ink : c.ink2} lines={1}>
            {t(`stage.${s}`)}
          </Txt>
        </View>
      ))}
    </View>
  );
}
