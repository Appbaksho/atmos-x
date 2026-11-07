'use client';
/**
 * S06 · Zone detail (prompt-v1 §6.5, §7.3–§7.6): one stored zone row (same name, score and distance
 * as the list). Map hero with the Heat Score, the heat now (air / feels-like from Open-Meteo, Landsat
 * surface with its dates), the deterministic "why" with causes, the "+ green" what-if, 20 years of
 * hot-season MODIS surface temperature, measured drivers and the CTAs. Data: useZone(id).
 */
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { requireAccount } from '@/components/cz/account';
import { SkeletonCard, SourceChips } from '@/components/cz/states';
import { B, heatColor, heatFg } from '@/components/cz/tokens';
import { Card, CzButton, GhostButton, IconBtn, Label, LightStatusBar, Screen, StatTile, Tag, Txt, View } from '@/components/cz/ui';
import { CauseChips, WhatIf, scoreLevel } from '@/components/home/score-card';
import { MapAttribution, MapView } from '@/components/map/map-view-lazy';
import { usePrefetchZone, useSession, useZone } from '@/lib/data/hooks';
import type { HexCell, ZoneDetail } from '@/lib/data/types';
import { useLocation } from '@/lib/location';
import { useCz } from '@/lib/prefs';
import { goBack, href } from '@/lib/routes';
import { useServerText, useZoneName } from '@/lib/server-text';

import { DriversCard } from './drivers-card';
import { HistoryCard } from './history-card';
import { ZoneError } from './zone-not-found';

function Hero({ zone }: { zone: ZoneDetail | undefined }) {
  const { f } = useCz();
  const t = useTranslations('zone');
  const th = useTranslations('home');
  const { placeName } = useLocation();
  const zn = useZoneName();
  const hexes = useMemo<HexCell[]>(() => (zone ? zone.h3.map((h) => ({ h3: h, score: zone.score, lst_c: zone.lst_c, label: zone.label ?? 'satellite' })) : []), [zone]);
  // The stored distance from the scan centre (§7.3): never recomputed on the client.
  const d = zone ? zone.dist_m : null;
  const place = zone?.place ?? placeName;
  const pts = (zone?.history ?? []).filter((h) => h.day_lst_c != null);
  const anom = pts.length > 2 ? pts[pts.length - 1].day_lst_c! - pts.reduce((a, h) => a + h.day_lst_c!, 0) / pts.length : null;

  return (
    <View style={{ height: 340, backgroundColor: B.photoBg, overflow: 'hidden' }}>
      {zone ? (
        <MapView
          label={t('heroA11y', { zone: zn(zone) })}
          center={zone.centroid}
          radiusM={300}
          hexes={hexes}
          zones={null}
          focusCells={zone.h3}
          showCircle={false}
          interactive={false}
          padding={{ top: 70, bottom: 120, left: 40, right: 40 }}
          style={{ position: 'absolute', inset: 0 }}
        />
      ) : (
        <div aria-hidden className="cz-skeleton" style={{ position: 'absolute', inset: 0, backgroundColor: B.photoBg }} />
      )}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,16,32,0.55) 0%, rgba(0,16,32,0) 35%, rgba(0,16,32,0.15) 55%, rgba(0,16,32,0.85) 100%)' }} />
      <IconBtn d={f.backPath} label={t('back')} tone="glass" onPress={goBack} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16 }} />
      {zone ? <MapAttribution style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 22px)', end: 12 }} /> : null}
      {zone ? (
        <View style={{ position: 'absolute', start: 20, end: 20, bottom: 22, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, pointerEvents: 'none' }}>
          <View style={{ flexShrink: 1, minWidth: 0, gap: 6 }}>
            <Txt display size={20} color={B.white} as="h1">
              {zn(zone)}
            </Txt>
            <Txt size={13} color={B.white} style={{ opacity: 0.9 }}>
              {d != null && d < 50_000 ? (place ? t('sub', { place, d: f.dist(d) }) : t('distOnly', { d: f.dist(d) })) : (place ?? '')}
            </Txt>
            {anom != null ? <Tag label={t('anom', { d: f.dC(anom, 1) })} bg={anom > 0 ? B.red : B.blue} fg={B.white} size="md" style={{ height: 26 }} /> : null}
          </View>
          <div role="img" aria-label={`${th('score')} ${zone.score}, ${zone.score >= 85 ? t('vhigh') : th(`level.${scoreLevel(zone.score)}`)}`} className="cz-view" style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: heatColor(zone.score), alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={22} w={600} num color={heatFg(zone.score)}>
                {f.loc(zone.score)}
              </Txt>
            </View>
            <Txt label color={B.white} style={{ fontSize: 10.5 }}>
              {th(`level.${scoreLevel(zone.score)}`)}
            </Txt>
          </div>
        </View>
      ) : null}
    </View>
  );
}

