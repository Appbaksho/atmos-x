'use client';
/** Small fixed pill while the browser is offline (cached data is shown underneath). */
import { useTranslations } from 'next-intl';

import { useMounted, useOnline } from '../hooks';
import { I } from '../icons';
import { B, SHADOW } from '../tokens';
import { Icon, Txt, View } from '../ui';

export function OfflineIndicator() {
  const online = useOnline();
  const mounted = useMounted();
  const t = useTranslations('common.offline');
  if (!mounted || online) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', zIndex: 85, insetInline: 0, top: 'calc(env(safe-area-inset-top, 0px) + 8px)', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: B.navy, borderWidth: 1, borderColor: B.glassLine }, SHADOW.card]}>
        <Icon d={I.wind} size={14} color={B.lime} sw={2} />
        <Txt size={12} w={600} color={B.white}>
          {t('banner')}
        </Txt>
      </View>
    </div>
  );
}
