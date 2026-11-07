'use client';
/**
 * L8/L11 · When no place could be resolved (location refused or unavailable and no city from the IP
 * address), screens that need a place show this instead of data for a made-up spot: one line on why,
 * "Use my location", a city search, and the clearly labelled Dhaka demo.
 */
import { useTranslations } from 'next-intl';

import { SearchBox } from '@/components/onboarding/location';
import { useLocation } from '@/lib/location';
import { href } from '@/lib/routes';

import { I } from '../icons';
import { B, R } from '../tokens';
import { CzButton, Icon, Tap, Txt, View } from '../ui';

/** Screens that work without a place (accounts, community content, settings, portals). */
const NO_PLACE = ['/app/about', '/app/settings', '/app/profile', '/app/notifications', '/app/company', '/app/partner', '/app/admin', '/app/moderation', '/app/tree', '/app/u/', '/app/post/', '/app/team', '/app/org', '/app/contribution', '/app/store'];

export function needsPlaceGate(path: string): boolean {
  return !NO_PLACE.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

export function LocationGate() {
  const t = useTranslations('common.location');
  const loc = useLocation();
  return (
    <main id="main" className="cz-view" style={{ minHeight: '100dvh', backgroundColor: B.navy, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 440, gap: 16 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(172,236,0,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.pin} size={24} sw={2} color={B.lime} />
        </View>
        <Txt display size={22} color={B.white} as="h1">
          {t('gateTitle')}
        </Txt>
        <Txt size={14.5} color="rgba(255,255,255,0.85)">
          {loc.error === 'denied' ? t('denied') : t('gateWhy')}
        </Txt>
        <CzButton label={t('useMine')} icon="compass" busy={loc.loading} onPress={() => void loc.refresh()} />
        <View style={{ flexDirection: 'row', minHeight: 48 }}>
          <SearchBox />
        </View>
        <Tap role="link" label={t('tryDemo')} href={href('S04', undefined, { demo: 1 })} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderRadius: R.pill }}>
          <Txt size={14} w={600} color={B.lime} style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>
            {t('tryDemo')}
          </Txt>
        </Tap>
      </View>
    </main>
  );
}