export function ZoneScreen({ id }: { id: string }) {
  const { f } = useCz();
  const t = useTranslations('zone');
  const q = useZone(id);
  // Next in the demo: goal wizard / plan need this zone's planting spots (Overpass, slow when cold).
  usePrefetchZone(q.data ? id : null, { spots: true });
  const session = useSession();
  const zone = q.data;
  const tx = useServerText();

  return (
    <Screen bleed>
      <LightStatusBar />
      <Hero zone={zone} />

      {!zone ? (
        q.error ? (
          <ZoneError error={q.error} onRetry={() => void q.refetch()} style={{ marginHorizontal: 16 }} />
        ) : (
          <View aria-busy style={{ gap: 14 }}>
            <SkeletonCard lines={2} style={{ marginHorizontal: 16 }} />
            <SkeletonCard lines={4} style={{ marginHorizontal: 16 }} />
            <SkeletonCard lines={3} style={{ marginHorizontal: 16 }} />
          </View>
        )
      ) : (
        <>
          {zone.superseded_by ? (
            <Card style={{ marginHorizontal: 16 }} gap={8}>
              <Txt size={13} w={600}>
                {t('newer')}
              </Txt>
              <GhostButton label={t('newerAction')} height={40} href={href('S06', { id: zone.superseded_by })} />
            </Card>
          ) : null}
          <Card style={{ marginHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Label>{t('observed')}</Label>
              <Txt size={11} dim num>
                {f.time(zone.meta.generated_at)}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatTile big label={t('air')} value={zone.air_c != null ? f.deg(zone.air_c) : '—'} style={{ borderRadius: 16 }} />
              <StatTile big label={t('feels')} value={zone.feels_c != null ? f.deg(zone.feels_c) : '—'} style={{ borderRadius: 16 }} />
              <StatTile big label={t('roof')} value={zone.lst_c != null ? f.deg(zone.lst_c) : '—'} style={{ borderRadius: 16 }} />
            </View>
            <Txt size={11.5} dim>
              {zone.label === 'estimate' ? t('lstNoteEstimate') : t('lstNote', { date: zone.drivers?.as_of ? f.date(zone.drivers.as_of) : '—' })}
            </Txt>
          </Card>

          <Card style={{ marginHorizontal: 16 }} gap={12}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Txt size={15} w={600} as="h2">
                {t('whyTitle')}
              </Txt>
            </View>
            {zone.why.length ? (
              <Txt size={13.5} style={{ lineHeight: 21 }}>
                {zone.why.map((w) => tx(w)).join(' ')}
              </Txt>
            ) : (
              <Txt size={12.5} dim>
                {t('noWhy')}
              </Txt>
            )}
            <Txt size={11} dim>
              {t('whyNote')}
            </Txt>
            <CauseChips causes={zone.causes} bleed={16} />
          </Card>

          <Card style={{ marginHorizontal: 16 }} gap={10}>
            <Txt size={15} w={600} as="h2">
              {t('whatIfTitle')}
            </Txt>
            <WhatIf zone={zone} guest={session.isGuest} />
          </Card>

          <HistoryCard zone={zone} />
          <DriversCard zone={zone} guest={session.isGuest} />

          <View style={{ marginHorizontal: 16, gap: 10 }}>
            {session.isGuest ? (
              <CzButton label={t('setGoal')} icon="plus" onPress={() => requireAccount(t('goalFeature'))} />
            ) : (
              <CzButton label={t('setGoal')} icon="plus" href={href('S08', undefined, { zone: zone.id })} />
            )}
            <GhostButton label={t('seeProj')} href={href('S07', { id: zone.id })} />
          </View>
          <SourceChips meta={zone.meta} style={{ marginHorizontal: 16 }} />
        </>
      )}
    </Screen>
  );
}
