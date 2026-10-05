'use client';
/**
 * `GET /api/v0/zones/[id]` answers 404 `{code: 'zone.not_found'}` for ids the server can't rebuild
 * (zone ids change when an area is re-scanned). Show a clear way back to the map instead of the
 * generic "Try again" error.
 */
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/cz/states';
import { GhostButton, View } from '@/components/cz/ui';
import type { StyleProp } from '@/components/cz/style';
import { DataError } from '@/lib/data/hooks';
import { href } from '@/lib/routes';

export function isZoneNotFound(e: unknown): boolean {
  return e instanceof DataError && e.code === 'zone.not_found';
}

/** ErrorState for a zone query: "zone gone" → back to the map; anything else → retry. */
export function ZoneError({ error, onRetry, style }: { error: unknown; onRetry: () => void; style?: StyleProp }) {
  const t = useTranslations('zone.notFound');
  if (!isZoneNotFound(error)) return <ErrorState error={error} onRetry={onRetry} style={style} />;
  return (
    <View style={[{ gap: 10 }, style]}>
      <ErrorState error={error} title={t('title')} body={t('body')} />
      <GhostButton label={t('action')} href={href('S05')} />
    </View>
  );
}
