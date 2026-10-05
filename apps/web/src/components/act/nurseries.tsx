'use client';

/** S12 · Nurseries (useNurseries): MapLibre numbered pins, filters, cards with call + directions. */
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { B, EmptyState, ErrorState, FilterChip, GhostButton, I, IconBtn, R, Screen, ScreenHeader, SkeletonCard, SourceChips, Tag, Tap, Txt, View, useCz, useLocation } from '@/components/cz';
import { GeoMap, type MapReady } from '@/components/plan/geo-map';
import { useGoalPlan } from '@/components/plan/use-goal-plan';
import { useNurseries } from '@/lib/data/hooks';
import type { Nursery } from '@/lib/data/types';

const RADIUS_M = 5000;
const FILTERS = ['near', 'hours', 'phone'] as const;
type Filter = (typeof FILTERS)[number];

/** Directions: Google Maps (opens the app on phones); `geo:` is offered by the OS share sheet anyway. */
export function directionsUrl(n: Nursery) {
  return `https://www.google.com/maps/dir/?api=1&destination=${n.location.lat},${n.location.lng}`;
}

export function NurseriesScreen() {
  const t = useTranslations('act.nurseries');
  const tp = useTranslations('plan');
  const { c, f } = useCz();
  const { goal, point } = useGoalPlan();
  const { placeName } = useLocation();
  const q = useNurseries(point, RADIUS_M);
  const [filt, setFilt] = useState<Record<Filter, boolean>>({ near: false, hours: false, phone: false });
  const [pick, setPick] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [ready, setReady] = useState<MapReady | null>(null);
  const markers = useRef<Map<string, { el: HTMLElement; m: import('maplibre-gl').Marker }>>(new Map());

  const list = useMemo(
    () =>
      [...(q.data?.nurseries ?? [])]
        .sort((a, b) => a.dist_m - b.dist_m)
        .filter((n) => !(filt.near && n.dist_m > 2000) && !(filt.hours && !n.hours) && !(filt.phone && !n.phone)),
    [q.data, filt],
  );
  const place = goal?.zone_name ?? placeName ?? '';
  const sel = pick ?? list[0]?.id ?? null;

  // Numbered pins + the zone/centre dot; fit the view to them.
  useEffect(() => {
    if (!ready) return;
    const { map, ml } = ready;
    const made = new Map<string, { el: HTMLElement; m: import('maplibre-gl').Marker }>();
    const b = new ml.LngLatBounds();
    b.extend([point.lng, point.lat]);
    const me = document.createElement('div');
    me.setAttribute('aria-hidden', 'true');
    me.style.cssText = `width:16px;height:16px;border-radius:8px;background:${B.blue};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,16,32,.35)`;
    const meM = new ml.Marker({ element: me }).setLngLat([point.lng, point.lat]).addTo(map);
    list.forEach((n, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `${i + 1}. ${n.name}, ${f.dist(n.dist_m)}`);
      el.textContent = f.loc(i + 1);
      el.addEventListener('click', () => setPick(n.id));
      const m = new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([n.location.lng, n.location.lat]).addTo(map);
      made.set(n.id, { el, m });
      b.extend([n.location.lng, n.location.lat]);
    });
    markers.current = made;
    if (list.length) map.fitBounds(b, { padding: 48, maxZoom: 16, duration: 0 });
    return () => {
      meM.remove();
      made.forEach(({ m }) => m.remove());
    };
  }, [ready, list, point.lat, point.lng, f]);

  // Selected style
  useEffect(() => {
    markers.current.forEach(({ el }, id) => {
      const on = id === sel;
      el.style.cssText = `height:32px;min-width:32px;padding:0 10px;border-radius:999px;border:0;cursor:pointer;font:700 12px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 6px rgba(0,16,32,.3);background:${on ? B.lime : B.navy};color:${on ? B.limeInk : '#fff'};z-index:${on ? 2 : 1}`;
    });
  }, [sel, ready, list]);

  const select = (n: Nursery) => {
    setPick(n.id);
    ready?.map.easeTo({ center: [n.location.lng, n.location.lat], duration: 400 });
  };

  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={place ? t('sub', { dist: f.dist(RADIUS_M), place }) : undefined} />

      <GeoMap center={point} zoom={14} height={290} label={t('mapLabel', { place })} onReady={setReady} style={{ borderRadius: R.xl }} />

      <View role="group" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((k) => (
          <FilterChip key={k} label={t(`filters.${k}`)} active={filt[k]} onPress={() => setFilt((s) => ({ ...s, [k]: !s[k] }))} />
        ))}
      </View>

      {q.isLoading ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <EmptyState icon={I.pin} title={t('none')} sub={t('noneSub')} />
      ) : (
        (all ? list : list.slice(0, 10)).map((n, i) => {
          const on = sel === n.id;
          return (
            <View key={n.id} style={{ backgroundColor: c.card, borderRadius: 22, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: on ? B.lime : 'transparent' }}>
              <Tap label={n.name} selected={on} onPress={() => select(n)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, textAlign: 'start' }}>
                <View style={{ width: 52, height: 52, borderRadius: R.md, backgroundColor: on ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={17} w={700} num color={on ? B.limeInk : c.ink}>
                    {f.loc(i + 1)}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Txt size={14} w={600}>
                    {n.name}
                  </Txt>
                  <Txt size={12} dim>
                    {[f.dist(n.dist_m), n.hours].filter(Boolean).join(' · ')}
                  </Txt>
                  {n.address ? <Tag label={n.address} bg={c.limeSoft} size="xs" /> : null}
                </View>
              </Tap>
              {n.phone ? <IconBtn d={I.device} tone="card" label={t('call', { name: n.name })} href={`tel:${n.phone.replace(/\s+/g, '')}`} style={{ backgroundColor: c.soft }} /> : null}
              <IconBtn d={I.directions} tone="navy" label={t('directions', { name: n.name })} href={directionsUrl(n)} />
            </View>
          );
        })
      )}

      {list.length > 10 ? <GhostButton label={all ? tp('showLess') : tp('showAll', { n: f.loc(list.length) })} height={44} onPress={() => setAll(!all)} /> : null}
      {q.data ? <SourceChips meta={q.data.meta} /> : null}
      <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
        {t('note')}
      </Txt>
    </Screen>
  );
}
