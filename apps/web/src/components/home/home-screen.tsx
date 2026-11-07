'use client';
/**
 * S04 · Home (port of apps/mobile/src/screens/home/home.tsx, layout "Photo hero"): live conditions,
 * 5-day forecast, own-zone Heat Score + what-if, air teaser, trees due a photo, hottest zones and
 * the goal card. Farmer mode renders <FarmHome/> (V0-7) instead.
 */
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { ErrorState } from '@/components/cz/states';
import { LightStatusBar, Screen } from '@/components/cz/ui';
import { FarmHome } from '@/components/farm/farm-home';
import { useScan } from '@/components/map/use-scan';
import { useAir, useConditions, useGoals, useMe, usePrefetchZone, useSession, useTrees, useUnreadCount, useZone } from '@/lib/data/hooks';
import { useLocation } from '@/lib/location';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { Hero } from './hero';
import { ImportOffer } from './import-offer';
import { ScoreCard } from './score-card';
import { AirCard, DueTreesCard, ForecastCard, GoalCard, GoalCta, GuestTreesCard, HottestZones, SectionSkeleton } from './sections';

export function HomeTab() {
  const { prefs } = useCz();
  return prefs.farmer_mode ? <FarmHome /> : <HomeScreen />;
}

export function HomeScreen() {
  const tc = useTranslations('common');
  const { placeName } = useLocation();
  const me = useMe();
  const session = useSession();
  const scan = useScan();
  const point = scan.point;
  const cond = useConditions(point);
  const myZoneId = scan.data?.my_zone_id ?? scan.data?.zones[0]?.id ?? null;
  const zone = useZone(myZoneId);
  const air = useAir(point);
  const trees = useTrees();
  const goals = useGoals();
  const unread = useUnreadCount();

  const place = cond.data?.place || placeName || tc('location.finding');
  const name = me.role === 'guest' ? null : me.display_name.split(' ')[0] || null;
  const mySummary = scan.data?.zones.find((z) => z.id === myZoneId) ?? null;
  const zoneLoading = scan.isLoading || (!!myZoneId && zone.isLoading) || !session.ready;
  // Demo script: Home → Map → hottest zone. Warm the hottest zone's detail and the map code.
  usePrefetchZone(scan.data?.zones[0]?.id ?? null);
  useEffect(() => {
    const warm = () => void import('@/components/map/map-view').catch(() => undefined);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2500);
  }, []);

  return (
    <Screen tab bleed gap={18}>
      <LightStatusBar />
      <Hero cond={cond.data} loading={cond.isLoading || !point} place={place} name={name} lstC={zone.data?.lst_c ?? mySummary?.lst_c ?? null} unread={(unread.data ?? 0) > 0} />
      {cond.error && !cond.data ? <ErrorState compact error={cond.error} onRetry={() => void cond.refetch()} style={{ marginHorizontal: 16 }} /> : null}

      <ScoreCard
        zone={zone.data}
        loading={zoneLoading}
        error={zone.error ?? scan.error}
        onRetry={() => void (zone.error ? zone.refetch() : scan.refetch())}
        guest={session.isGuest}
        emptyHref={href('S05')}
      />

      {cond.data ? <ForecastCard cond={cond.data} /> : cond.isLoading ? <SectionSkeleton /> : null}

      {air.data ? <AirCard air={air.data} /> : air.isLoading ? <SectionSkeleton /> : air.error ? <ErrorState compact error={air.error} onRetry={() => void air.refetch()} style={{ marginHorizontal: 16 }} /> : null}

      {session.ready && !session.isGuest ? <ImportOffer /> : null}
      {session.ready && session.isGuest ? <GuestTreesCard /> : trees.data ? <DueTreesCard trees={trees.data} /> : null}

      {scan.data ? <HottestZones zones={scan.data.zones} hexes={scan.data.hexes} /> : null}

      {goals.isLoading || !session.ready ? <SectionSkeleton /> : goals.active ? <GoalCard goal={goals.active} /> : <GoalCta zone={mySummary} guest={session.isGuest} />}
    </Screen>
  );
}
