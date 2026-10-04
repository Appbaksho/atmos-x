'use client';
/**
 * STUB owned by V0-7: replace this file with the real Ask Atmos panel (keep the export name and
 * props). Rendered by the V0-1 slot (src/components/cz/shell/ask-slot.tsx); use <BottomSheet
 * desktop="right"> (or <Drawer>) from the kit for the mobile sheet / desktop drawer.
 */
import { useTranslations } from 'next-intl';

import { BottomSheet } from '@/components/cz/sheet';
import { B } from '@/components/cz/tokens';
import { I, Icon, Txt, View } from '@/components/cz/ui';
import type { ScreenId } from '@/lib/data/types';

export type AskPanelProps = { open: boolean; onClose: () => void; screen: ScreenId | null };

export function AskPanel({ open, onClose, screen }: AskPanelProps) {
  const t = useTranslations('common');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      desktop="right"
      height="76%"
      title={t('askAtmos')}
      sub={screen ?? undefined}
      leading={
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.sparkleOne} size={18} color={B.lime} sw={2} />
        </View>
      }>
      <Txt size={13} dim>
        {t('placeholder.body', { owner: 'V0-7' })}
      </Txt>
    </BottomSheet>
  );
}
