'use client';
/**
 * S05 · Heat map (port of apps/mobile/src/screens/map/heat-map.tsx): a real OpenStreetMap
 * (MapLibre + OpenFreeMap) with the H3 heat estimate from useZones, a glass header (title, layer
 * switch, legend), floating zone labels and the ranked list (bottom sheet on phones, side panel at
 * ≥ 1024 px). Radius changes rescan (debounced). Farmer mode renders <MyFields/> (V0-7).
 */
import { cellToLatLng } from 'h3-js';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useDesktop, useDebounced } from '@/components/cz/hooks';
import { SkeletonText, ErrorState, EmptyState, SourceChips } from '@/components/cz/states';
import { B, R, SHADOW, TAB_CLEARANCE, heatColor } from '@/components/cz/tokens';
import { AccountMenuButton } from '@/components/cz/shell/account-menu';
import { Card, GlassPill, I, Icon, LightStatusBar, Screen, Seg, Spinner, Tap, Txt, View } from '@/components/cz/ui';
import { MyFields } from '@/components/farm/my-fields';
import { useGibsLayer, usePrefetchZone, useScanJob } from '@/lib/data/hooks';
import type { ZoneSummary, ZonesScan } from '@/lib/data/types';
import { useLocation } from '@/lib/location';
import { useCz } from '@/lib/prefs';
import { goPath, href } from '@/lib/routes';

import { distM, LST_STOPS } from './geo';
import { MapAttribution, MapView, type MapMarker } from './map-view-lazy';
import { RadiusControl, useRadiusLabel } from './radius-control';
import { clampRadius, useScan } from './use-scan';
import { ZoneMarker, ZoneRow } from './zone-list';

const LEGEND: [string, number][] = [
  ['<40', 30],
  ['40–55', 47],
  ['55–70', 62],
  ['70–85', 77],
  ['85+', 90],
];

type Layer = 'heat' | 'lst';

/** Element height via ResizeObserver (for map camera padding). */
function useHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

export function MapTab() {
  const { prefs } = useCz();
  return prefs.farmer_mode ? <MyFields /> : <HeatMapScreen />;
}

/** Zone containing a hex, else the nearest zone centroid. */
function zoneForHex(scan: ZonesScan, h3: string, zoneId: string): ZoneSummary | null {
  if (zoneId) return scan.zones.find((z) => z.id === zoneId) ?? null;
  if (!scan.zones.length) return null;
  const [lat, lng] = cellToLatLng(h3);
  return [...scan.zones].sort((a, b) => distM(a.centroid, { lat, lng }) - distM(b.centroid, { lat, lng }))[0];
}

export function HeatMapScreen() {
  const { c, f, prefs, ready, setPref } = useCz();
  const t = useTranslations('map');
  const rl = useRadiusLabel();
  const desktop = useDesktop();
  const { device, placeName } = useLocation();

  // Radius: local while dragging (null = follow prefs), debounced into the scan + prefs.
  const [drag, setR] = useState<number | null>(null);
  const r = drag ?? prefs.radius_m;
  const debounced = useDebounced(r, 600);
  const scan = useScan(ready ? debounced : undefined);
  const radius = clampRadius(r, scan.guest);
  useEffect(() => {
    if (drag != null && debounced !== prefs.radius_m) setPref('radius_m', clampRadius(debounced, scan.guest));
  }, [debounced, drag, prefs.radius_m, setPref, scan.guest]);

  const [layer, setLayer] = useState<Layer>('heat');
  const [open, setOpen] = useState(false);
  const [showRadius, setShowRadius] = useState(false);
  const [headRef, headH] = useHeight<HTMLDivElement>();
  const [sheetRef, sheetH] = useHeight<HTMLDivElement>();
  // Camera padding follows the collapsed sheet only (no camera jump while it's expanded).
  const [padBottom, setPadBottom] = useState(300);
  if (!open && !showRadius && sheetH && sheetH !== padBottom) setPadBottom(sheetH);

  const data = scan.data;
  const fresh = data && !scan.isPlaceholderData;
  // A cold area returns at once with `partial`; the satellite job fills it in (§7.1 scan flow).
  const partial = data?.scan.status === 'partial';
  const job = useScanJob(partial ? data?.scan.job_id : null);
  const progress = partial && job.data ? Math.round((job.data.progress ?? 0) * 100) : null;
  const scanning = (scan.isFetching && (!data || scan.isPlaceholderData)) || partial;
  const gibs = useGibsLayer();
  const zones = useMemo(() => data?.zones ?? [], [data]);
  const animateKey = fresh ? `${data.meta.generated_at}|${data.scan.radius_m}` : null;
  const center = scan.point ?? data?.scan.center ?? null;
  const ties = zones.some((z) => z.near_tie);
  // Demo script: Map → hottest zone. Warm its detail (AI "why") while the user looks at the map.
  usePrefetchZone(fresh ? (zones[0]?.id ?? null) : null);

  const markers = useMemo<MapMarker[]>(
    () =>
      zones.slice(0, 3).map((z, i) => ({
        id: z.id,
        at: z.centroid,
        anchor: i === 0 ? 'bottom' : 'center',
        offset: i === 0 ? [0, -10] : undefined,
        node: <ZoneMarker z={z} big={i === 0} />,
      })),
    [zones],
  );

  const onHex = (h3: string, zoneId: string) => {
    if (!data) return;
    const z = zoneForHex(data, h3, zoneId);
    if (z) goPath(href('S06', { id: z.id }));
  };

  const acq = data?.scan.acquired;
  const sub = data
    ? `${t('hexesR', { n: f.num(data.scan.cell_count), r: rl(data.scan.radius_m) })} · ${data.scan.method === 'landcover' ? t('estimateShort') : t('satelliteShort')}`
    : t('withinR', { r: rl(radius) });
  const dates = acq?.lst_to ? t('landsatDates', { from: f.date(acq.lst_from ?? acq.lst_to, { day: 'numeric', month: 'short' }), to: f.date(acq.lst_to, { day: 'numeric', month: 'short', year: 'numeric' }), n: f.loc(acq.lst_scenes) }) : null;
  const place = placeName ?? t('yourArea');

  /* ── shared pieces ── */
  const header = (
    <View ref={headRef} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16, end: 16, gap: 10, zIndex: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
          <Txt display size={17} color={B.white} as="h1">
            {t('title')}
          </Txt>
          <Txt size={12} color={B.white} style={{ opacity: 0.85 }} lines={1}>
            {sub}
          </Txt>
          {dates ? (
            <Txt size={11} color={B.white} style={{ opacity: 0.75 }} lines={1}>
              {dates}
            </Txt>
          ) : null}
        </View>
        <Seg<Layer>
          tone="glass"
          height={38}
          style={{ width: 180, flexShrink: 0 }}
          value={layer}
          onChange={setLayer}
          label={t('layersLabel')}
          options={[
            { label: t('layers.heat'), value: 'heat' },
            { label: t('layers.lst'), value: 'lst' },
          ]}
        />
        <AccountMenuButton tone="glass" />
      </View>
      {layer === 'heat' ? (
        <View
          role="img"
          label={t('legendA11y', { bands: LEGEND.map(([l]) => l).join(', ') })}
          style={{ flexDirection: 'row', gap: 2, padding: 6, borderRadius: 14, backgroundColor: B.glassDark, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
          {LEGEND.map(([l, s]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: heatColor(s) }} />
              <Txt size={10.5} color={B.white} num lines={1}>
                {f.loc(l)}
              </Txt>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <View
            role="img"
            label={t('lstLegendA11y')}
            style={{ flexDirection: 'row', gap: 2, padding: 6, borderRadius: 14, backgroundColor: B.glassDark, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
            {LST_STOPS.map(([c0, color]) => (
              <View key={c0} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: color }} />
                <Txt size={10.5} color={B.white} num lines={1}>
                  {f.deg(c0)}
                </Txt>
              </View>
            ))}
          </View>
          <GlassPill dark style={{ alignSelf: 'flex-start', minHeight: 30, gap: 8 }}>
            <Icon d={I.sat} size={14} color={B.lime} />
            <Txt size={11.5} color={B.white}>
              {gibs.data?.date ? t('gibsNoteDated', { date: f.date(gibs.data.date) }) : t('gibsNote')}
            </Txt>
          </GlassPill>
        </View>
      )}
      {scanning ? (
        <View aria-live="polite" style={{ alignSelf: 'center' }}>
          <GlassPill dark style={{ minHeight: 34, gap: 8 }}>
            <Spinner size={16} color={B.lime} />
            <Txt size={12.5} w={600} color={B.white}>
              {partial ? (progress != null && progress > 0 ? t('scanningSatPct', { pct: f.loc(progress) }) : t('scanningSat')) : t('scanning', { r: rl(radius) })}
            </Txt>
          </GlassPill>
        </View>
      ) : null}
    </View>
  );

  const list = (all: boolean) => {
    if (scan.error && !data) return <ErrorState compact error={scan.error} onRetry={() => void scan.refetch()} />;
    if (!data)
      return (
        <View aria-busy style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <span className="cz-skeleton" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, flexShrink: 0 }} />
              <View style={{ flex: 1 }}>
                <SkeletonText lines={2} size={12} gap={6} />
              </View>
            </View>
          ))}
        </View>
      );
    if (!zones.length) return <EmptyState title={t('empty.title')} sub={t('empty.sub')} icon={I.map} />;
    const rows = all ? zones : zones.slice(0, 3);
    return (
      <View style={{ backgroundColor: c.card, borderRadius: 22, paddingVertical: 2, paddingHorizontal: 14 }}>
        {rows.map((z, i) => (
          <ZoneRow key={z.id} z={z} last={i === rows.length - 1} />
        ))}
      </View>
    );
  };

  const count = data ? t('count', { count: zones.length, n: f.loc(zones.length) }) : '';
  const radiusChip = (
    <Tap
      label={`${t('radius')}: ${rl(radius)}`}
      onPress={() => setShowRadius((v) => !v)}
      aria-expanded={showRadius}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: c.soft, flexShrink: 0 }}>
      <Icon d={I.target} size={14} sw={2} />
      <Txt size={12.5} w={600} num>
        {rl(radius)}
      </Txt>
      <Icon d={I.chevDown} size={14} sw={2} style={{ transform: showRadius ? 'rotate(180deg)' : undefined }} />
    </Tap>
  );

  const map = center ? (
    <MapView
      label={t('mapA11y', { place })}
      center={center}
      radiusM={radius}
      hexes={data?.hexes}
      hexColor={layer === 'lst' ? 'lst' : 'score'}
      outline={data?.scan.outline}
      zones={layer === 'heat' ? data?.zones : []}
      me={device ?? center}
      gibs={layer === 'lst'}
      gibsUrl={gibs.data?.tile_url}
      animateKey={animateKey}
      scanning={scanning}
      onHex={onHex}
      markers={layer === 'heat' ? markers : []}
      padding={desktop ? { top: (headH || 120) + 60, bottom: 40, left: 40, right: 40 } : { top: (headH || 120) + 56, bottom: padBottom + 8, left: 20, right: 20 }}
      style={{ position: 'absolute', inset: 0 }}
    />
  ) : (
    <div aria-hidden className="cz-skeleton" style={{ position: 'absolute', inset: 0, backgroundColor: B.photoBg }} />
  );

  const scrim = (
    <div aria-hidden style={{ position: 'absolute', top: 0, insetInline: 0, height: 'calc(env(safe-area-inset-top, 0px) + 150px)', background: 'linear-gradient(to bottom, rgba(0,16,32,0.7), rgba(0,16,32,0))', pointerEvents: 'none', zIndex: 1 }} />
  );

  if (desktop) {
    return (
      <Screen tab wide padded={false} bleed gap={0} style={{ height: '100dvh', minHeight: 0, paddingBottom: 0, flexDirection: 'row', overflow: 'hidden' }}>
        <LightStatusBar />
        <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {map}
          {scrim}
          {header}
          <MapAttribution gibs={layer === 'lst'} style={{ position: 'absolute', bottom: 10, start: 10, zIndex: 2 }} />
        </View>
        <View style={{ width: 400, flexShrink: 0, backgroundColor: c.bg, borderInlineStartWidth: 1, borderInlineStartColor: c.line, overflowY: 'auto', padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Txt display size={15} as="h2" style={{ flexShrink: 1 }}>
              {t('ranked')}
            </Txt>
            <Txt size={12} dim>
              {count}
            </Txt>
          </View>
          <Card pad={16}>
            <RadiusControl value={radius} onChange={setR} guest={scan.guest} compact />
          </Card>
          {list(true)}
          {ties ? (
            <Txt size={11.5} dim>
              {t('tieNote')}
            </Txt>
          ) : null}
          <Txt size={11.5} dim>
            {t('estimateNote')}
          </Txt>
          <SourceChips meta={data?.meta} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen tab wide padded={false} bleed gap={0} style={{ height: '100dvh', minHeight: 0, paddingBottom: 0, overflow: 'hidden', backgroundColor: B.photoBg }}>
      <LightStatusBar />
      {map}
      {scrim}
      {header}

      {/* Bottom sheet, above the floating tab bar */}
      <View
        ref={sheetRef}
        style={[
          {
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: 0,
            zIndex: 3,
            backgroundColor: c.bg,
            borderTopLeftRadius: R.xxl,
            borderTopRightRadius: R.xxl,
            paddingTop: 6,
            paddingHorizontal: 16,
            paddingBottom: `calc(${TAB_CLEARANCE - 6}px + max(0px, env(safe-area-inset-bottom, 0px) - 12px))`,
            gap: 10,
            maxHeight: '78dvh',
          },
          SHADOW.sheet,
        ]}>
        <MapAttribution gibs={layer === 'lst'} style={{ position: 'absolute', top: -28, start: 10 }} />
        <Tap
          label={open ? t('showLess') : t('showAll', { n: f.loc(zones.length) })}
          aria-expanded={open}
          onPress={() => setOpen((v) => !v)}
          style={{ alignSelf: 'center', width: 80, height: 22, alignItems: 'center', justifyContent: 'center' }}>
          <span aria-hidden style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
        </Tap>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, gap: 8 }}>
          <View style={{ flexShrink: 1, minWidth: 0, gap: 1 }}>
            <Txt display size={14} as="h2">
              {t('ranked')}
            </Txt>
            {count ? (
              zones.length > 3 ? (
                <Tap role="button" label={open ? t('showLess') : t('showAll', { n: f.loc(zones.length) })} aria-expanded={open} onPress={() => setOpen((v) => !v)} style={{ alignSelf: 'flex-start', minHeight: 24, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Txt size={12} dim>
                    {count}
                  </Txt>
                  <Txt size={12} w={600} color={c.leaf}>
                    {open ? t('showLess') : t('showAll', { n: f.loc(zones.length) })}
                  </Txt>
                </Tap>
              ) : (
                <Txt size={12} dim>
                  {count}
                </Txt>
              )
            ) : null}
          </View>
          {radiusChip}
        </View>
        <View style={{ gap: 10, overflowY: open ? 'auto' : 'visible', minHeight: 0, flexShrink: 1 }}>
          {showRadius ? (
            <Card pad={14}>
              <RadiusControl value={radius} onChange={setR} guest={scan.guest} compact />
            </Card>
          ) : null}
          {list(open)}
          {ties ? (
            <Txt size={11} dim style={{ paddingHorizontal: 4 }}>
              {t('tieNote')}
            </Txt>
          ) : null}
          {open ? (
            <View style={{ gap: 8, paddingHorizontal: 4 }}>
              <Txt size={11} dim>
                {t('estimateNote')}
              </Txt>
              <SourceChips meta={data?.meta} />
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
